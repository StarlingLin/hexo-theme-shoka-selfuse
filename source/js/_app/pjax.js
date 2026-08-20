var walineInstance = null;

const domInit = function() {
  $.each('.overview .menu > .item', function(el) {
    siteNav.child('.menu').appendChild(el.cloneNode(true));
  })

  loadCat.addEventListener('click', Loader.vanish);
  menuToggle.addEventListener('click', sideBarToggleHandle);
  $('.dimmer').addEventListener('click', sideBarToggleHandle);

  quickBtn.child('.down').addEventListener('click', goToBottomHandle);
  quickBtn.child('.up').addEventListener('click', backToTopHandle);

  if(!toolBtn) {
    toolBtn = siteHeader.createChild('div', {
      id: 'tool',
      innerHTML: '<div class="item player"></div><div class="item contents"><i class="ic i-list-ol"></i></div><div class="item chat"><i class="ic i-comments"></i></div><div class="item back-to-top"><i class="ic i-arrow-up"></i><span>0%</span></div>'
    });
  }

  toolPlayer = toolBtn.child('.player');
  backToTop = toolBtn.child('.back-to-top');
  goToComment = toolBtn.child('.chat');
  showContents = toolBtn.child('.contents');

  backToTop.addEventListener('click', backToTopHandle);
  goToComment.addEventListener('click', goToCommentHandle);
  showContents.addEventListener('click', sideBarToggleHandle);

  mediaPlayer(toolPlayer)
  $('main').addEventListener('click', function() {
    toolPlayer.player.mini()
  })
}

const pjaxReload = function () {
  pagePosition()
  destroyStatisticsCharts()

  if(walineInstance) {
    walineInstance.destroy();
    walineInstance = null;
  }

  if(sideBar.hasClass('on')) {
    transition(sideBar, function () {
        sideBar.removeClass('on');
        menuToggle.removeClass('close');
      }); // 'transition.slideRightOut'
  }

  $('#main').innerHTML = ''
  $('#main').appendChild(loadCat.lastChild.cloneNode(true));
  pageScroll(0);
}


const loadRecentComments = function () {
  var list = $('#waline-recent-comments');
  if(!list || !CONFIG.waline || !CONFIG.waline.serverURL)
    return;

  var count = parseInt(list.attr('data-count') || 5);
  var serverURL = CONFIG.waline.serverURL.replace(/\/+$/, '');
  var requestURL = serverURL + '/api/comment?type=recent&count=' + count + '&lang=zh-CN';

  list.innerHTML = '<li class="waline-recent-comment-status">加载中...</li>';

  fetch(requestURL, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit'
  })
    .then(function(response) {
      if(!response.ok)
        throw new Error('HTTP ' + response.status);

      return response.json();
    })
    .then(function(result) {
      var comments = Array.isArray(result)
        ? result
        : (Array.isArray(result.data) ? result.data : []);

      list.innerHTML = '';

      if(!comments.length) {
        list.innerHTML = '<li class="waline-recent-comment-status">暂无评论</li>';
        return;
      }

      comments.forEach(function(item) {
        var contentBox = document.createElement('div');
        contentBox.innerHTML = item.comment || '';

        var content = (contentBox.textContent || contentBox.innerText || '')
          .replace(/\s+/g, ' ')
          .trim();

        if(content.length > 48)
          content = content.substring(0, 48) + '…';

        var root = CONFIG.root || '/';
        root = root.replace(/\/?$/, '/');

        var path = String(item.url || '').replace(/^\/+/, '');
        var href = root + path + '#comments';

        var li = document.createElement('li');
        li.className = 'waline-recent-comment-item';

        var link = document.createElement('a');
        link.className = 'waline-recent-comment-link';
        link.href = href;
        link.title = (item.nick || '匿名') + '：' + content;

        var header = document.createElement('span');
        header.className = 'waline-recent-comment-header';

        var nick = document.createElement('strong');
        nick.className = 'waline-recent-comment-nick';
        nick.textContent = item.nick || '匿名';

        var time = document.createElement('time');
        time.className = 'waline-recent-comment-time';

        var date = item.time
          ? new Date(item.time)
          : (item.insertedAt ? new Date(item.insertedAt) : null);

        if(date && !isNaN(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
        }

        var body = document.createElement('span');
        body.className = 'waline-recent-comment-content';
        body.textContent = content || '[非文本评论]';

        header.appendChild(nick);
        if(time.textContent)
          header.appendChild(time);

        link.appendChild(header);
        link.appendChild(body);
        li.appendChild(link);
        list.appendChild(li);
      });
    })
    .catch(function(error) {
      console.error('[Shoka Waline] Failed to load recent comments:', error);
      list.innerHTML =
        '<li class="waline-recent-comment-status">最新评论加载失败</li>';
    });
}

const siteRefresh = function (reload) {
  LOCAL_HASH = 0
  LOCAL_URL = window.location.href

  vendorCss('katex');
  vendorJs('copy_tex');
  vendorCss('mermaid');
  vendorJs('chart');
  // The recent-comments widget uses Waline's lightweight HTTP API directly.
  // Load the full client and stylesheet only on pages that render a comment box.
  if($('#comments')) {
    // Shoka still exposes the per-page switch as LOCAL.valine.
    // Mirror it so vendorCss/vendorJs can use the Waline asset key.
    LOCAL.waline = LOCAL.valine;

    vendorCss('waline');
    vendorJs('waline', function() {
      var options = Object.assign({}, CONFIG.waline);
      options = Object.assign(options, LOCAL.valine || {});
      options.el = '#comments';
      options.path = LOCAL.path;

      if(walineInstance) {
        walineInstance.destroy();
      }

      walineInstance = Waline.init(options);

      setTimeout(function(){
        positionInit(1);
      }, 1000);
    }, window.Waline);
  }

  loadRecentComments();

  if(!reload) {
    $.each('script[data-pjax]', pjaxScript);
  }

  originTitle = document.title

  resizeHandle()

  menuActive()

  sideBarTab()
  sidebarTOC()

  registerExtURL()
  postBeauty()
  mountStatisticsCharts()
  tabFormat()

  toolPlayer.player.load(LOCAL.audio || CONFIG.audio || {})

  Loader.hide()

  setTimeout(function(){
    positionInit()
  }, 500);

  cardActive()

  lazyload.observe()
}

const siteInit = function () {

  domInit()

  pjax = new Pjax({
            // SafeGo turns external URLs into same-origin /go.html links.
            // Never let PJAX consume links meant for a new tab or explicitly
            // marked for a full browser navigation.
            elements: 'a[href]:not([target="_blank"]):not([data-pjax-ignore]), form[action]',
            selectors: [
              'head title',
              '.languages',
              '.pjax',
              'script[data-config]'
            ],
            analytics: false,
            cacheBust: false
          })

  CONFIG.quicklink.ignores = LOCAL.ignores
  quicklink.listen(CONFIG.quicklink)

  visibilityListener()
  themeColorListener()

  algoliaSearch(pjax)

  window.addEventListener('scroll', scrollHandle)

  window.addEventListener('resize', resizeHandle)

  window.addEventListener('pjax:send', pjaxReload)

  window.addEventListener('pjax:success', siteRefresh)

  window.addEventListener('beforeunload', function() {
    pagePosition()
  })

  siteRefresh(1)
}

window.addEventListener('DOMContentLoaded', siteInit);

console.log('%c Theme.Shoka v' + CONFIG.version + ' %c https://shoka.lostyu.me/ ', 'color: white; background: #e9546b; padding:5px 0;', 'padding:4px;border:1px solid #e9546b;')
