/* global hexo */

/*
{% links %}
- site: #main title
  owner: #alternate title for image tooltip (nullable)
  url: #link of site
  desc: #description (nullable)
  image: #icon image (nullable)
  color: #block color (nullable)
{% endlinks %}

{% linksfile [path] %}
*/

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function linkGrid(args, content) {
  const theme = hexo.theme.config;

  if(!args[0] && !content) {
    return
  }

  if(args[0]) {
    const filepath = path.join(hexo.source_dir, args[0]);
    if(fs.existsSync(filepath)) {
      content = fs.readFileSync(filepath);
    }
  }

  if (!content) {
    return
  }

  const list = yaml.load(content);

  var result = ''

  list.forEach(item => {
    if(!item.url || !item.site) {
      return;
    }

    var item_image = item.image || theme.images + '/404.png';

    if (!item_image.startsWith('//') && !item_image.startsWith('http')) {
      item_image = theme.statics + item_image;
    }

    item.color = item.color? ` style="--block-color:${item.color};"` : '';

    result += `<div class="item" title="${item.owner || item.site}"${item.color}>`;

    // Friend links always keep their original URL. The custom attribute is
    // also listed in SafeGo's ignore_attrs, so this remains true if the tag is
    // reused outside /friends/.
    result += `<a href="${item.url}" target="_blank" rel="external nofollow noopener noreferrer" data-safego-ignore class="image" data-background-image="${item_image}"></a>
        <div class="info">
        <a href="${item.url}" target="_blank" rel="external nofollow noopener noreferrer" data-safego-ignore class="title">${item.site}</a>
        <p class="desc">${item.desc || item.url}</p>
        </div></div>`;
  });

  return `<div class="links">${result}</div>`;

}

hexo.extend.tag.register('links', linkGrid, {ends: true});
hexo.extend.tag.register('linksfile', linkGrid, {ends: false, async: true})
