// Server-side spam scoring for site forms (api/inquiry.js, api/picks.js).
//
// Formspree used to filter spam before leads reached Julie. Since forms post to
// our own endpoint, bots that skip the browser (and its honeypot and timing
// checks) reach us directly; in Oct 2026 a Russian "registry reward, confirm:
// <link>" campaign started arriving. Each signal adds points and a submission is
// spam at SPAM_THRESHOLD or more, so no single soft signal (for example a name
// written in Cyrillic) blocks a real couple on its own.
//
// spamScore(fields) -> { score, reasons[] }

'use strict';

const SPAM_THRESHOLD = 3;

// Fields where a real person never types a link.
const NO_LINK_FIELDS = ['name', 'company', 'role', 'phone', 'contact', 'venue', 'event_type', 'event_times', 'guest_count', 'budget', 'referral', 'event_date', 'service'];
const FREE_TEXT = ['message', 'context', 'ceremony_selections', 'quiz_picks', 'picks'];
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:buzz|xyz|top|click|site|online|shop|icu|live|ru|su|cn|tk|ml|ga|cf|gq|link|info|biz)\b)/i;
const LINKS_G = /(https?:\/\/|www\.)/gi;
const NON_LATIN = /[Ѐ-ӿ一-鿿؀-ۿ]/; // Cyrillic, CJK, Arabic
const CODE_TOKEN = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{12,}\b/; // e.g. NFDAW332802SVWVE
const SPAM_WORDS = /(вознагражд|подтверд|выплат|компенсац|bitcoin|crypto|forex|casino|viagra|backlinks?|guest post|seo services|web ?design services|increase your traffic|ranking on google)/i;

function spamScore(fields, opts) {
  const f = fields || {};
  const reasons = [];
  const add = (n, why) => { reasons.push(why + ' +' + n); score += n; };
  let score = 0;

  for (const k of NO_LINK_FIELDS) if (f[k] && LINK.test(f[k])) { add(k === 'name' ? 4 : 3, 'link in ' + k); break; }
  const allText = Object.values(f).join(' ');
  const linkCount = FREE_TEXT.reduce((n, k) => n + ((f[k] || '').match(LINKS_G) || []).length, 0);
  if (linkCount > 2) add(2, linkCount + ' links in message');
  if (SPAM_WORDS.test(allText)) add(3, 'spam phrase');
  if (CODE_TOKEN.test(allText)) add(2, 'random code token');
  if (NON_LATIN.test(allText)) add(1, 'non-Latin script');

  // Event dates in the past or absurdly far out.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.event_date || '');
  if (m) {
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const now = Date.now();
    if (d < now - 2 * 86400000) add(2, 'event date in the past');
    else if (d > now + 6 * 365 * 86400000) add(2, 'event date more than 6 years out');
  }

  // Forms stamp _loaded_at when the page loads; humans take more than a few seconds.
  const loaded = parseInt(f._loaded_at, 10);
  if (loaded > 1e12) {
    const elapsed = Date.now() - loaded;
    if (elapsed >= 0 && elapsed < 2500) add(3, 'submitted ' + elapsed + 'ms after load');
  }

  const digits = String(f.phone || '').replace(/\D/g, '');
  if (f.phone && (digits.length < 7 || digits.length > 15)) add(1, 'implausible phone');
  if ((f.name || '').length > 70) add(1, 'very long name');

  return { score, reasons, spam: score >= SPAM_THRESHOLD };
}

module.exports = { spamScore, SPAM_THRESHOLD };
