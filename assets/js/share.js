/* Julie Schatz — blog post sharing.
 * "Share to Story" fetches the branded share card image and hands it to
 *   navigator.share({ files: [...] }) — on mobile, this opens the native share
 *   sheet where the user picks Instagram Stories (or WhatsApp Status, etc.)
 *   and the image drops straight in. On desktop or unsupported browsers,
 *   the card is downloaded so the user can post it manually.
 * "Native share" opens the OS share sheet with just the URL (no image).
 * Also supports Meta Pixel event tracking (fbTrack helper installed globally
 * by /assets/js/meta-conversions.js) so shares register as conversions. */
(function () {
  'use strict';

  function flash(el, msg) {
    if (!el) return;
    var prev = el.getAttribute('data-label') || el.textContent;
    el.setAttribute('data-label', prev);
    el.textContent = msg;
    setTimeout(function () { el.textContent = prev; }, 1600);
  }

  function trackShare(method, contentName) {
    if (typeof window.fbTrack === 'function') {
      try {
        window.fbTrack('Share', {
          content_name: contentName || document.title,
          content_category: 'Blog',
          method: method
        });
      } catch (_) {}
    }
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'share', {
          method: method,
          content_type: 'blog_post',
          item_id: window.location.pathname
        });
      } catch (_) {}
    }
  }

  function init(box) {
    var url = box.dataset.url || window.location.href;
    var title = box.dataset.title || document.title;
    var name = box.dataset.name || 'Julie Schatz';
    var card = box.dataset.card;

    function btn(act) { return box.querySelector('[data-act="' + act + '"]'); }
    function on(act, fn) { var el = btn(act); if (el) el.addEventListener('click', fn); }

    function copyLink() {
      var done = function () { flash(btn('copy'), 'Copied!'); trackShare('copy_link', title); };
      var fail = function () { window.prompt('Copy this link:', url); trackShare('copy_link', title); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fail);
      } else { fail(); }
    }

    on('native', function (e) {
      e.preventDefault();
      if (navigator.share) {
        navigator.share({ title: title, text: name + ' · julieschatzmusic.com', url: url })
          .then(function () { trackShare('native_share', title); })
          .catch(function () {});
      } else { copyLink(); }
    });

    on('copy', function (e) { e.preventDefault(); copyLink(); });

    on('story', function (e) {
      e.preventDefault();
      var b = btn('story');
      if (!card) {
        // No card defined — fall back to native share
        if (navigator.share) {
          navigator.share({ title: title, text: name + ' · julieschatzmusic.com', url: url })
            .then(function () { trackShare('story_share_url_only', title); })
            .catch(function () {});
        } else { copyLink(); }
        return;
      }
      var slug = (title || 'julie-schatz').replace(/[^\w]+/g, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 60);
      fetch(card).then(function (r) {
        if (!r.ok) throw new Error('fetch-failed');
        return r.blob();
      }).then(function (blob) {
        var file = new File([blob], 'julie-schatz-' + slug + '.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({
            files: [file],
            title: title,
            text: name + ' · julieschatzmusic.com',
            url: url
          }).then(function () { trackShare('story_share_with_image', title); });
        }
        throw new Error('no-file-share');
      }).catch(function () {
        // Fallback: download the card so it can be posted manually
        var a = document.createElement('a');
        a.href = card;
        a.download = 'julie-schatz-' + slug + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        flash(b, 'Card saved');
        trackShare('story_download_fallback', title);
      });
    });

    // Attribution for the standard buttons too
    ['x', 'facebook', 'linkedin', 'pinterest', 'email'].forEach(function (act) {
      var el = btn(act);
      if (el) {
        el.addEventListener('click', function () { trackShare(act, title); });
      }
    });
  }

  function boot() { document.querySelectorAll('.share, .post-share').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
