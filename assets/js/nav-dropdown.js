/* Click-to-toggle for desktop nav dropdowns (.nav-item-has-dropdown).
   Hover and focus already open them via CSS; this covers touch screens and
   people who click. The parent link is a menu opener, not a destination. */
(function () {
  'use strict';
  if (window.__jsmNavDropdown) return;
  window.__jsmNavDropdown = true;
  function init() {
    var items = document.querySelectorAll('.nav-item-has-dropdown');
    if (!items.length) return;
    function closeAll() {
      items.forEach(function (li) {
        li.classList.remove('is-open');
        var t = li.querySelector(':scope > a');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    }
    items.forEach(function (li) {
      var trigger = li.querySelector(':scope > a');
      if (!trigger) return;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        var wasOpen = li.classList.contains('is-open');
        closeAll();
        if (!wasOpen) { li.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); }
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.nav-item-has-dropdown')) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
