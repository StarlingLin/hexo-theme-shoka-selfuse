const contextMenuIcon = function(paths) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">' + paths + '</svg>';
}

const contextMenuIcons = {
  back: contextMenuIcon('<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>'),
  forward: contextMenuIcon('<path d="m9 18 6-6-6-6"/><path d="M4 12h11"/>'),
  refresh: contextMenuIcon('<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>'),
  home: contextMenuIcon('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'),
  copy: contextMenuIcon('<rect x="8" y="8" width="11" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/>'),
  open: contextMenuIcon('<path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>'),
  archive: contextMenuIcon('<path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3z"/><path d="M9 11h6"/>'),
  folder: contextMenuIcon('<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  tag: contextMenuIcon('<path d="M10 3 7 21"/><path d="M17 3l-3 18"/><path d="M4 9h16"/><path d="M3 15h16"/>'),
  comment: contextMenuIcon('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4.5A8.5 8.5 0 1 1 21 11.5z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
  print: contextMenuIcon('<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>')
};

var contextMenuElement = null;
var contextMenuState = {
  link: null,
  selection: '',
  point: null
};

const contextMenuRootUrl = function(path) {
  var root = CONFIG.root || '/';
  return root.replace(/\/?$/, '/') + String(path || '').replace(/^\/+/, '');
}

const contextMenuClose = function() {
  if(!contextMenuElement || contextMenuElement.hidden)
    return;

  contextMenuElement.classList.remove('is-visible');
  contextMenuElement.setAttribute('aria-hidden', 'true');
  contextMenuElement.hidden = true;
  contextMenuState.link = null;
  contextMenuState.selection = '';
  contextMenuState.point = null;
}

const contextMenuCopy = function(text, message) {
  var done = function(success) {
    showtip(success ? message : '复制失败，请手动复制');
  };

  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function() {
      done(true);
    }).catch(function() {
      clipBoard(text, done);
    });
  } else {
    clipBoard(text, done);
  }
}

const contextMenuPosition = function(x, y) {
  var gap = 8;
  var rect = contextMenuElement.getBoundingClientRect();
  var left = Math.max(gap, Math.min(x, window.innerWidth - rect.width - gap));
  var top = Math.max(gap, Math.min(y, window.innerHeight - rect.height - gap));

  contextMenuElement.style.left = left + 'px';
  contextMenuElement.style.top = top + 'px';
}

const contextMenuOpen = function(event) {
  var target = event.target && event.target.nodeType === 1 ? event.target : event.target.parentElement;
  var editable = target && target.closest('input, textarea, select, [contenteditable="true"]');

  // Shift + right click, and editable controls, retain the native browser menu.
  if(event.shiftKey || editable || event.defaultPrevented)
    return;

  event.preventDefault();

  if(target && contextMenuElement.contains(target))
    return;

  contextMenuState.link = target ? target.closest('a[href]') : null;
  // Some browsers briefly collapse a selection while dispatching contextmenu.
  // Keep the value captured on right-button pointerdown as a fallback.
  var currentSelection = String(window.getSelection ? window.getSelection().toString() : '').trim();
  contextMenuState.selection = currentSelection || contextMenuState.selection;

  var selectionItem = contextMenuElement.querySelector('[data-action="copy-selection"]');
  var linkItems = contextMenuElement.querySelectorAll('[data-link-item]');
  var hasDynamicItem = Boolean(contextMenuState.selection || contextMenuState.link);

  selectionItem.hidden = !contextMenuState.selection;
  Array.prototype.forEach.call(linkItems, function(item) {
    item.hidden = !contextMenuState.link;
  });
  contextMenuElement.querySelector('.context-menu-dynamic-divider').hidden = !hasDynamicItem;

  contextMenuElement.hidden = false;
  contextMenuElement.setAttribute('aria-hidden', 'false');
  contextMenuElement.classList.remove('is-visible');
  contextMenuElement.style.left = '0';
  contextMenuElement.style.top = '0';

  var x = event.clientX;
  var y = event.clientY;
  if(!x && !y && document.activeElement) {
    var activeRect = document.activeElement.getBoundingClientRect();
    x = activeRect.left;
    y = activeRect.bottom;
  }

  contextMenuState.point = { x: x, y: y };
  contextMenuPosition(x, y);
  window.requestAnimationFrame(function() {
    contextMenuElement.classList.add('is-visible');
  });
}

