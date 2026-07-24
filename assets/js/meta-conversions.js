/*
 * Meta Conversions helper — dual-fires events to browser Pixel AND server CAPI
 * with a shared event_id so Meta deduplicates them.
 *
 * Loaded on every page. On page load:
 *   - Fires ViewContent with a category derived from the URL path
 *   - Wires phone (tel:) and email (mailto:) link clicks -> Contact event
 *
 * Exposed API for form-submit code to call:
 *   window.fbTrack(eventName, customData, userData)
 *     - eventName: "Lead" | "CompleteRegistration" | "Contact" | ... (Meta standard events)
 *     - customData: { value, currency, content_name, content_category, ... }
 *     - userData:   { email, phone, first_name, last_name }
 *
 * Meta dedups events matching event_name + event_id across Pixel + CAPI.
 */

(function () {
  'use strict';

  // Generate a UUID v4 for event_id (works cross-browser)
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Read the Meta browser cookies (fbc, fbp) — used for stronger CAPI match
  function readMetaCookies() {
    var out = {};
    var cookies = (document.cookie || '').split(';');
    for (var i = 0; i < cookies.length; i++) {
      var c = cookies[i].trim();
      if (c.indexOf('_fbp=') === 0) out.fbp = c.substring(5);
      else if (c.indexOf('_fbc=') === 0) out.fbc = c.substring(5);
    }
    return out;
  }

  // Send event to server CAPI via our /api/track endpoint
  function sendToServer(eventName, eventId, customData, userData) {
    var meta = readMetaCookies();
    var enrichedUserData = Object.assign({}, userData || {}, meta);

    var body = JSON.stringify({
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      custom_data: customData || {},
      user_data: enrichedUserData,
    });

    // Prefer sendBeacon for fire-and-forget reliability during page unload
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'application/json' });
      var ok = navigator.sendBeacon('/api/track', blob);
      if (ok) return;
    }
    // Fallback to fetch keepalive
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // Fire event to both browser Pixel and server CAPI with a shared event_id
  window.fbTrack = function (eventName, customData, userData) {
    if (!eventName) return;
    var eventId = uuid();
    customData = customData || {};
    userData = userData || {};

    // Browser Pixel
    if (typeof window.fbq === 'function') {
      window.fbq('track', eventName, customData, { eventID: eventId });
    }

    // Server CAPI
    sendToServer(eventName, eventId, customData, userData);
  };

  // Category derived from URL path so ViewContent segments cleanly
  function pageCategory() {
    var path = window.location.pathname || '/';
    if (path === '/' || path === '/index.html') return 'Home';
    if (path.indexOf('/wedding-violinist-pricing') === 0) return 'Pricing';
    if (path.indexOf('/first-dance-song-finder') === 0) return 'Song Finder';
    if (path.indexOf('/bookings') === 0) return 'Bookings';
    if (path.indexOf('/wedding-dj') === 0) return 'DJ Services';
    if (path.indexOf('/hip-hop-violin-dj') === 0) return 'DJ Services';
    if (path.indexOf('/dj-violin-duo') === 0) return 'DJ Services';
    if (path.indexOf('/solo-violin-piano') === 0) return 'Solo Services';
    if (path.indexOf('/wedding-violinist-') === 0) return 'Region or Venue';
    if (path.indexOf('/wedding-ceremony-songs') === 0) return 'Repertoire';
    if (path.indexOf('/sample-pack') === 0) return 'Store';
    if (path.indexOf('/beats') === 0) return 'Store';
    if (path.indexOf('/blog') === 0) return 'Blog';
    if (path.indexOf('/venues') === 0) return 'Venues';
    if (path.indexOf('/faq') === 0) return 'FAQ';
    return 'Other';
  }

  // Fire ViewContent on every page load (auto)
  function fireViewContent() {
    window.fbTrack('ViewContent', {
      content_name: document.title || pageCategory(),
      content_category: pageCategory(),
    });
  }

  // Wire phone (tel:) and email (mailto:) link clicks -> Contact event
  function wireContactLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a || !a.href) return;
      var href = a.href.toLowerCase();
      if (href.indexOf('tel:') === 0 || href.indexOf('mailto:') === 0) {
        window.fbTrack('Contact', {
          content_name: href.indexOf('tel:') === 0 ? 'Phone Click' : 'Email Click',
        });
      }
    }, { capture: false, passive: true });
  }

  // Only auto-fire once the Pixel has loaded (fbq exists)
  function whenPixelReady(cb) {
    if (typeof window.fbq === 'function') return cb();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof window.fbq === 'function' || tries > 40) {
        clearInterval(iv);
        cb();
      }
    }, 100);
  }

  whenPixelReady(function () {
    fireViewContent();
    wireContactLinks();
  });
})();
