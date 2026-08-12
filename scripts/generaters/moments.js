'use strict';

const fs = require('hexo-fs');
const path = require('path');
const pagination = require('hexo-pagination');
const { parse: parseFrontMatter } = require('hexo-front-matter');

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i;

const toPosixPath = value => value.replace(/\\/g, '/');

const splitUrlSuffix = value => {
  const index = value.search(/[?#]/);
  return index === -1
    ? { pathname: value, suffix: '' }
    : { pathname: value.slice(0, index), suffix: value.slice(index) };
};

const resolveMomentAsset = (value, source) => {
  if (EXTERNAL_URL.test(value)) return value;

  const { pathname, suffix } = splitUrlSuffix(value);
  const relativePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), toPosixPath(pathname))
  );

  if (relativePath === '..' || relativePath.startsWith('../')) {
    throw new Error(`Local image path must stay inside source/_moments: ${value}`);
  }

  return `moments/assets/${relativePath}${suffix}`;
};

const normalizeImages = (images, source) => {
  if (typeof images === 'undefined' || images === null) return [];
  if (!Array.isArray(images)) {
    throw new TypeError(`"images" must be a YAML list in source/_moments/${source}`);
  }

  return images.map(image => {
    if (typeof image !== 'string' || !image.trim()) {
      throw new TypeError(`Every item in "images" must be a non-empty string in source/_moments/${source}`);
    }
    return resolveMomentAsset(image.trim(), source);
  });
};

const resolveContentImages = (content, source, root) => content.replace(
  /(<img\b[^>]*\s(?:data-src|src)=["'])([^"']+)(["'])/gi,
  (match, before, image, after) => {
    if (EXTERNAL_URL.test(image)) return match;
    const asset = resolveMomentAsset(image, source);
    return before + path.posix.join(root || '/', asset) + after;
  }
);

const createEmptyPage = data => ({
  path: 'moments/',
  layout: ['moments'],
  data: Object.assign({
    base: 'moments/',
    total: 1,
    current: 1,
    current_url: 'moments/',
    posts: [],
    prev: 0,
    prev_link: '',
    next: 0,
    next_link: ''
  }, data)
});

hexo.extend.generator.register('moments', function() {
  const sourceDir = path.join(hexo.source_dir, '_moments');
  const themeConfig = hexo.theme.config.moments || {};
  const paginationDir = hexo.config.pagination_dir || 'page';
  const configuredPerPage = Number(themeConfig.per_page);
  const perPage = Number.isFinite(configuredPerPage) && configuredPerPage >= 0
    ? configuredPerPage
    : 10;
  const pageData = {
    type: 'moments',
    title: themeConfig.title || '动态',
    description: themeConfig.description || '记录生活的基米',
    comment: false,
    comments: false,
    fancybox: true
  };

  if (!fs.existsSync(sourceDir)) return [createEmptyPage(pageData)];

  const files = fs.listDirSync(sourceDir);
  const markdownFiles = files.filter(file => MARKDOWN_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const assets = files
    .filter(file => !MARKDOWN_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .filter(file => !path.basename(file).startsWith('.'))
    .map(file => ({
      path: `moments/assets/${toPosixPath(file)}`,
      data: () => fs.createReadStream(path.join(sourceDir, file))
    }));

  const renderMoments = markdownFiles.map((file, index) => {
    const source = toPosixPath(file);
    const fullSource = path.join(sourceDir, file);
    const raw = fs.readFileSync(fullSource);
    const frontMatter = parseFrontMatter(raw);

    if (!frontMatter.date) {
      if (/^date:\S/m.test(raw)) {
        throw new Error(`Invalid frontmatter in source/_moments/${source}: add a space after "date:"`);
      }
      throw new Error(`Missing required "date" in source/_moments/${source}`);
    }

    const date = frontMatter.date instanceof Date
      ? frontMatter.date
      : new Date(frontMatter.date);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid "date" in source/_moments/${source}`);
    }

    const images = normalizeImages(frontMatter.images, source);

    return hexo.post.render(fullSource, {
      content: frontMatter._content || '',
      source: `_moments/${source}`,
      date,
      layout: 'moments',
      comment: false,
      comments: false,
      fancybox: true
    }).then(rendered => ({
      id: `moment-${index + 1}`,
      source,
      date,
      images,
      content: resolveContentImages(rendered.content || '', source, hexo.config.root)
    }));
  });

  return Promise.all(renderMoments).then(moments => {
    moments.sort((a, b) => b.date.getTime() - a.date.getTime());

    const pages = moments.length
      ? pagination('moments/', moments, {
        perPage,
        layout: ['moments'],
        format: `${paginationDir}/%d/`,
        data: pageData
      })
      : [createEmptyPage(pageData)];

    return pages.concat(assets);
  });
});