const contextMenuAction = function(event) {
  var control = event.target.closest('[data-action]');
  if(!control)
    return;

  var action = control.dataset.action;

  if(action === 'home' || action === 'archives' || action === 'categories' || action === 'tags') {
    contextMenuClose();
    return;
  }

  event.preventDefault();

  switch(action) {
    case 'back':
      contextMenuClose();
      window.history.back();
      break;
    case 'forward':
      contextMenuClose();
      window.history.forward();
      break;
    case 'refresh':
      contextMenuClose();
      window.location.reload();
      break;
    case 'copy-selection':
      contextMenuCopy(contextMenuState.selection, '选中文字已复制');
      contextMenuClose();
      break;
    case 'open-link':
      if(contextMenuState.link) {
        window.open(contextMenuState.link.href, '_blank', 'noopener,noreferrer');
      }
      contextMenuClose();
      break;
    case 'copy-link':
      if(contextMenuState.link) {
        contextMenuCopy(contextMenuState.link.href, '链接地址已复制');
      }
      contextMenuClose();
      break;
    case 'comments':
      var comments = $('#comments');
      contextMenuClose();
      if(comments) {
        pageScroll(comments);
      } else {
        showtip('当前页面没有评论区');
      }
      break;
    case 'print':
      contextMenuClose();
      window.print();
      break;
    case 'font-bomb':
      var bombPoint = contextMenuState.point;
      contextMenuClose();
      fontBombStart(bombPoint);
      break;
  }
}

const contextMenuInit = function() {
  if(contextMenuElement)
    return;

  contextMenuElement = document.createElement('aside');
  contextMenuElement.id = 'context-menu';
  contextMenuElement.className = 'context-menu';
  contextMenuElement.setAttribute('role', 'menu');
  contextMenuElement.setAttribute('aria-label', '页面右键菜单');
  contextMenuElement.setAttribute('aria-hidden', 'true');
  contextMenuElement.hidden = true;
  contextMenuElement.innerHTML =
    '<nav class="context-menu-nav" aria-label="浏览器导航">' +
      '<button type="button" data-action="back" aria-label="后退" title="后退">' + contextMenuIcons.back + '</button>' +
      '<button type="button" data-action="forward" aria-label="前进" title="前进">' + contextMenuIcons.forward + '</button>' +
      '<button type="button" data-action="refresh" aria-label="刷新" title="刷新">' + contextMenuIcons.refresh + '</button>' +
      '<a data-action="home" href="' + contextMenuRootUrl('') + '" aria-label="首页" title="首页">' + contextMenuIcons.home + '</a>' +
    '</nav>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-list">' +
      '<button type="button" class="context-menu-item" data-action="copy-selection" role="menuitem">' + contextMenuIcons.copy + '<span>复制选中文字</span></button>' +
      '<button type="button" class="context-menu-item" data-action="open-link" data-link-item role="menuitem">' + contextMenuIcons.open + '<span>打开当前链接</span></button>' +
      '<button type="button" class="context-menu-item" data-action="copy-link" data-link-item role="menuitem">' + contextMenuIcons.copy + '<span>复制链接地址</span></button>' +
      '<div class="context-menu-divider context-menu-dynamic-divider"></div>' +
      '<a class="context-menu-item" data-action="archives" href="' + contextMenuRootUrl('archives/') + '" role="menuitem">' + contextMenuIcons.archive + '<span>文章归档</span></a>' +
      '<a class="context-menu-item" data-action="categories" href="' + contextMenuRootUrl('categories/') + '" role="menuitem">' + contextMenuIcons.folder + '<span>文章分类</span></a>' +
      '<a class="context-menu-item" data-action="tags" href="' + contextMenuRootUrl('tags/') + '" role="menuitem">' + contextMenuIcons.tag + '<span>文章标签</span></a>' +
      '<button type="button" class="context-menu-item" data-action="comments" role="menuitem">' + contextMenuIcons.comment + '<span>看评论区</span></button>' +
      '<button type="button" class="context-menu-item" data-action="print" role="menuitem">' + contextMenuIcons.print + '<span>打印页面</span></button>' +
      '<button type="button" class="context-menu-item context-menu-bomb" data-action="font-bomb" role="menuitem"><span class="context-menu-emoji" aria-hidden="true">💣</span><span>蹦蹦炸弹</span></button>' +
    '</div>';

  BODY.appendChild(contextMenuElement);
  contextMenuElement.addEventListener('click', contextMenuAction);
  document.addEventListener('contextmenu', contextMenuOpen);
  document.addEventListener('pointerdown', function(event) {
    if(contextMenuElement && !contextMenuElement.hidden && !contextMenuElement.contains(event.target))
      contextMenuClose();

    if(event.button === 2) {
      contextMenuState.selection = String(window.getSelection ? window.getSelection().toString() : '').trim();
    }
  });
  document.addEventListener('keydown', function(event) {
    if(event.key === 'Escape')
      contextMenuClose();
  });
  window.addEventListener('scroll', contextMenuClose, true);
  window.addEventListener('resize', contextMenuClose);
  window.addEventListener('blur', contextMenuClose);
  window.addEventListener('pjax:send', contextMenuClose);
  window.addEventListener('pjax:send', fontBombCleanup);
}
