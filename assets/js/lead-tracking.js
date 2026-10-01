/* One GA4 event for every inquiry on the site: generate_lead.
 *
 * Every form that reaches Julie calls window.jsmLead(...) on success, so GA4
 * sees the same event name with the same parameters no matter which page or
 * tool produced the inquiry:
 *
 *   form_source  which form/tool  (e.g. "pricing-quote-tool", "first-dance-song-finder")
 *   referral     the "how did you hear about Julie" answer, when the form has one
 *   event_type   the package/event type chosen, when the form has one
 *   page_path    the page the inquiry came from (GA4 also records page_location)
 *
 * Mark generate_lead as a key event in GA4 (Admin > Events) and register
 * form_source, referral and event_type as event-scoped custom dimensions
 * (Admin > Custom definitions). Then any report can be broken down by them.
 *
 * Usage:
 *   window.jsmLead(formElement)                // reads the fields off the form
 *   window.jsmLead('pricing-quote-tool', {...}) // explicit source + extras
 * Idempotent per form element, so a double-fire cannot double-count.
 */
(function () {
  'use strict';
  function val(form, name) {
    if (!form || !form.querySelector) return '';
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return '';
    if (el.tagName === 'SELECT' && el.selectedIndex >= 0) return (el.options[el.selectedIndex].text || el.value || '').trim().slice(0, 100);
    return (el.value || '').trim().slice(0, 100);
  }
  window.jsmLead = function (source, extra) {
    var form = null, params = {};
    if (source && typeof source === 'object') {
      form = source;
      if (form.dataset && form.dataset.jsmLeadSent) return;
      if (form.dataset) form.dataset.jsmLeadSent = '1';
      params.form_source = val(form, 'form_source') || form.id || 'form';
      params.referral = val(form, 'referral') || val(form, 'heard_from') || '';
      params.event_type = val(form, 'event_type') || val(form, 'service') || val(form, 'package') || '';
    } else {
      params.form_source = String(source || 'form');
    }
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] != null && extra[k] !== '') params[k] = String(extra[k]).slice(0, 100); });
    params.page_path = window.location.pathname;
    if (!params.referral) delete params.referral;
    if (!params.event_type) delete params.event_type;
    if (typeof gtag === 'function') gtag('event', 'generate_lead', params);
  };

  // Pages that report leads to Meta through fbTrack('Lead', ...) get the GA4
  // event automatically, with content_name as the source.
  var tries = 0;
  (function wrapFbTrack() {
    if (typeof window.fbTrack === 'function' && !window.fbTrack.__jsmWrapped) {
      var orig = window.fbTrack;
      var wrapped = function (eventName, customData, userData) {
        if (eventName === 'Lead') window.jsmLead((customData && (customData.form_source || customData.content_name)) || 'lead');
        return orig.apply(this, arguments);
      };
      wrapped.__jsmWrapped = true;
      window.fbTrack = wrapped;
    } else if (tries++ < 20 && typeof window.fbTrack !== 'function') {
      setTimeout(wrapFbTrack, 250);
    }
  })();
})();
