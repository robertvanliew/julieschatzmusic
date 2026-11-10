// Video stage: upgrades every <button class="video-facade" data-yt="ID"> into a
// framed player with our own controls (styles in assets/css/video-stage.css).
//
// Why not a plain embed: YouTube chooses its starting quality from the size of
// the player, and a 380px-wide embed starts (and stays) at 360p. Here the iframe
// is laid out about 1080px wide and scaled down to fit, so playback begins in HD
// on any screen. YouTube's own controls would shrink with it, so they are turned
// off and replaced by the bar below, driven over postMessage (no API library).
(function () {
  'use strict';

  var TARGET = 1080; // layout size of the player's short side, in CSS pixels
  var MAX_SCALE = 3.5;
  var HIDE_MS = 2600;
  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm18.3-.9-1.4-1.4L17 9.6l-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4-2.9-2.9z"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z"/></svg>'
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  }
  function clock(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  // Respect data saver and slow connections: leave YouTube's own choice alone there.
  function wantsHd() {
    var c = navigator.connection;
    return !(c && (c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType || '')));
  }

  function build(btn) {
    var id = btn.getAttribute('data-yt');
    if (!id) return;
    var label = (btn.getAttribute('aria-label') || 'Play video').replace(/^Play video\s*[·:]\s*/i, '');
    var poster = btn.querySelector('img');

    var root = el('div', 'vs is-idle');
    var stage = el('div', 'vs-stage');
    var screen = el('div', 'vs-screen');
    var holder = el('div', 'vs-player');
    var shield = el('div', 'vs-shield');
    var playBtn = el('button', 'vs-play', ICON.play);
    var hint = el('span', 'vs-hint', 'Tap to play');
    var bar = el('div', 'vs-bar');
    var toggle = el('button', 'vs-btn', ICON.pause);
    var track = el('div', 'vs-track', '<span class="vs-fill"></span>');
    var fill = track.firstChild;
    var time = el('span', 'vs-time', '0:00');
    var hd = el('span', 'vs-hd', 'HD');
    var mute = el('button', 'vs-btn', ICON.sound);
    var full = el('button', 'vs-btn', ICON.full);

    playBtn.type = toggle.type = mute.type = full.type = 'button';
    playBtn.setAttribute('aria-label', 'Play video: ' + label);
    toggle.setAttribute('aria-label', 'Pause');
    mute.setAttribute('aria-label', 'Mute');
    full.setAttribute('aria-label', 'Full screen');
    hd.setAttribute('aria-hidden', 'true');
    track.setAttribute('role', 'slider');
    track.setAttribute('tabindex', '0');
    track.setAttribute('aria-label', 'Seek');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    if (!(stage.requestFullscreen || stage.webkitRequestFullscreen)) full.hidden = true;

    if (poster) {
      var glow = poster.cloneNode(false);
      glow.className = 'vs-ambient';
      glow.alt = '';
      glow.setAttribute('aria-hidden', 'true');
      glow.removeAttribute('onerror');
      root.appendChild(glow);
      poster.className = 'vs-poster';
      poster.addEventListener('error', function () { setTimeout(function () { glow.src = poster.src; }, 0); });
      screen.appendChild(poster);
    }
    bar.appendChild(toggle); bar.appendChild(track); bar.appendChild(time); bar.appendChild(hd); bar.appendChild(mute); bar.appendChild(full);
    screen.appendChild(holder); screen.appendChild(shield); screen.appendChild(playBtn); screen.appendChild(hint); screen.appendChild(bar);
    stage.appendChild(screen);
    root.appendChild(stage);
    btn.parentNode.replaceChild(root, btn);

    var iframe = null, ready = false, started = false, state = -1, muted = false;
    var duration = 0, current = 0, dragging = false, hideTimer = 0, listenTimer = 0, tapTimer = 0;

    function post(func, args) {
      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*');
    }
    function cls(name, on) { root.classList.toggle(name, !!on); }

    // Lay the player out large and scale it down to the frame.
    function fit() {
      var w = screen.clientWidth, h = screen.clientHeight;
      if (!w || !h) return;
      var k = wantsHd() ? Math.min(MAX_SCALE, Math.max(1, TARGET / Math.min(w, h))) : 1;
      holder.style.width = Math.ceil(w * k) + 'px';
      holder.style.height = Math.ceil(h * k) + 'px';
      holder.style.transform = k === 1 ? '' : 'scale(' + (1 / k) + ')';
    }

    function showUi() {
      cls('show-ui', true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (state === 1 && !dragging && !bar.contains(document.activeElement)) cls('show-ui', false); }, HIDE_MS);
    }

    function paint() {
      var playing = state === 1, ended = state === 0;
      cls('is-playing', playing || (started && state === 3));
      cls('is-paused', started && (state === 2 || ended));
      cls('is-ended', ended);
      cls('is-loading', !!iframe && (state === 3 || (!started && !root.classList.contains('needs-tap'))));
      toggle.innerHTML = playing ? ICON.pause : ICON.play;
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      playBtn.innerHTML = ended ? ICON.replay : ICON.play;
      playBtn.setAttribute('aria-label', (ended ? 'Replay video: ' : 'Play video: ') + label);
      mute.innerHTML = muted ? ICON.muted : ICON.sound;
      mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    }
    function paintTime() {
      var f = duration ? Math.min(1, current / duration) : 0;
      fill.style.transform = 'scaleX(' + f + ')';
      time.textContent = clock(duration && state !== 1 && !started ? duration : current);
      track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      track.setAttribute('aria-valuetext', clock(current) + ' of ' + clock(duration));
    }

    function onMessage(e) {
      if (!iframe || e.source !== iframe.contentWindow) return;
      var data;
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
      if (!data) return;
      if (!ready) { ready = true; clearInterval(listenTimer); }
      var info = data.info;
      if (!info) return;
      if (typeof info.duration === 'number' && info.duration) duration = info.duration;
      if (typeof info.currentTime === 'number' && !dragging) current = info.currentTime;
      if (typeof info.muted === 'boolean') muted = info.muted;
      if (typeof info.playbackQuality === 'string') cls('is-hd', /^(hd|highres)/.test(info.playbackQuality));
      if (typeof info.playerState === 'number' && info.playerState !== state) {
        state = info.playerState;
        if (state === 1) {
          clearTimeout(tapTimer);
          cls('needs-tap', false);
          if (!started) { started = true; cls('is-started', true); cls('is-idle', false); }
          showUi();
        }
        if (state === 0) { current = duration; cls('show-ui', true); }
      }
      paint();
      paintTime();
    }

    function load() {
      if (iframe) return;
      iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&controls=0&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('title', label);
      iframe.setAttribute('tabindex', '-1');
      fit();
      holder.appendChild(iframe);
      window.addEventListener('message', onMessage);
      // The player only reports state after it hears "listening"; it may not be ready on the first try.
      var hello = function () { if (iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); };
      iframe.addEventListener('load', hello);
      listenTimer = setInterval(function () { if (ready) clearInterval(listenTimer); else hello(); }, 250);
      // Some phones refuse to start a video with sound from outside the player.
      // If nothing is playing after a moment, step aside so the next tap lands on YouTube itself.
      tapTimer = setTimeout(function () { if (!started) { cls('needs-tap', true); paint(); } }, 4000);
      paint();
      if (typeof gtag === 'function') gtag('event', 'video_play', { video_id: id, page: location.pathname });
    }

    function togglePlay() {
      if (!iframe) { load(); return; }
      if (state === 1 || state === 3) post('pauseVideo');
      else { if (state === 0) post('seekTo', [0, true]); post('playVideo'); }
    }

    playBtn.addEventListener('click', togglePlay);
    toggle.addEventListener('click', function () { togglePlay(); showUi(); });
    shield.addEventListener('click', function (e) {
      // On touch, the first tap on a playing video only brings the controls back.
      var touch = e.pointerType ? e.pointerType !== 'mouse' : false;
      if (touch && state === 1 && !root.classList.contains('show-ui')) { showUi(); return; }
      togglePlay();
      showUi();
    });
    screen.addEventListener('pointermove', function (e) { if (started && e.pointerType === 'mouse') showUi(); });
    bar.addEventListener('focusin', showUi);
    mute.addEventListener('click', function () { muted = !muted; post(muted ? 'mute' : 'unMute'); paint(); showUi(); });
    full.addEventListener('click', function () {
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
      showUi();
    });

    // Scrubbing
    function seekTo(clientX, commit) {
      var r = track.getBoundingClientRect();
      var f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      current = f * duration;
      paintTime();
      if (commit) post('seekTo', [current, true]);
    }
    track.addEventListener('pointerdown', function (e) {
      if (!duration) return;
      dragging = true;
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
      seekTo(e.clientX, false);
    });
    track.addEventListener('pointermove', function (e) { if (dragging) seekTo(e.clientX, false); });
    function endDrag(e) {
      if (!dragging) return;
      seekTo(e.clientX, true);
      dragging = false;
      track.classList.remove('is-dragging');
      showUi();
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', function () { dragging = false; track.classList.remove('is-dragging'); });
    track.addEventListener('keydown', function (e) {
      if (!duration || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      current = Math.min(duration, Math.max(0, current + (e.key === 'ArrowRight' ? 5 : -5)));
      post('seekTo', [current, true]);
      paintTime();
    });

    if (window.ResizeObserver) new ResizeObserver(fit).observe(screen);
    else window.addEventListener('resize', fit);
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('.video-facade[data-yt]'), build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
