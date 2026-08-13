/* global hexo */

'use strict';

const path = require('path');

const REMOTE_DIMENSIONS = new Map([
  ['https://ghchart.rshah.org/StarlingLin', { width: 663, height: 104 }],
  ['https://img-blog.csdnimg.cn/6915c771c2734b958176d15766af9850.png', { width: 851, height: 1014 }],
  ['https://img-blog.csdnimg.cn/ff1c0f2f75c64fcb9418258f14bd7507.jpeg', { width: 500, height: 702 }]
]);

const IMAGE_SOURCE = /\s(?:data-src|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const WIDTH_ATTRIBUTE = /\swidth\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const HEIGHT_ATTRIBUTE = /\sheight\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const EXTERNAL_SOURCE = /^(?:[a-z][a-z\d+.-]*:|\/\/|data:|blob:)/i;

const validDimensions = (width, height) => (
  Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
);

const dimensions = (width, height) => (
  validDimensions(width, height) ? { width, height } : null
);

function readPng(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return dimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readGif(buffer) {
  if (buffer.length < 10 || !/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return null;
  return dimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function readJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ]);
  let offset = 2;
  let orientation = 1;
  let result = null;

  const readExifOrientation = payload => {
    if (payload + 14 > buffer.length || buffer.toString('ascii', payload, payload + 6) !== 'Exif\0\0') return null;
    const tiff = payload + 6;
    const byteOrder = buffer.toString('ascii', tiff, tiff + 2);
    if (byteOrder !== 'II' && byteOrder !== 'MM') return null;
    const littleEndian = byteOrder === 'II';
    const read16 = position => littleEndian ? buffer.readUInt16LE(position) : buffer.readUInt16BE(position);
    const read32 = position => littleEndian ? buffer.readUInt32LE(position) : buffer.readUInt32BE(position);
    if (read16(tiff + 2) !== 42) return null;

    const directory = tiff + read32(tiff + 4);
    if (directory + 2 > buffer.length) return null;
    const entries = read16(directory);
    for (let index = 0; index < entries; index++) {
      const entry = directory + 2 + index * 12;
      if (entry + 12 > buffer.length) break;
      if (read16(entry) === 0x0112 && read16(entry + 2) === 3 && read32(entry + 4) === 1) {
        return read16(entry + 8);
      }
    }
    return null;
  };

  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;

    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (marker === 0xe1) orientation = readExifOrientation(offset + 2) || orientation;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      result = dimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += segmentLength;
  }
  if (result && orientation >= 5 && orientation <= 8) {
    return { width: result.height, height: result.width };
  }
  return result;
}

function readAvif(buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 4, 8) !== 'ftyp') return null;

  let largest = null;
  for (let offset = 4; offset + 16 <= buffer.length; offset++) {
    if (buffer.toString('ascii', offset, offset + 4) !== 'ispe') continue;
    const candidate = dimensions(buffer.readUInt32BE(offset + 8), buffer.readUInt32BE(offset + 12));
    if (candidate && (!largest || candidate.width * candidate.height > largest.width * largest.height)) {
      largest = candidate;
    }
  }
  return largest;
}

function readSvg(buffer) {
  const source = buffer.toString('utf8', 0, Math.min(buffer.length, 65536));
  const svg = source.match(/<svg\b[^>]*>/i);
  if (!svg) return null;

  const attribute = name => {
    const match = svg[0].match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match && (match[1] || match[2] || match[3]);
  };
  const numeric = value => {
    const match = typeof value === 'string' && value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
    return match ? Math.round(Number(match[1])) : null;
  };

  const width = numeric(attribute('width'));
  const height = numeric(attribute('height'));
  if (validDimensions(width, height)) return { width, height };

  const viewBox = attribute('viewBox');
  if (!viewBox) return null;
  const values = viewBox.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4) return null;
  return dimensions(Math.round(values[2]), Math.round(values[3]));
}

