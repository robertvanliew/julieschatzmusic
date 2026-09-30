// Vercel Serverless Function: "Email me my picks" for the song finders and the
// ceremony song picker.
//
// Two things happen on every call:
//   1. The lead (email, date, picks) is forwarded to Formspree, so Julie gets
//      it like any other inquiry.
//   2. If email sending is configured, the visitor gets a copy of their picks.
//
// Env vars (Vercel dashboard -> Settings -> Environment Variables):
//   FORMSPREE_ENDPOINT  optional, defaults to the site's form
//   RESEND_API_KEY      optional. When set together with RESEND_FROM, the
//                       visitor receives an email. Without it, the lead still
//                       reaches Julie and the page says so honestly.
//   RESEND_FROM         e.g. "Julie Schatz Music <hello@julieschatzmusic.com>"
//                       (the domain must be verified in Resend)
//
// Client contract (POST /api/picks/):
//   { source, email, name?, date?, picks: [{ title, artist, moment? }], shareUrl?, note? }
// Response: { ok, emailed }

const FORMSPREE = process.env.FORMSPREE_ENDPOINT || 'https://formspree.io/f/xjgjdeya';
const SOURCES = {
  'first-dance-song-finder': 'First Dance Song Finder',
  'walking-down-the-aisle-song-finder': 'Walking Down the Aisle Song Finder',
  'parent-dance-song-finder': 'Parent Dance Song Finder',
  'repertoire-builder': 'Ceremony Song Picker',
  'repertoire-builder-holiday': 'Holiday Song Picker',
};

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function validate(body) {
  const source = clean(body.source, 40);
  if (!SOURCES[source]) throw new Error('Unknown source.');
  const email = clean(body.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Please enter a valid email address.');
  const date = clean(body.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Please enter a valid date.');
  const picks = (Array.isArray(body.picks) ? body.picks : []).slice(0, 20).map(p => ({
    title: clean(p && p.title, 120), artist: clean(p && p.artist, 120), moment: clean(p && p.moment, 60),
  })).filter(p => p.title);
  if (!picks.length) throw new Error('There are no picks to send yet.');
  let shareUrl = clean(body.shareUrl, 600);
  if (shareUrl && !/^https:\/\/julieschatzmusic\.com\//.test(shareUrl)) shareUrl = '';
  return { source, label: SOURCES[source], email, name: clean(body.name, 80), date, picks, shareUrl, note: clean(body.note, 500) };
}

function picksText(d) {
  return d.picks.map((p, i) => (p.moment ? p.moment + ': ' : (i + 1) + '. ') + p.title + (p.artist ? ' · ' + p.artist : '')).join('\n');
}

async function forwardToJulie(d) {
  const res = await fetch(FORMSPREE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      _subject: 'Song picks · ' + d.label + (d.date ? ' · ' + d.date : ''),
      form_source: d.source + '-picks',
      email: d.email, name: d.name || '', event_date: d.date || '', picks: picksText(d), share_url: d.shareUrl || '', message: d.note || '',
    }),
  });
  if (!res.ok) throw new Error('Formspree ' + res.status);
}

async function emailVisitor(d) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return false;
  const lines = d.picks.map((p, i) => '<li>' + (p.moment ? '<strong>' + esc(p.moment) + ':</strong> ' : '') + esc(p.title) + (p.artist ? ' <span style="color:#666">· ' + esc(p.artist) + '</span>' : '') + '</li>').join('');
  const html = '<div style="font-family:Georgia,serif;font-size:17px;line-height:1.6;color:#222;max-width:560px">' +
    '<p>Hi' + (d.name ? ' ' + esc(d.name) : '') + ',</p>' +
    '<p>Here are the picks you saved from the ' + esc(d.label) + ':</p>' +
    '<ol style="padding-left:22px">' + lines + '</ol>' +
    (d.shareUrl ? '<p><a href="' + esc(d.shareUrl) + '">Open your picks again</a></p>' : '') +
    (d.date ? '<p>You mentioned <strong>' + esc(d.date) + '</strong>. I will check that date and get back to you within 24 hours.</p>' : '<p>If you have a date in mind, reply to this email and I will check it.</p>') +
    '<p>Julie Schatz<br>Violin, piano and vocals for weddings and events<br><a href="https://julieschatzmusic.com/">julieschatzmusic.com</a> · 631-365-9554</p></div>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM, to: [d.email], reply_to: 'bookings@julieschatzmusic.com',
      subject: 'Your song picks from Julie Schatz Music', html,
      text: 'Your picks from the ' + d.label + ':\n\n' + picksText(d) + (d.shareUrl ? '\n\nOpen them again: ' + d.shareUrl : '') + '\n\nJulie Schatz · julieschatzmusic.com · 631-365-9554',
    }),
  });
  if (!res.ok) { console.error('[picks] Resend ' + res.status); return false; }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Bad request.' });
  if (body._gotcha) return res.status(200).json({ ok: true, emailed: false }); // honeypot: pretend success

  let d;
  try { d = validate(body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try { await forwardToJulie(d); }
  catch (e) { console.error('[picks]', e.message); return res.status(502).json({ error: 'That did not go through. Please try again in a moment.' }); }
  const emailed = await emailVisitor(d);
  return res.status(200).json({ ok: true, emailed });
};
