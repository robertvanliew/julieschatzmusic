// Vercel Serverless Function: every inquiry form on the site posts here
// (form action="/api/inquiry/"). Delivery is in lib/lead-delivery.js:
// branded email to Julie + confirmation to the lead, Formspree as fallback.
//
// Accepts multipart/form-data (what `new FormData(form)` sends), urlencoded,
// or JSON. Responds like Formspree so the existing form scripts work as-is:
//   200 { ok: true }                      success
//   400 { errors: [{ message }] }         bad input
//   502 { errors: [{ message }] }         delivery failed
// A plain (non-JS) form post is redirected back to the page with #sent.

'use strict';

const { deliverLead } = require('../lib/lead-delivery.js');
const { spamScore } = require('../lib/spam-check.js');

const MAX_FIELDS = 40;
const MAX_LEN = { message: 4000, context: 2000, ceremony_selections: 4000, quiz_picks: 2000, picks: 2000 };
const AI_NAMES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Copilot', 'Meta AI', 'Grok', 'DeepSeek', 'AI assistant'];

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Fields only (the forms have no file inputs).
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return {};
  const boundary = '--' + (m[1] || m[2]);
  const out = {};
  for (const part of buf.toString('utf8').split(boundary)) {
    const idx = part.indexOf('\r\n\r\n');
    if (idx < 0) continue;
    const head = part.slice(0, idx);
    const name = (/name="([^"]*)"/i.exec(head) || [])[1];
    if (!name || /filename="/i.test(head)) continue;
    out[name] = part.slice(idx + 4).replace(/\r\n$/, '');
  }
  return out;
}

async function readBody(req) {
  const ct = String(req.headers['content-type'] || '');
  let b = req.body;
  if (/multipart\/form-data/i.test(ct)) {
    const raw = Buffer.isBuffer(b) ? b : (typeof b === 'string' ? Buffer.from(b) : await readRaw(req));
    return parseMultipart(raw, ct);
  }
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) { return Object.fromEntries(new URLSearchParams(b)); }
  }
  if (Buffer.isBuffer(b)) {
    const s = b.toString('utf8');
    try { return JSON.parse(s); } catch (e) { return Object.fromEntries(new URLSearchParams(s)); }
  }
  if (b && typeof b === 'object') return b;
  const raw = (await readRaw(req)).toString('utf8');
  try { return JSON.parse(raw); } catch (e) { return Object.fromEntries(new URLSearchParams(raw)); }
}

function sitePage(url) {
  try {
    const u = new URL(url);
    return /(^|\.)julieschatzmusic\.com$/.test(u.hostname) ? u.origin + u.pathname : '';
  } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ errors: [{ message: 'POST only.' }] });
  const wantsJson = /application\/json/i.test(String(req.headers.accept || ''));
  const back = sitePage(req.headers.referer || '') || 'https://julieschatzmusic.com/';
  const reply = (status, body) => {
    if (wantsJson) return res.status(status).json(body);
    if (status === 200) { res.statusCode = 303; res.setHeader('Location', back + '#sent'); return res.end(); }
    return res.status(status).send((body.errors && body.errors[0] && body.errors[0].message) || 'Error');
  };

  let raw;
  try { raw = await readBody(req); } catch (e) { return reply(400, { errors: [{ message: 'Could not read the form.' }] }); }
  if (!raw || typeof raw !== 'object') return reply(400, { errors: [{ message: 'Could not read the form.' }] });
  if (raw._gotcha) return reply(200, { ok: true }); // honeypot: pretend success

  const fields = {};
  for (const k of Object.keys(raw).slice(0, MAX_FIELDS)) {
    if (!/^[a-z_][a-z0-9_]{0,40}$/i.test(k)) continue;
    const v = clean(raw[k], MAX_LEN[k] || 600);
    if (v) fields[k] = v;
  }

  const email = fields.email || (/@/.test(fields.contact || '') ? fields.contact : '');
  const phoneDigits = String(fields.phone || (!/@/.test(fields.contact || '') ? fields.contact || '' : '')).replace(/\D/g, '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(400, { errors: [{ message: 'Please enter a valid email address.' }] });
  if (!email && phoneDigits.length < 10) return reply(400, { errors: [{ message: 'Please include an email address or phone number so Julie can reply.' }] });

  // Spam that skips the browser (links in the name, 1980 dates, bot timing): pretend success, never deliver.
  const spam = spamScore(fields);
  if (spam.spam) {
    console.warn('[inquiry] spam blocked', spam.score, spam.reasons.join('; '), clean(fields.form_source, 60));
    return reply(200, { ok: true });
  }

  const aiRaw = clean(fields.ai_referral, 40);
  const ai = AI_NAMES.find(n => n.toLowerCase() === aiRaw.toLowerCase()) || '';

  try {
    const r = await deliverLead({
      fields, source: clean(fields.form_source, 60) || 'website',
      page: sitePage(fields.page_url || fields._landing_url || req.headers.referer || ''), ai,
    });
    return reply(200, { ok: true, via: r.via, confirmed: r.confirmed, reason: r.reason || undefined });
  } catch (e) {
    console.error('[inquiry]', e.message);
    return reply(502, { errors: [{ message: 'That did not go through. Please try again, or email bookings@julieschatzmusic.com.' }] });
  }
};
