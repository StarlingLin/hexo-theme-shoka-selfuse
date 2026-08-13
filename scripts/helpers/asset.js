/* global hexo */

'use strict';
const { htmlTag, url_for } = require('hexo-util');
const theme_env = require('../../package.json');

hexo.extend.helper.register('hexo_env', function (type) {
  return this.env[type]
})

hexo.extend.helper.register('theme_env', function (type) {
  return theme_env[type]
})

hexo.extend.helper.register('_vendor_font', () => {
  const config = hexo.theme.config.font;

  if (!config || !config.enable) return '';

  const fontDisplay = '&display=swap';
  const fontSubset = '&subset=latin,latin-ext';
  const fontStyles = ':300,300italic,400,400italic,700,700italic';
  const fontHost = '//fonts.googleapis.com';

  //Get a font list from config
  let fontFamilies = ['global', 'logo', 'title', 'headings', 'posts', 'codes'].map(item => {
    if (config[item] && config[item].family && config[item].external) {
      return config[item].family + fontStyles;
    }
    return '';
  });

  fontFamilies = fontFamilies.filter(item => item !== '');
  fontFamilies = [...new Set(fontFamilies)];
  fontFamilies = fontFamilies.join('|');

  // Merge extra parameters to the final processed font string
  return fontFamilies ? htmlTag('link', { rel: 'stylesheet', href: `${fontHost}/css?family=${fontFamilies.concat(fontDisplay, fontSubset)}` }) : '';
});


hexo.extend.helper.register('_vendor_js', () => {
  const config = hexo.theme.config.vendors.js;

  if (!config) return '';

  //Get a font list from config
  // Search vendors are loaded only after the visitor opens the search panel.
  let vendorJs = ['pace', 'pjax', 'anime', 'lazyload', 'quicklink', 'echarts'].map(item => {
    if (config[item]) {
      return config[item];
    }
    return '';
  });

  vendorJs = vendorJs.filter(item => item !== '');
  vendorJs = [...new Set(vendorJs)];
  vendorJs = vendorJs.join(',');

  let result = vendorJs ? `<script src="//cdn.jsdelivr.net/combine/${vendorJs}"></script>` : '';

  return vendorJs ? htmlTag('script', { src: `//cdn.jsdelivr.net/combine/${vendorJs}` }, '') : '';
});

const resolveVendorUrl = function(source, config, context) {
  if (/^(?:https?:)?\/\//.test(source)) return source;

  const join = (base, path) => `${base.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;

  if (source.startsWith('npm/')) {
    return join(config.npm || '//cdn.jsdelivr.net/npm/', source.slice(4));
  }
  if (source.startsWith('gh/')) {
    return join(config.github || '//cdn.jsdelivr.net/gh/', source.slice(3));
  }
  if (source.startsWith('combine/')) {
    return join(config.combine || '//cdn.jsdelivr.net/', source);
  }

  return url_for.call(context, source);
};

hexo.extend.helper.register('_list_vendor_js', () => {
  const config = hexo.theme.config.vendorsList;
  return config && Array.isArray(config.js) ? config.js : [];
});

hexo.extend.helper.register('_adv_vendor_js', function(name) {
  const config = hexo.theme.config.advVendors || {};
  const entry = config.js && config.js[name];
  if (!entry) return '';

  const options = typeof entry === 'string' ? { src: entry } : entry;
  if (!options.src) return '';

  const attr = {
    src: resolveVendorUrl(options.src, config, this)
  };

  if (options.defer) attr.defer = true;
  if (options.async) attr.async = true;
  if (options['data-pjax']) attr['data-pjax'] = true;
  if (options.integrity) {
    attr.integrity = options.integrity;
    attr.crossorigin = options.crossorigin || 'anonymous';
  }
  if (options.referrerpolicy) attr.referrerpolicy = options.referrerpolicy;

  return htmlTag('script', attr, '');
});

hexo.extend.helper.register('_css', function(...urls) {
  const { statics, css } = hexo.theme.config;

  return urls.map(url => htmlTag('link', { rel: 'stylesheet', href: url_for.call(this, `${statics}${css}/${url}?v=${theme_env['version']}`) })).join('');
});


hexo.extend.helper.register('_js', function(...urls) {
  const { statics, js } = hexo.theme.config;

  return urls.map(url => htmlTag('script', { src: url_for.call(this, `${statics}${js}/${url}?v=${theme_env['version']}`) }, '')).join('');
});

hexo.extend.helper.register('_defer_js', function(...urls) {
  const { statics, js } = hexo.theme.config;

  return urls.map(url => htmlTag('script', {
    src: url_for.call(this, `${statics}${js}/${url}?v=${theme_env['version']}`),
    defer: true
  }, '')).join('');
});
