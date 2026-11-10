// Highlight theater: tapping a Performance Highlights card opens the clip in a
// full-window player sized to the visitor's screen and starts it playing.
// Arrows, swipe and the keyboard move between clips; a finished clip rolls on to
// the next. Styles: assets/css/highlight-theater.css.
(function () {
  'use strict';

  var cards = Array.prototype.slice.call(document.querySelectorAll('#carouselTrack .video-card[data-mp4], #carouselTrack .video-card[data-vimeo]'));
  if (!cards.length) return;

  var clips = cards.map(function (card) {
    var img = card.querySelector('img');
    var cap = card.querySelector('.video-caption');
    return {
      mp4: card.getAttribute('data-mp4'),
      vimeo: card.getAttribute('data-vimeo'),
      poster: card.getAttribute('data-poster') || (img && img.getAttribute('src')) || '',
      venue: cap ? cap.textContent.trim() : '',
      label: (card.getAttribute('aria-label') || '').replace(/^Play video\s*[·:]?\s*/i, '')
    };
  });

  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>'
  };
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  }
  function navBtn(dir) {
    var b = el('button', 'ht-btn ht-nav', dir < 0 ? ICON.prev : ICON.next);
    b.type = 'button';
    b.setAttribute('aria-label', dir < 0 ? 'Previous clip' : 'Next clip');
    b.addEventListener('click', function () { go(index + dir); });
    return b;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var root = el('div', 'ht');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Performance highlights');
  var glow = el('img', 'ht-glow');
  glow.alt = '';
  glow.setAttribute('aria-hidden', 'true');
  var top = el('div', 'ht-top');
  var count = el('span', 'ht-count');
  count.setAttribute('aria-live', 'polite');
  var close = el('button', 'ht-btn', ICON.close);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close video');
  var stage = el('div', 'ht-stage');
  var frame = el('div', 'ht-frame');
  var bottom = el('div', 'ht-bottom');
  var caption = el('div', 'ht-caption');
  var venue = el('span', 'ht-venue');
  var hint = el('span', 'ht-hint');
  var navs = [[navBtn(-1), navBtn(1)], [navBtn(-1), navBtn(1)]]; // beside the frame, and in the bottom bar

  top.appendChild(count); top.appendChild(close);
  stage.appendChild(navs[0][0]); stage.appendChild(frame); stage.appendChild(navs[0][1]);
  caption.appendChild(venue); caption.appendChild(hint);
  bottom.appendChild(navs[1][0]); bottom.appendChild(caption); bottom.appendChild(navs[1][1]);
  root.appendChild(glow); root.appendChild(top); root.appendChild(stage); root.appendChild(bottom);

  var index = 0, open = false, opener = null, pushed = false, swapTimer = 0;

  // Julie's own player shell for the clips hosted on this site: her mark in the
  // corner and her controls, instead of the browser's default video bar.
  var SHELL_ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm18.3-.9-1.4-1.4L17 9.6l-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4-2.9-2.9z"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z"/></svg>'
  };
  function clock(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function shell(video) {
    var wrap = el('div', 'ht-shell show-ui');
    var brand = el('div', 'ht-brand', '<img src="/assets/email/logo-ivory.png" alt=""><span>Julie Schatz Music</span>');
    var tap = el('div', 'ht-tap');
    var big = el('button', 'ht-big', SHELL_ICON.play);
    var bar = el('div', 'ht-bar');
    var toggle = el('button', 'ht-ctl', SHELL_ICON.pause);
    var track = el('div', 'ht-track', '<span class="ht-fill"></span>');
    var fill = track.firstChild;
    var time = el('span', 'ht-time', '0:00');
    var mute = el('button', 'ht-ctl', SHELL_ICON.sound);
    var full = el('button', 'ht-ctl', SHELL_ICON.full);
    big.type = toggle.type = mute.type = full.type = 'button';
    big.setAttribute('aria-label', 'Play');
    mute.setAttribute('aria-label', 'Mute');
    full.setAttribute('aria-label', 'Full screen');
    track.setAttribute('role', 'slider');
    track.setAttribute('tabindex', '0');
    track.setAttribute('aria-label', 'Seek');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    brand.setAttribute('aria-hidden', 'true');
    if (!(root.requestFullscreen || root.webkitRequestFullscreen || video.webkitEnterFullscreen)) full.hidden = true;
    bar.appendChild(toggle); bar.appendChild(track); bar.appendChild(time); bar.appendChild(mute); bar.appendChild(full);
    wrap.appendChild(tap); wrap.appendChild(brand); wrap.appendChild(big); wrap.appendChild(bar);
    frame.appendChild(wrap);

    var hideTimer = 0, dragging = false;
    function showUi() {
      wrap.classList.add('show-ui');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (!video.paused && !dragging && !bar.contains(document.activeElement)) wrap.classList.remove('show-ui'); }, 2600);
    }
    function paint() {
      var playing = !video.paused && !video.ended;
      wrap.classList.toggle('is-paused', !playing);
      toggle.innerHTML = playing ? SHELL_ICON.pause : SHELL_ICON.play;
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      mute.innerHTML = video.muted ? SHELL_ICON.muted : SHELL_ICON.sound;
      mute.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
      if (!playing) wrap.classList.add('show-ui');
    }
    function paintTime() {
      var d = video.duration || 0, f = d ? Math.min(1, video.currentTime / d) : 0;
      fill.style.transform = 'scaleX(' + f + ')';
      time.textContent = clock(video.currentTime) + ' / ' + clock(d);
      track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    }
    function togglePlay() { if (video.paused || video.ended) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause(); }

    ['play', 'playing', 'pause', 'ended', 'volumechange'].forEach(function (ev) { video.addEventListener(ev, paint); });
    video.addEventListener('playing', function () { wrap.classList.remove('is-waiting'); showUi(); });
    video.addEventListener('waiting', function () { wrap.classList.add('is-waiting'); });
    video.addEventListener('timeupdate', function () { if (!dragging) paintTime(); });
    video.addEventListener('loadedmetadata', paintTime);

    tap.addEventListener('click', function (e) {
      // On touch, the first tap on a playing clip only brings the controls back.
      var touch = e.pointerType ? e.pointerType !== 'mouse' : false;
      if (touch && !video.paused && !wrap.classList.contains('show-ui')) { showUi(); return; }
      togglePlay(); showUi();
    });
    wrap.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') showUi(); });
    bar.addEventListener('focusin', showUi);
    big.addEventListener('click', togglePlay);
    toggle.addEventListener('click', function () { togglePlay(); showUi(); });
    mute.addEventListener('click', function () { video.muted = !video.muted; showUi(); });
    full.addEventListener('click', function () {
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (root.requestFullscreen || root.webkitRequestFullscreen) (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      else video.webkitEnterFullscreen(); // iPhone: its own full-screen player
      showUi();
    });

    function seek(clientX) {
      var r = track.getBoundingClientRect(), d = video.duration || 0;
      if (!d) return;
      video.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * d;
      paintTime();
    }
    track.addEventListener('pointerdown', function (e) { dragging = true; track.classList.add('is-dragging'); track.setPointerCapture(e.pointerId); seek(e.clientX); });
    track.addEventListener('pointermove', function (e) { if (dragging) seek(e.clientX); });
    function endDrag() { dragging = false; track.classList.remove('is-dragging'); showUi(); }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + (e.key === 'ArrowRight' ? 5 : -5)));
    });
    paint();
    showUi();
  }

  function mount(i) {
    var c = clips[i], media;
    frame.innerHTML = '';
    if (c.mp4) {
      media = document.createElement('video');
      media.src = c.mp4;
      if (c.poster) media.poster = c.poster;
      media.controls = false; // Julie's own player shell below replaces the browser's controls
      media.autoplay = true;
      media.playsInline = true;
      media.setAttribute('playsinline', '');
      media.setAttribute('controlslist', 'nodownload noremoteplayback');
      media.setAttribute('disablepictureinpicture', '');
      media.preload = 'auto';
      media.oncontextmenu = function () { return false; };
      media.addEventListener('ended', function () { if (open && index < clips.length - 1) go(index + 1); });
    } else {
      media = document.createElement('iframe');
      media.src = 'https://player.vimeo.com/video/' + c.vimeo + '?title=0&byline=0&portrait=0&badge=0&autopause=0&dnt=1&autoplay=1&playsinline=1';
      media.allow = 'autoplay; fullscreen; picture-in-picture';
      media.allowFullscreen = true;
      media.title = c.label || 'Performance highlight';
    }
    frame.appendChild(media);
    if (c.mp4) { shell(media); var p = media.play(); if (p && p.catch) p.catch(function () {}); }

    glow.src = c.poster;
    count.innerHTML = pad(i + 1) + '<small>/ ' + pad(clips.length) + '</small>';
    venue.textContent = c.venue || 'Live performance';
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    hint.textContent = i < clips.length - 1 ? (touch ? 'Swipe for the next clip' : 'Arrow keys for the next clip') : 'Last clip';
    navs.forEach(function (pair) { pair[0].disabled = i === 0; pair[1].disabled = i === clips.length - 1; });
    if (typeof gtag === 'function') gtag('event', 'video_play', { video_id: c.mp4 || ('vimeo:' + c.vimeo), page: location.pathname });
  }

  function go(i) {
    if (i < 0 || i >= clips.length || i === index) return;
    index = i;
    root.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () { mount(index); root.classList.remove('is-swapping'); }, 130);
  }

  function show(i, from) {
    if (open) return;
    open = true;
    opener = from || null;
    index = i;
    if (!root.parentNode) document.body.appendChild(root);
    document.documentElement.classList.add('ht-lock');
    root.classList.add('is-open');
    mount(i); // inside the click, so the clip is allowed to start with sound
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('is-in'); }); });
    close.focus({ preventScroll: true });
    // The phone's Back button closes the player instead of leaving the page.
    try { history.pushState({ highlightTheater: true }, ''); pushed = true; } catch (e) { pushed = false; }
  }

  function hide(fromHistory) {
    if (!open) return;
    open = false;
    clearTimeout(swapTimer);
    frame.innerHTML = ''; // stops playback
    root.classList.remove('is-in', 'is-open', 'is-swapping');
    document.documentElement.classList.remove('ht-lock');
    if (pushed && !fromHistory) { pushed = false; history.back(); } else pushed = false;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  cards.forEach(function (card, i) {
    card.addEventListener('click', function () { show(i, card); });
  });
  close.addEventListener('click', function () { hide(false); });
  // A click on the dark surround closes; clicks on the clip or the controls do not.
  root.addEventListener('click', function (e) { if (e.target === root || e.target === stage || e.target === top || e.target === bottom) hide(false); });
  window.addEventListener('popstate', function () { if (open) hide(true); });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { hide(false); return; }
    if (e.key === 'ArrowRight' && e.target.tagName !== 'VIDEO') go(index + 1);
    if (e.key === 'ArrowLeft' && e.target.tagName !== 'VIDEO') go(index - 1);
    if (e.key === 'Tab') { // keep focus inside the player
      var f = Array.prototype.filter.call(root.querySelectorAll('button, video, iframe'), function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe sideways for the next or previous clip, down to close.
  var sx = 0, sy = 0, st = 0, tracking = false;
  root.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  root.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700) return;
    // Leave the bottom strip of the clip alone: that is where the scrub bar lives.
    var r = frame.getBoundingClientRect();
    if (sx > r.left && sx < r.right && sy > r.bottom - 70 && sy < r.bottom) return;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) hide(false);
  }, { passive: true });
})();