function readImageDimensions(buffer) {
  return readPng(buffer) || readGif(buffer) || readJpeg(buffer) || readAvif(buffer) || readSvg(buffer);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function attributeValue(tag, pattern) {
  const match = tag.match(pattern);
  return match && (match[1] || match[2] || match[3]);
}

function numericAttribute(tag, pattern) {
  const value = attributeValue(tag, pattern);
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function isSidebarAvatar(tag, source) {
  const pathname = source && source.split(/[?#]/, 1)[0];
  return pathname === '/images/avatar.jpg' && /\sitemprop\s*=\s*["']image["']/i.test(tag);
}

function resolveImageRoute(htmlRoute, source, root) {
  if (!source || EXTERNAL_SOURCE.test(source) || source.startsWith('#')) return null;

  let pathname = source.split(/[?#]/, 1)[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  if (pathname.startsWith('/')) {
    const siteRoot = root && root !== '/' ? `/${root.replace(/^\/+|\/+$/g, '')}/` : '/';
    if (siteRoot !== '/' && pathname.startsWith(siteRoot)) pathname = pathname.slice(siteRoot.length);
    else pathname = pathname.replace(/^\/+/, '');
  } else {
    pathname = path.posix.join(path.posix.dirname(htmlRoute), pathname);
  }

  const route = path.posix.normalize(pathname).replace(/^\.\//, '');
  return route === '..' || route.startsWith('../') ? null : route;
}

function addDimensions(tag, intrinsic) {
  const hasWidth = WIDTH_ATTRIBUTE.test(tag);
  const hasHeight = HEIGHT_ATTRIBUTE.test(tag);
  if (hasWidth && hasHeight) return tag;

  let width = intrinsic.width;
  let height = intrinsic.height;
  const existingWidth = numericAttribute(tag, WIDTH_ATTRIBUTE);
  const existingHeight = numericAttribute(tag, HEIGHT_ATTRIBUTE);

  if (hasWidth) {
    if (!existingWidth) return tag;
    width = existingWidth;
    height = Math.max(1, Math.round(existingWidth * intrinsic.height / intrinsic.width));
  } else if (hasHeight) {
    if (!existingHeight) return tag;
    height = existingHeight;
    width = Math.max(1, Math.round(existingHeight * intrinsic.width / intrinsic.height));
  }

  const additions = [];
  if (!hasWidth) additions.push(`width="${width}"`);
  if (!hasHeight) additions.push(`height="${height}"`);
  if (!additions.length) return tag;

  const closing = tag.endsWith('/>') ? '/>' : '>';
  return `${tag.slice(0, -closing.length)} ${additions.join(' ')}${closing}`;
}

function registerImageDimensionFilter(hexoInstance) {
  hexoInstance.extend.filter.register('after_generate', async function () {
    const routes = new Set(hexoInstance.route.list());
    const htmlRoutes = [...routes].filter(route => route.endsWith('.html'));
    const imageCache = new Map();
    let imageTags = 0;
    let sizedTags = 0;
    let unresolvedTags = 0;
    let skippedTags = 0;

    const routeDimensions = async route => {
      if (imageCache.has(route)) return imageCache.get(route);
      if (!routes.has(route)) {
        imageCache.set(route, null);
        return null;
      }
      try {
        const result = readImageDimensions(await streamToBuffer(hexoInstance.route.get(route)));
        imageCache.set(route, result);
        return result;
      } catch (error) {
        imageCache.set(route, null);
        return null;
      }
    };

    for (const htmlRoute of htmlRoutes) {
      const buffer = await streamToBuffer(hexoInstance.route.get(htmlRoute));
      const html = buffer.toString('utf8');
      const matches = [...html.matchAll(/<img\b[^>]*>/gi)];
      if (!matches.length) continue;

      let cursor = 0;
      let changed = false;
      const output = [];
      for (const match of matches) {
        const tag = match[0];
        const source = attributeValue(tag, IMAGE_SOURCE);
        imageTags++;

        const skipDimensions = isSidebarAvatar(tag, source);
        let intrinsic = null;
        if (skipDimensions) {
          skippedTags++;
        } else {
          intrinsic = REMOTE_DIMENSIONS.get(source);
          if (!intrinsic) {
            const imageRoute = resolveImageRoute(htmlRoute, source, hexoInstance.config.root);
            if (imageRoute) intrinsic = await routeDimensions(imageRoute);
          }
        }

        let replacement = tag;
        if (intrinsic) replacement = addDimensions(tag, intrinsic);
        if (replacement !== tag) sizedTags++;
        else if (!skipDimensions && !(WIDTH_ATTRIBUTE.test(tag) && HEIGHT_ATTRIBUTE.test(tag))) unresolvedTags++;

        output.push(html.slice(cursor, match.index), replacement);
        cursor = match.index + tag.length;
        changed = changed || replacement !== tag;
      }

      if (changed) {
        output.push(html.slice(cursor));
        hexoInstance.route.set(htmlRoute, output.join(''));
      }
    }

    hexoInstance.log.info(
      '[image-dimensions] Added dimensions to %d/%d image tags; %d sidebar avatars skipped; %d unresolved.',
      sizedTags,
      imageTags,
      skippedTags,
      unresolvedTags
    );
  }, 20);
}

if (typeof hexo !== 'undefined') registerImageDimensionFilter(hexo);

module.exports = { readImageDimensions, addDimensions, resolveImageRoute };
