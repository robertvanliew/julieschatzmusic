/**
 * Music Plan — cross-finder localStorage state + sticky progress bar.
 * Shared across the wedding song finder hub and each spoke.
 * See wedding-song-finder-build-spec.md §4.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'jsm_music_plan';

  var MOMENTS = [
    { slug: 'walking-down-the-aisle', label: 'Walking Down the Aisle', url: '/walking-down-the-aisle-song-finder/' },
    { slug: 'first-dance',            label: 'First Dance',            url: '/first-dance-song-finder/' },
    { slug: 'parent-dance',           label: 'Parent Dance',           url: '/parent-dance-song-finder/' },
    { slug: 'wedding-party-entrance', label: 'Wedding Party Entrance', url: '/wedding-party-entrance-song-finder/', unbuilt: true },
    { slug: 'reception-entrance',     label: 'Reception Entrance',     url: '/reception-entrance-song-finder/', unbuilt: true },
    { slug: 'cocktail-hour',          label: 'Cocktail Hour',          url: '/cocktail-hour-playlist-builder/', unbuilt: true }
  ];

  var BUILT_MOMENTS = MOMENTS.filter(function (m) { return !m.unbuilt; });
  var TOTAL_BUILT = BUILT_MOMENTS.length;

  function readPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }

  function writePlan(plan) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); } catch (e) {}
  }

  function savedCount(plan) {
    return BUILT_MOMENTS.reduce(function (n, m) { return n + (plan[m.slug] ? 1 : 0); }, 0);
  }

  function savePick(momentSlug, pick) {
    var plan = readPlan();
    plan[momentSlug] = {
      title: pick.title,
      artist: pick.artist,
      inRepertoire: !!pick.inRepertoire,
      savedAt: new Date().toISOString(),
      quizAnswers: pick.quizAnswers || null
    };
    writePlan(plan);
    render();
    return plan;
  }

  function removePick(momentSlug) {
    var plan = readPlan();
    delete plan[momentSlug];
    writePlan(plan);
    render();
    return plan;
  }

  function clearPlan() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    render();
  }

  function nextUnfilled(plan) {
    for (var i = 0; i < BUILT_MOMENTS.length; i++) {
      if (!plan[BUILT_MOMENTS[i].slug]) return BUILT_MOMENTS[i];
    }
    return null;
  }

  function ensureBar() {
    if (document.getElementById('jsmMusicPlanBar')) return document.getElementById('jsmMusicPlanBar');
    var bar = document.createElement('div');
    bar.id = 'jsmMusicPlanBar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Your Wedding Music Plan');
    bar.innerHTML = [
      '<div class="jsm-mp-inner">',
      '  <button type="button" class="jsm-mp-toggle" id="jsmMpToggle" aria-expanded="false" aria-controls="jsmMpBody">',
      '    <span class="jsm-mp-kicker">Your Wedding Music Plan</span>',
      '    <span class="jsm-mp-count" id="jsmMpCount">0 of ' + TOTAL_BUILT + '</span>',
      '    <span class="jsm-mp-progress" aria-hidden="true"><span class="jsm-mp-fill" id="jsmMpFill"></span></span>',
      '    <span class="jsm-mp-caret" aria-hidden="true">▾</span>',
      '  </button>',
      '  <div class="jsm-mp-body" id="jsmMpBody" hidden>',
      '    <ul class="jsm-mp-list" id="jsmMpList"></ul>',
      '    <div class="jsm-mp-actions">',
      '      <a class="jsm-mp-cta" id="jsmMpCta" href="/wedding-ceremony-songs/">Bring these into your ceremony builder →</a>',
      '      <button type="button" class="jsm-mp-reset" id="jsmMpReset">Reset plan</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(bar);

    var toggle = bar.querySelector('#jsmMpToggle');
    toggle.addEventListener('click', function () {
      var body = document.getElementById('jsmMpBody');
      var open = !body.hasAttribute('hidden');
      if (open) { body.setAttribute('hidden', ''); toggle.setAttribute('aria-expanded', 'false'); bar.classList.remove('is-open'); }
      else       { body.removeAttribute('hidden');   toggle.setAttribute('aria-expanded', 'true');  bar.classList.add('is-open'); }
    });
    bar.querySelector('#jsmMpReset').addEventListener('click', function () {
      if (confirm('Reset your Wedding Music Plan? Saved picks will be cleared.')) clearPlan();
    });
    return bar;
  }

  function render() {
    var plan = readPlan();
    var count = savedCount(plan);
    if (count === 0) {
      var existing = document.getElementById('jsmMusicPlanBar');
      if (existing) existing.remove();
      return;
    }
    var bar = ensureBar();
    document.getElementById('jsmMpCount').textContent = count + ' of ' + TOTAL_BUILT;
    var pct = Math.round((count / TOTAL_BUILT) * 100);
    document.getElementById('jsmMpFill').style.width = pct + '%';

    var list = document.getElementById('jsmMpList');
    var html = '';
    BUILT_MOMENTS.forEach(function (m) {
      var saved = plan[m.slug];
      if (saved) {
        html += '<li class="jsm-mp-item is-saved">' +
          '<div class="jsm-mp-item-main">' +
            '<span class="jsm-mp-moment">' + escapeHtml(m.label) + '</span>' +
            '<span class="jsm-mp-song">' + escapeHtml(saved.title) + ' <em>· ' + escapeHtml(saved.artist) + '</em>' +
              (saved.inRepertoire ? ' <span class="jsm-mp-live">Julie plays live</span>' : '') +
            '</span>' +
          '</div>' +
          '<button type="button" class="jsm-mp-remove" data-remove="' + m.slug + '" aria-label="Remove ' + escapeHtml(m.label) + '">×</button>' +
        '</li>';
      } else {
        html += '<li class="jsm-mp-item">' +
          '<div class="jsm-mp-item-main">' +
            '<span class="jsm-mp-moment">' + escapeHtml(m.label) + '</span>' +
            '<a class="jsm-mp-next" href="' + m.url + '">Start quiz →</a>' +
          '</div>' +
        '</li>';
      }
    });
    list.innerHTML = html;
    list.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { removePick(btn.getAttribute('data-remove')); });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Public API
  window.JSMMusicPlan = {
    read: readPlan,
    save: savePick,
    remove: removePick,
    clear: clearPlan,
    render: render,
    nextUnfilled: nextUnfilled,
    savedCount: function () { return savedCount(readPlan()); },
    moments: MOMENTS,
    builtMoments: BUILT_MOMENTS,
    totalBuilt: TOTAL_BUILT
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
