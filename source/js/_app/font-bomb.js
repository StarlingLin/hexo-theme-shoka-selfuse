var fontBombState = {
  active: false,
  marker: null,
  wrappers: [],
  timers: []
};

const fontBombSetTimer = function(callback, delay) {
  var timer = window.setTimeout(callback, delay);
  fontBombState.timers.push(timer);
  return timer;
}

const fontBombCleanup = function() {
  fontBombState.timers.forEach(function(timer) {
    window.clearTimeout(timer);
  });
  fontBombState.timers = [];

  if(fontBombState.marker && fontBombState.marker.parentNode) {
    fontBombState.marker.parentNode.removeChild(fontBombState.marker);
  }
  fontBombState.marker = null;

  fontBombState.wrappers.forEach(function(item) {
    if(item.wrapper && item.wrapper.parentNode) {
      item.wrapper.parentNode.replaceChild(document.createTextNode(item.text), item.wrapper);
    }
  });
  fontBombState.wrappers = [];
  fontBombState.active = false;
}

const fontBombTextRect = function(node) {
  var range = document.createRange();
  range.selectNodeContents(node);
  var rect = range.getBoundingClientRect();
  range.detach && range.detach();
  return rect;
}

const fontBombTextIsNear = function(node, x, y, radius) {
  var parent = node.parentElement;
  if(!parent || !node.nodeValue || !node.nodeValue.trim())
    return false;

  if(parent.closest('#context-menu, #loading, #neko, .tip, .font-bomb-marker, .font-bomb-text, script, style, noscript, input, textarea, select, option, button, canvas, svg, pre, code, kbd, samp, [contenteditable="true"]'))
    return false;

  var style = window.getComputedStyle(parent);
  if(style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    return false;

  var rect = fontBombTextRect(node);
  return rect.width > 0 && rect.height > 0 &&
    rect.right >= x - radius && rect.left <= x + radius &&
    rect.bottom >= y - radius && rect.top <= y + radius;
}

const fontBombWrapText = function(node) {
  var text = node.nodeValue;
  var wrapper = document.createElement('span');
  wrapper.className = 'font-bomb-text';

  Array.from(text).forEach(function(character) {
    if(/\s/.test(character)) {
      wrapper.appendChild(document.createTextNode(character));
      return;
    }

    var particle = document.createElement('span');
    particle.className = 'font-bomb-particle';
    particle.setAttribute('aria-hidden', 'true');
    particle.textContent = character;
    wrapper.appendChild(particle);
  });

  node.parentNode.replaceChild(wrapper, node);
  fontBombState.wrappers.push({ wrapper: wrapper, text: text });
  return wrapper;
}

const fontBombCreateSparks = function(marker) {
  for(var i = 0; i < 16; i++) {
    var spark = document.createElement('i');
    var angle = Math.PI * 2 * i / 16 + (Math.random() - .5) * .25;
    var distance = 45 + Math.random() * 75;
    spark.className = 'font-bomb-spark';
    spark.style.setProperty('--font-bomb-spark-x', Math.cos(angle) * distance + 'px');
    spark.style.setProperty('--font-bomb-spark-y', Math.sin(angle) * distance + 'px');
    spark.style.setProperty('--font-bomb-spark-delay', Math.random() * .08 + 's');
    marker.appendChild(spark);
  }
}

const fontBombExplode = function(x, y) {
  var radius = Math.min(250, Math.max(170, Math.min(window.innerWidth, window.innerHeight) * .34));
  var root = $('#container') || BODY;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  var nearbyNodes = [];
  var characterBudget = 520;
  var node;

  while((node = walker.nextNode()) && nearbyNodes.length < 70 && characterBudget > 0) {
    if(fontBombTextIsNear(node, x, y, radius)) {
      nearbyNodes.push(node);
      characterBudget -= node.nodeValue.length;
    }
  }

  nearbyNodes.forEach(fontBombWrapText);

  var particles = [];
  fontBombState.wrappers.forEach(function(item) {
    Array.prototype.push.apply(particles, item.wrapper.querySelectorAll('.font-bomb-particle'));
  });

  var exploded = 0;
  particles.forEach(function(particle) {
    if(exploded >= 260)
      return;

    var rect = particle.getBoundingClientRect();
    var particleX = rect.left + rect.width / 2;
    var particleY = rect.top + rect.height / 2;
    var deltaX = particleX - x;
    var deltaY = particleY - y;
    var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if(distance > radius)
      return;

    var angle = distance < 6 ? Math.random() * Math.PI * 2 : Math.atan2(deltaY, deltaX);
    var power = 75 + (radius - distance) * .68 + Math.random() * 55;
    var endX = Math.cos(angle) * power + (Math.random() - .5) * 38;
    var lift = Math.sin(angle) * power - 65 - Math.random() * 70;
    var endY = lift + 165 + Math.random() * 105;
    var rotation = (Math.random() - .5) * 1080;

    particle.style.setProperty('--font-bomb-x-mid', endX * .56 + 'px');
    particle.style.setProperty('--font-bomb-y-mid', lift + 'px');
    particle.style.setProperty('--font-bomb-r-mid', rotation * .45 + 'deg');
    particle.style.setProperty('--font-bomb-x-end', endX + 'px');
    particle.style.setProperty('--font-bomb-y-end', endY + 'px');
    particle.style.setProperty('--font-bomb-r-end', rotation + 'deg');
    particle.style.setProperty('--font-bomb-delay', Math.random() * .09 + 's');
    particle.classList.add('is-exploding');
    exploded++;
  });

  if(fontBombState.marker) {
    fontBombState.marker.textContent = '💥';
    fontBombState.marker.classList.add('is-exploding');
    fontBombCreateSparks(fontBombState.marker);
  }

  fontBombSetTimer(fontBombCleanup, 1750);
}

const fontBombStart = function(point) {
  if(!point)
    return;

  if(fontBombState.active) {
    showtip('上一颗炸弹还在爆炸中');
    return;
  }

  fontBombState.active = true;

  var x = Math.max(18, Math.min(point.x, window.innerWidth - 18));
  var y = Math.max(18, Math.min(point.y, window.innerHeight - 18));
  var marker = document.createElement('div');
  marker.className = 'font-bomb-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.style.left = x + 'px';
  marker.style.top = y + 'px';
  marker.textContent = '3';
  BODY.appendChild(marker);
  fontBombState.marker = marker;

  fontBombSetTimer(function() { marker.textContent = '2'; }, 480);
  fontBombSetTimer(function() { marker.textContent = '1'; }, 960);
  fontBombSetTimer(function() { fontBombExplode(x, y); }, 1440);
}
