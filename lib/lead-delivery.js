// Delivers a lead to Julie. Used by api/inquiry.js (every site form),
// api/picks.js (song finder "email me my picks") and api/mcp.js (AI assistants).
//
//   1. Branded email to Julie through Resend (lib/inquiry-email.js), reply-to set
//      to the lead so "Reply" answers them directly.
//   2. A "got your inquiry" confirmation to the lead (unless skipConfirmation).
//   3. Formspree as the fallback: used when Resend is not configured or fails,
//      so a lead is never lost.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   RESEND_API_KEY, RESEND_FROM   already set for the song finder emails
//   INQUIRY_TO                    the inbox Julie reads, e.g. "bookings@julieschatzmusic.com"
//                                 (comma-separate for more than one). Until it is set,
//                                 leads keep going through Formspree exactly as before.
//   FORMSPREE_ENDPOINT            optional, defaults to the site's form

'use strict';

const { buildLeadEmail, buildConfirmationEmail, sourceLabel, emailOf } = require('./inquiry-email.js');

const SITE = 'https://julieschatzmusic.com';
const FORMSPREE = process.env.FORMSPREE_ENDPOINT || 'https://formspree.io/f/xjgjdeya';

async function dateStatus(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(SITE + '/assets/data/booked-dates.json', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const j = await r.json();
    return (j.dates || []).includes(ymd) ? 'booked' : 'open';
  } catch (e) { return ''; }
}

async function resendSend(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: process.env.RESEND_FROM }, msg)),
  });
  if (!res.ok) throw new Error('Resend ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

async function formspreeSend(fields, source) {
  const res = await fetch(FORMSPREE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(Object.assign({}, fields, { form_source: source })),
  });
  if (!res.ok) throw new Error('Formspree ' + res.status);
}

// lead: { fields, source, page?, ai?, skipConfirmation? }
// -> { ok: true, via: 'resend' | 'formspree', confirmed: boolean }
async function deliverLead(lead) {
  const fields = lead.fields || {};
  const source = lead.source || fields.form_source || 'website';
  const full = {
    fields, source, sourceLabel: sourceLabel(source), page: lead.page || '', ai: lead.ai || '',
    dateStatus: await dateStatus(fields.event_date),
  };
  const to = String(process.env.INQUIRY_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  const resendReady = process.env.RESEND_API_KEY && process.env.RESEND_FROM && to.length;

  if (resendReady) {
    try {
      const mail = buildLeadEmail(full);
      const leadEmail = emailOf(fields);
      await resendSend({ to, reply_to: leadEmail || undefined, subject: mail.subject, html: mail.html, text: mail.text });
      let confirmed = false;
      if (leadEmail && !lead.skipConfirmation) {
        try {
          const c = buildConfirmationEmail(full);
          await resendSend({ to: [leadEmail], reply_to: to[0], subject: c.subject, html: c.html, text: c.text });
          confirmed = true;
        } catch (e) { console.error('[lead] confirmation failed:', e.message); }
      }
      return { ok: true, via: 'resend', confirmed };
    } catch (e) {
      console.error('[lead] Resend failed, falling back to Formspree:', e.message);
    }
  }
  await formspreeSend(Object.assign({}, fields, full.ai ? { ai_referral: full.ai } : {}, full.page ? { page_url: full.page } : {}), source);
  return { ok: true, via: 'formspree', confirmed: false };
}

module.exports = { deliverLead };
