/* "Email me my picks" card for the song finders.
 *
 * Usage (after the results are on the page):
 *   window.jsmPicksCapture({
 *     mount: element,                      // where the card is inserted
 *     source: 'first-dance-song-finder',   // must match api/picks.js
 *     getPicks: function () { return [{ title, artist, moment }]; },
 *     getShareUrl: function () { return url; }   // optional
 *   });
 *
 * Posts to /api/picks/, which forwards the lead to Julie and, when email
 * sending is configured, emails the visitor a copy. The success message is
 * chosen from the server's answer, so it never promises an email that was not
 * sent.
 */
(function () {
  'use strict';
  var CSS = '.jsm-picks{background:rgba(26,20,40,.55);border:1px solid rgba(244,239,230,.16);border-radius:6px;padding:36px 28px;margin:0 0 32px;text-align:center}' +
    '.jsm-picks h3{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:400;font-size:26px;color:#fff;margin:0 0 8px}' +
    '.jsm-picks p{font-family:"Cormorant Garamond",Georgia,serif;font-size:17px;line-height:1.55;color:rgba(244,239,230,.82);margin:0 auto 18px;max-width:52ch}' +
    '.jsm-picks form{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:520px;margin:0 auto}' +
    '.jsm-picks input{min-height:48px;padding:10px 14px;background:rgba(244,239,230,.05);border:1px solid rgba(244,239,230,.3);border-radius:6px;color:#F4EFE6;font:16px Inter,system-ui,sans-serif;color-scheme:dark;width:100%}' +
    '.jsm-picks input:focus{outline:none;border-color:#a855f7}' +
    '.jsm-picks button{grid-column:1/-1;min-height:50px;border:0;border-radius:6px;background:linear-gradient(90deg,#7B2CBF,#a855f7);color:#fff;font:600 13px Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}' +
    '.jsm-picks button:disabled{opacity:.6;cursor:wait}' +
    '.jsm-picks label{grid-column:1/-1;display:flex;gap:10px;align-items:flex-start;text-align:left;font:14px Inter,system-ui,sans-serif;color:rgba(244,239,230,.75);line-height:1.45}' +
    '.jsm-picks label input{width:18px;min-height:0;height:18px;margin-top:2px;flex:none}' +
    '.jsm-picks .jsm-note{font:12px Inter,system-ui,sans-serif;color:rgba(244,239,230,.5);margin:12px auto 0}' +
    '.jsm-picks .jsm-err{color:#ff9994;font:14px Inter,system-ui,sans-serif;grid-column:1/-1;margin:0}' +
    '.jsm-picks .jsm-done{color:#8fd6a3;font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;margin:0}' +
    '.jsm-picks .jsm-date{grid-column:1/-1;margin:0;padding:11px 14px;border-radius:6px;border:1px solid rgba(143,214,163,.4);background:rgba(143,214,163,.08);color:#bfe8cb;font:14px/1.5 Inter,system-ui,sans-serif;text-align:left;max-width:none}' +
    '.jsm-picks .jsm-date[data-status="booked"]{border-color:rgba(212,184,114,.5);background:rgba(212,184,114,.08);color:#e6d3a3}' +
    '.jsm-picks .jsm-date[data-status="past"]{border-color:rgba(255,153,148,.45);background:rgba(255,153,148,.07);color:#ffb5b1}' +
    '.jsm-live{display:flex;align-items:center;gap:20px;background:rgba(26,20,40,.55);border:1px solid rgba(244,239,230,.16);border-radius:6px;padding:18px;margin:0 0 20px;text-align:left}' +
    '.jsm-live__clip{position:relative;flex:0 0 112px;width:112px;aspect-ratio:9/16;border-radius:8px;overflow:hidden;background:#000;border:0;padding:0;cursor:pointer}' +
    '.jsm-live__clip img,.jsm-live__clip video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}' +
    '.jsm-live__clip span{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(15,10,26,.7);border:1px solid rgba(212,184,114,.6);display:flex;align-items:center;justify-content:center}' +
    '.jsm-live__clip svg{width:18px;height:18px;fill:#d4b872;margin-left:2px}' +
    '.jsm-live.is-playing{flex-direction:column;align-items:center;text-align:center}.jsm-live.is-playing .jsm-live__clip{flex:none;width:min(260px,100%);cursor:default}' +
    '.jsm-live h3{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:400;font-size:22px;color:#fff;margin:0 0 6px}' +
    '.jsm-live p{font-family:"Cormorant Garamond",Georgia,serif;font-size:17px;line-height:1.5;color:rgba(244,239,230,.82);margin:0}' +
    '@media(max-width:560px){.jsm-picks form{grid-template-columns:1fr}.jsm-picks{padding:28px 18px}}';

  function injectCss() {
    if (document.getElementById('jsm-picks-css')) return;
    var s = document.createElement('style'); s.id = 'jsm-picks-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // A real clip of Julie at a wedding, above the card: what "live" sounds like.
  // It is a performance clip, not a recording of the couple's own picks.
  function liveClip(before) {
    if (document.getElementById('jsmLive')) return;
    var src = '/assets/highlights/clips/the-grand-1.mp4', poster = '/assets/highlights/clips/the-grand-1-poster.jpg';
    var box = document.createElement('div');
    box.className = 'jsm-live'; box.id = 'jsmLive';
    box.innerHTML =
      '<button type="button" class="jsm-live__clip" aria-label="Play clip: Julie playing at a wedding at The Grand">' +
        '<img src="' + poster + '" alt="Julie Schatz playing electric violin at a wedding at The Grand" loading="lazy" decoding="async">' +
        '<span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' +
      '</button>' +
      '<div><h3>Hear Julie live</h3><p>A 35-second clip from a wedding at The Grand, so you can hear what your songs would sound like on live violin.</p></div>';
    before.parentNode.insertBefore(box, before);
    var clip = box.querySelector('.jsm-live__clip');
    clip.addEventListener('click', function () {
      if (box.classList.contains('is-playing')) return;
      var v = document.createElement('video');
      v.src = src; v.poster = poster; v.controls = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('controlslist', 'nodownload noremoteplayback');
      clip.innerHTML = ''; clip.appendChild(v);
      box.classList.add('is-playing');
      if (typeof gtag === 'function') gtag('event', 'video_play', { video_id: src, page: location.pathname });
    });
  }

  window.jsmPicksCapture = function (opts) {
    if (!opts || !opts.mount || document.getElementById('jsmPicks')) return;
    injectCss();
    var card = document.createElement('div');
    card.className = 'jsm-picks'; card.id = 'jsmPicks';
    card.innerHTML =
      '<h3>Is Julie free on your date?</h3>' +
      '<p>Pick your wedding date for an instant answer from her calendar, then get these three songs in your inbox so they are easy to find later.</p>' +
      '<form novalidate>' +
        '<input type="date" name="date" aria-label="Wedding date (optional)">' +
        '<input type="email" name="email" placeholder="Your email" autocomplete="email" required aria-label="Your email">' +
        '<p class="jsm-date" role="status" hidden></p>' +
        '<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;opacity:0">' +
        '<label><input type="checkbox" name="tell" checked> Send these to Julie too and check my date</label>' +
        '<button type="submit">Email me my picks</button>' +
        '<p class="jsm-err" hidden></p>' +
      '</form>' +
      '<p class="jsm-note">No list, no newsletter. Just your picks, and a reply about your date if you asked for one.</p>';
    opts.mount.parentNode.insertBefore(card, opts.mount);
    liveClip(card);

    var form = card.querySelector('form'), err = card.querySelector('.jsm-err'), btn = card.querySelector('button');
    // Instant answer from Julie's public calendar (assets/js/date-check.js), loaded on demand.
    var t = new Date();
    form.date.min = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
    var attach = function () {
      window.jsmDateCheck.attach(form.date, card.querySelector('.jsm-date'));
      form.date.addEventListener('change', function () { if (form.date.value && typeof gtag === 'function') gtag('event', 'date_check', { source: opts.source }); });
    };
    if (window.jsmDateCheck) attach();
    else { var sc = document.createElement('script'); sc.src = '/assets/js/date-check.js'; sc.onload = attach; document.head.appendChild(sc); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Please enter a valid email address.'; err.hidden = false; return; }
      var picks = (opts.getPicks && opts.getPicks()) || [];
      if (!picks.length) { err.textContent = 'Finish the quiz first so there are picks to send.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch('/api/picks/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, window.jsmAttribution ? window.jsmAttribution() : {}, { source: opts.source, email: email, date: form.date.value, picks: picks, shareUrl: opts.getShareUrl ? opts.getShareUrl() : '', _gotcha: form._gotcha.value, note: form.tell.checked ? '' : 'Visitor asked for their picks only.' }))
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Please try again.'); return j; }); })
        .then(function (j) {
          var msg = j.emailed ? 'Sent. Check your inbox for your picks.' : 'Sent to Julie with your picks.';
          if (form.date.value) msg += ' She replies about ' + form.date.value + ' within 24 hours.';
          form.innerHTML = '<p class="jsm-done">' + msg + '</p>';
          if (typeof gtag === 'function') {
            gtag('event', 'picks_email', { source: opts.source, emailed: !!j.emailed });
            // One event per song, so "most picked" can later be counted from real choices.
            picks.forEach(function (p) { gtag('event', 'song_emailed', { song_title: p.title, source: opts.source }); });
          }
          if (window.jsmLead) window.jsmLead(opts.source + '-picks');
          if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Song picks email · ' + opts.source });
        })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Email me my picks'; });
    });
  };
})();
