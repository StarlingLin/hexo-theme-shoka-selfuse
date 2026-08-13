/* global hexo */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { load } = require('cheerio');
const subsetFont = require('subset-font');

const SCRIPT_VERSION = 2;
const HASH_TOKEN = '__SHOKA_FONT_SUBSET_HASH__';
const CACHE_DIRECTORY = path.join(
  hexo.base_dir,
  'node_modules',
  '.cache',
  'shoka-font-subset'
);
const SOURCE_DIRECTORY = path.join(hexo.theme_dir, 'font-src');

const FONT_DEFINITIONS = [
  {
    family: 'Mulish',
    style: 'normal',
    weight: '300 700',
    source: 'Mulish-Variable.ttf',
    output: 'mulish-normal.woff2',
    textScope: 'global',
    variationAxes: {
      wght: { min: 300, max: 700, default: 400 }
    }
  },
  {
    family: 'Mulish',
    style: 'italic',
    weight: '300 700',
    source: 'Mulish-Italic-Variable.ttf',
    output: 'mulish-italic.woff2',
    textScope: 'global',
    variationAxes: {
      wght: { min: 300, max: 700, default: 400 }
    }
  },
  {
    family: 'Fredericka the Great',
    style: 'normal',
    weight: '400',
    source: 'FrederickaTheGreat-Regular.ttf',
    output: 'fredericka-the-great-regular.woff2',
    textScope: 'logo'
  },
  {
    family: 'Noto Serif JP',
    style: 'normal',
    weight: '300 700',
    source: 'NotoSerifJP-Variable.ttf',
    output: 'noto-serif-jp.woff2',
    textScope: 'serif',
    variationAxes: {
      wght: { min: 300, max: 700, default: 400 }
    }
  },
  {
    family: 'Noto Serif SC',
    style: 'normal',
    weight: '300 700',
    source: 'NotoSerifSC-Variable.ttf',
    output: 'noto-serif-sc.woff2',
    textScope: 'serif',
    variationAxes: {
      wght: { min: 300, max: 700, default: 400 }
    }
  },
  {
    family: 'Inconsolata',
    style: 'normal',
    weight: '300 700',
    source: 'Inconsolata-Variable.ttf',
    output: 'inconsolata.woff2',
    textScope: 'code',
    variationAxes: {
      wdth: 100,
      wght: { min: 300, max: 700, default: 400 }
    }
  }
];

const SAFE_LATIN = Array.from(
  { length: 95 },
  (_, index) => String.fromCharCode(index + 32)
).join('');
const SAFE_CJK_PUNCTUATION = '　，。！？：；、（）［］【】《》〈〉“”‘’—–…·￥％℃°±×÷→←↑↓✓✗';

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

function appendText(characterSet, text) {
  for (const character of String(text || '').normalize('NFC')) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x20 && codePoint !== 0x7f) {
      characterSet.add(character);
    }
  }
}

function collectText(htmlBuffers) {
  const scopes = {
    global: new Set(SAFE_LATIN + SAFE_CJK_PUNCTUATION),
    logo: new Set(SAFE_LATIN),
    serif: new Set(SAFE_CJK_PUNCTUATION),
    code: new Set(SAFE_LATIN)
  };

  for (const buffer of htmlBuffers) {
    const $ = load(buffer.toString('utf8'));
    $('script, style, template, noscript').remove();
    appendText(scopes.global, $.root().text());

    $('[alt], [title], [placeholder], [aria-label], [value]').each((_, element) => {
      const attributes = element.attribs || {};
      appendText(scopes.global, [
        attributes.alt,
        attributes.title,
        attributes.placeholder,
        attributes['aria-label'],
        attributes.value
      ].filter(Boolean).join(''));
    });

    appendText(scopes.logo, $('.artboard').text());

    // Noto Serif SC is used for headings and Noto Serif JP is used for
    // .title headings. Give both the union so either font remains a complete
    // fallback for a CJK glyph missing from the other family.
    appendText(scopes.serif, $('h1, h2, h3, h4, h5, h6, .links .title').text());

    appendText(scopes.code, $('pre, code, figure.highlight, .label').text());
  }

  return Object.fromEntries(Object.entries(scopes).map(([scope, characters]) => {
    const text = [...characters]
      .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
      .join('');
    return [scope, text];
  }));
}

function buildHash(textScopes) {
  const hash = crypto.createHash('sha256');
  hash.update(`shoka-font-subset-v${SCRIPT_VERSION}\0`);
  hash.update(require('subset-font/package.json').version);
  hash.update('\0');
  hash.update(JSON.stringify(textScopes));

  for (const font of FONT_DEFINITIONS) {
    hash.update('\0');
    hash.update(JSON.stringify(font));
    hash.update(fs.readFileSync(path.join(SOURCE_DIRECTORY, font.source)));
  }

  return hash.digest('hex');
}

