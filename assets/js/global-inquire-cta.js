/**
 * Global persistent inquiry CTA — floating bottom-right pill on every page.
 * Skips pages that already have their own inline sticky/floating CTA
 * (NJ landing modal, corporate call/inquiry modals) to avoid double-CTA collision.
 * Adds a small "Inquire" pill that appears after the user scrolls past the fold
 * and links to /#inquire (or a page-defined override via [data-inquire-href]).
 */
(function () {
  'use strict';

  // Skip if page already has an inline sticky CTA — prevents visual collision.
  if (document.querySelector('.nj-sticky-cta, .corp-cta-btn[data-corp-cta]')) return;
  // Skip if body opts out.
  if (document.body && document.body.hasAttribute('data-no-inquire-cta')) return;

  // Where the CTA points. Page can override via <body data-inquire-href="/foo">.
  var href = (document.body && document.body.getAttribute('data-inquire-href')) || '/#inquire';
  var label = (document.body && document.body.getAttribute('data-inquire-label')) || 'Inquire →';

  var style = document.createElement('style');
  style.textContent = [
    '.jsm-global-cta{',
      'position:fixed;right:24px;bottom:24px;z-index:900;',
      'padding:12px 22px;',
      'background:linear-gradient(90deg,#7B2CBF,#a855f7);',
      'color:#F4EFE6;text-decoration:none;',
      'font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;',
      'font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;',
      'border-radius:999px;border:0;cursor:pointer;',
      'box-shadow:0 12px 32px rgba(123,44,191,0.45),0 0 0 1px rgba(255,255,255,0.06);',
      'opacity:0;transform:translateY(120%);',
      'transition:opacity 300ms cubic-bezier(0.23,1,0.32,1),transform 350ms cubic-bezier(0.32,0.72,0,1),filter 200ms;',
      'pointer-events:none;',
    '}',
    '.jsm-global-cta.is-visible{opacity:1;transform:translateY(0);pointer-events:auto;}',
    '.jsm-global-cta:hover{filter:brightness(1.12);}',
    '.jsm-global-cta:active{transform:translateY(0) scale(0.97);transition-duration:100ms;}',
    '.jsm-global-cta:focus-visible{outline:none;box-shadow:0 12px 32px rgba(123,44,191,0.45),0 0 0 3px rgba(212,184,114,0.5);}',
    '@media(max-width:480px){.jsm-global-cta{right:12px;bottom:12px;padding:11px 18px;font-size:11px;}}',
    '@media print{.jsm-global-cta{display:none!important;}}'
  ].join('');
  document.head.appendChild(style);

  var el = document.createElement('a');
  el.className = 'jsm-global-cta';
  el.href = href;
  el.textContent = label;
  el.setAttribute('data-jsm-global-cta', '');
  document.body.appendChild(el);

  // Show after user scrolls past 60% of first viewport (past the fold).
  var threshold = Math.max(300, window.innerHeight * 0.6);
  var shown = false;
  function onScroll() {
    var scrolled = window.pageYOffset || document.documentElement.scrollTop;
    var visible = scrolled > threshold;
    if (visible !== shown) {
      shown = visible;
      el.classList.toggle('is-visible', shown);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    threshold = Math.max(300, window.innerHeight * 0.6);
    onScroll();
  });
  onScroll();

  el.addEventListener('click', function () {
    if (typeof gtag === 'function') gtag('event', 'global_cta_click', { page: location.pathname });
    if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Global site inquiry CTA' });
  });
})();
