/* "Is my date open?" — instant answer from Julie's public calendar.
 *
 * Reads /assets/data/booked-dates.json, which the admin regenerates every
 * time Julie saves her event dates. It lists dates only.
 *
 *   window.jsmDateCheck(ymd)        -> Promise<{ status, message }>
 *       status: 'open' | 'booked' | 'past' | 'invalid'
 *   window.jsmDateCheck.attach(inputEl, outputEl)
 *       shows the answer next to a date input as it changes
 *
 * Honest by design: "open" means no conflict on the public calendar, and the
 * wording says Julie confirms. It never claims a firm yes.
 */
(function () {
  'use strict';
  var cache = null;
  function load() {
    if (cache) return cache;
    cache = fetch('/assets/data/booked-dates.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : { dates: [] }; })
      .catch(function () { return { dates: [] }; });
    return cache;
  }
  function pretty(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function check(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return Promise.resolve({ status: 'invalid', message: '' });
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var m = ymd.split('-'); var d = new Date(+m[0], +m[1] - 1, +m[2]);
    if (d < today) return Promise.resolve({ status: 'past', message: 'That date has already passed.' });
    return load().then(function (data) {
      var booked = (data.dates || []).indexOf(ymd) !== -1;
      return booked
        ? { status: 'booked', message: 'Julie already has a booking on ' + pretty(ymd) + '. Send yours anyway: depending on the times, she may still be able to do both, or suggest an alternative.' }
        : { status: 'open', message: 'No conflict on Julie’s calendar for ' + pretty(ymd) + '. Send your details and she confirms within 24 hours.' };
    });
  }
  check.attach = function (input, output) {
    if (!input || !output) return;
    var run = function () {
      check(input.value).then(function (r) {
        output.textContent = r.message;
        output.setAttribute('data-status', r.status);
        output.hidden = !r.message;
      });
    };
    input.addEventListener('change', run);
    input.addEventListener('input', run);
    if (input.value) run();
  };
  window.jsmDateCheck = check;
})();
