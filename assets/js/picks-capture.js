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
    '@media(max-width:560px){.jsm-picks form{grid-template-columns:1fr}.jsm-picks{padding:28px 18px}}';

  function injectCss() {
    if (document.getElementById('jsm-picks-css')) return;
    var s = document.createElement('style'); s.id = 'jsm-picks-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  window.jsmPicksCapture = function (opts) {
    if (!opts || !opts.mount || document.getElementById('jsmPicks')) return;
    injectCss();
    var card = document.createElement('div');
    card.className = 'jsm-picks'; card.id = 'jsmPicks';
    card.innerHTML =
      '<h3>Email me my picks</h3>' +
      '<p>Get these three in your inbox so they are easy to find later. Add your wedding date and Julie will let you know if she is free to play them live.</p>' +
      '<form novalidate>' +
        '<input type="email" name="email" placeholder="Your email" autocomplete="email" required aria-label="Your email">' +
        '<input type="date" name="date" aria-label="Wedding date (optional)">' +
        '<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;opacity:0">' +
        '<label><input type="checkbox" name="tell" checked> Send these to Julie too and check my date</label>' +
        '<button type="submit">Email me my picks</button>' +
        '<p class="jsm-err" hidden></p>' +
      '</form>' +
      '<p class="jsm-note">No list, no newsletter. Just your picks, and a reply about your date if you asked for one.</p>';
    opts.mount.parentNode.insertBefore(card, opts.mount);

    var form = card.querySelector('form'), err = card.querySelector('.jsm-err'), btn = card.querySelector('button');
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
        body: JSON.stringify({ source: opts.source, email: email, date: form.date.value, picks: picks, shareUrl: opts.getShareUrl ? opts.getShareUrl() : '', _gotcha: form._gotcha.value, note: form.tell.checked ? '' : 'Visitor asked for their picks only.' })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Please try again.'); return j; }); })
        .then(function (j) {
          var msg = j.emailed ? 'Sent. Check your inbox for your picks.' : 'Sent to Julie with your picks.';
          if (form.date.value) msg += ' She replies about ' + form.date.value + ' within 24 hours.';
          form.innerHTML = '<p class="jsm-done">' + msg + '</p>';
          if (typeof gtag === 'function') gtag('event', 'picks_email', { source: opts.source, emailed: !!j.emailed });
          if (window.jsmLead) window.jsmLead(opts.source + '-picks');
          if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Song picks email · ' + opts.source });
        })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Email me my picks'; });
    });
  };
})();