function buildCss(shortHash) {
  return FONT_DEFINITIONS.map(font => {
    return [
      '@font-face {',
      `  font-family: "${font.family}";`,
      `  font-style: ${font.style};`,
      `  font-weight: ${font.weight};`,
      '  font-display: swap;',
      `  src: url("../fonts/subset/${font.output}?v=${shortHash}") format("woff2");`,
      '}'
    ].join('\n');
  }).join('\n\n') + '\n';
}

function validateSources() {
  const missing = FONT_DEFINITIONS
    .map(font => font.source)
    .filter(fileName => !fs.existsSync(path.join(SOURCE_DIRECTORY, fileName)));

  if (missing.length) {
    throw new Error(`Missing source font files: ${missing.join(', ')}`);
  }
}

async function createSubsets(textScopes, hash) {
  const shortHash = hash.slice(0, 12);
  const cacheFiles = new Map();
  let totalBytes = 0;

  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });

  for (const font of FONT_DEFINITIONS) {
    const sourcePath = path.join(SOURCE_DIRECTORY, font.source);
    const cachePath = path.join(CACHE_DIRECTORY, font.output);
    const options = { targetFormat: 'woff2' };
    if (font.variationAxes) {
      options.variationAxes = font.variationAxes;
    }

    const subsetText = textScopes[font.textScope];
    const subset = await subsetFont(fs.readFileSync(sourcePath), subsetText, options);
    fs.writeFileSync(cachePath, subset);
    cacheFiles.set(font.output, subset);
    totalBytes += subset.length;
    hexo.log.info(
      '[font-subset] %s: %s KB',
      font.family + (font.style === 'italic' ? ' italic' : ''),
      (subset.length / 1024).toFixed(1)
    );
  }

  const css = buildCss(shortHash);
  fs.writeFileSync(path.join(CACHE_DIRECTORY, 'fonts-subset.css'), css, 'utf8');
  fs.writeFileSync(
    path.join(CACHE_DIRECTORY, 'manifest.json'),
    JSON.stringify({
      hash,
      characters: Object.fromEntries(Object.entries(textScopes).map(([scope, text]) => {
        return [scope, [...text].length];
      })),
      totalBytes
    }, null, 2),
    'utf8'
  );

  return { cacheFiles, css, totalBytes, cacheHit: false };
}

function readCache(hash) {
  const manifestPath = path.join(CACHE_DIRECTORY, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.hash !== hash) return null;

    const cacheFiles = new Map();
    for (const font of FONT_DEFINITIONS) {
      const cachePath = path.join(CACHE_DIRECTORY, font.output);
      if (!fs.existsSync(cachePath)) return null;
      cacheFiles.set(font.output, fs.readFileSync(cachePath));
    }

    const cssPath = path.join(CACHE_DIRECTORY, 'fonts-subset.css');
    if (!fs.existsSync(cssPath)) return null;

    return {
      cacheFiles,
      css: fs.readFileSync(cssPath, 'utf8'),
      totalBytes: manifest.totalBytes,
      cacheHit: true
    };
  } catch (error) {
    hexo.log.warn('[font-subset] Ignoring invalid cache: %s', error.message);
    return null;
  }
}

hexo.extend.filter.register('after_generate', async function () {
  if (!hexo.theme.config.font || !hexo.theme.config.font.enable) return;

  validateSources();

  const htmlRoutes = hexo.route.list().filter(route => route.endsWith('.html'));
  if (!htmlRoutes.length) {
    throw new Error('[font-subset] No generated HTML routes were found.');
  }

  const routeBuffers = new Map();
  for (const route of htmlRoutes) {
    routeBuffers.set(route, await streamToBuffer(hexo.route.get(route)));
  }

  const textScopes = collectText(routeBuffers.values());
  const hash = buildHash(textScopes);
  const shortHash = hash.slice(0, 12);
  const startedAt = Date.now();
  const result = readCache(hash) || await createSubsets(textScopes, hash);

  for (const [fileName, buffer] of result.cacheFiles) {
    hexo.route.set(`fonts/subset/${fileName}`, buffer);
  }
  hexo.route.set('css/fonts-subset.css', result.css);

  let linkedPages = 0;
  for (const [route, buffer] of routeBuffers) {
    const html = buffer.toString('utf8');
    if (html.includes(HASH_TOKEN)) {
      linkedPages++;
      hexo.route.set(route, html.split(HASH_TOKEN).join(shortHash));
    } else {
      hexo.route.set(route, buffer);
    }
  }

  if (linkedPages !== htmlRoutes.length) {
    hexo.log.warn(
      '[font-subset] Font stylesheet token found in %d/%d HTML pages.',
      linkedPages,
      htmlRoutes.length
    );
  }

  hexo.log.info(
    '[font-subset] %d global characters, %d pages, %s, %s KB in %d ms',
    [...textScopes.global].length,
    htmlRoutes.length,
    result.cacheHit ? 'cache hit' : 'generated',
    (result.totalBytes / 1024).toFixed(1),
    Date.now() - startedAt
  );
});
