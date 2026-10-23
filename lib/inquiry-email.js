// Inquiry emails, in the same look as the song-picks email (lib/picks-email.js):
// table layout and inline styles so they render the same in Gmail, Apple Mail
// and Outlook.
//
//   buildLeadEmail(lead)         -> { subject, html, text }   the email Julie gets
//   buildConfirmationEmail(lead) -> { subject, html, text }   the "got it" email the lead gets
//
// `lead` comes from api/inquiry.js: { fields, source, sourceLabel, page, ai, dateStatus }.

'use strict';

const LABELS = require('./form-labels.json');

const SITE = 'https://julieschatzmusic.com';
const LOGO = SITE + '/assets/email/logo-ivory.png';
const VIOLET = '#7B2CBF';
const GOLD = '#d4b872';
const INK = '#1a1428';
const MUTED = '#6f6a7a';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = 'Arial, Helvetica, sans-serif';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Where each form lives, in plain words.
const SOURCES = {
  'dropdown-inquiry': 'Homepage inquiry form',
  'date-check-home': 'Homepage "Is my date open?" box',
  'pricing-quote-tool': 'Pricing page quote tool',
  'repertoire-builder': 'Ceremony song picker',
  'bookings-page': 'Bookings page',
  'solo-bookings': 'Solo bookings page',
  'duo-bookings': 'Soul Shades duo bookings page',
  'venues-page': 'Venues page',
  'nj-landing-page': 'New Jersey wedding page',
  'first-dance-song-finder': 'First Dance Song Finder',
  'corporate-events-full-form': 'Corporate events inquiry form',
  'corporate-15min-call-request': 'Corporate 15-minute call request',
  'corporate-fastlane': 'Corporate events (NYC) quick form',
  'ai-agent': 'AI assistant (Julie\'s MCP server)',
};
function sourceLabel(src) {
  if (SOURCES[src]) return SOURCES[src];
  const m = /^(.+)-picks$/.exec(src || '');
  if (m) return (SOURCES[m[1]] || m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) + ' (emailed picks)';
  return src ? src.replace(/-/g, ' ') : 'Website form';
}

// Display order. Anything not listed (and not internal) is shown at the end.
const ORDER = [
  ['name', 'Name'], ['company', 'Company'], ['role', 'Role'], ['email', 'Email'], ['phone', 'Phone'], ['contact', 'Contact'],
  ['event_type', 'Event'], ['service', 'Service'], ['event_date', 'Date'], ['event_times', 'Time'], ['event_hours', 'Hours'],
  ['venue', 'Venue'], ['venue_state', 'Area'], ['guest_count', 'Guests'], ['budget', 'Budget'], ['estimate', 'Quote tool estimate'],
  ['av_provided', 'AV provided'], ['invoicing', 'Invoicing'],
  ['time_option_1', 'Call time 1'], ['time_option_2', 'Call time 2'], ['time_option_3', 'Call time 3'], ['viewer_timezone', 'Their time zone'],
  ['referral', 'Heard about Julie'], ['message', 'Message'], ['context', 'About the call'],
  ['quiz_picks', 'Song finder picks'], ['picks', 'Song picks'], ['ceremony_selections', 'Ceremony picks'], ['share_url', 'Picks link'],
];
const HIDDEN = new Set(['_gotcha', '_subject', '_loaded_at', 'form_source', 'has_ceremony_picks', 'consent', 'date_check',
  '_landing_url', 'page_url', 'ai_referral', 'ai_landing', 'landing_page', 'first_referrer', 'source_detail']);

function label(field, value) {
  const map = LABELS[field];
  return map && map[value] ? map[value] : value;
}

function prettyDate(ymd, short) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd || '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-US', short
    ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function prettyDateTime(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  if (!m) return v;
  let h = +m[2]; const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return prettyDate(m[1], true) + ', ' + h + ':' + m[3] + ' ' + ap;
}

// 15109782851 / 510-978-2851 -> (510) 978-2851; anything else unchanged.
function prettyPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return n.length === 10 ? '(' + n.slice(0, 3) + ') ' + n.slice(3, 6) + '-' + n.slice(6) : String(p || '');
}

function firstName(f) { return String(f.name || '').trim().split(/\s+/)[0] || ''; }
function emailOf(f) {
  const e = f.email || (/@/.test(f.contact || '') ? f.contact : '');
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()) ? String(e).trim() : '';
}
function phoneOf(f) {
  const p = f.phone || (!/@/.test(f.contact || '') ? f.contact : '');
  return String(p || '').replace(/\D/g, '').length >= 10 ? String(p).trim() : '';
}
function eventLabel(f) {
  if (f.event_type) return label('event_type', f.event_type);
  if (f.service) return label('service', f.service);
  // Quote tool: "Wedding · Solo violin · Ceremony and cocktail hour · Zone 2 · starting $1,350"
  if (f.estimate) return String(f.estimate).split(' · ').slice(0, 2).join(' · ');
  return '';
}

function rowsFor(lead) {
  const f = lead.fields;
  const rows = [];
  const seen = new Set();
  const push = (key, name, value) => { if (value != null && String(value).trim() !== '') rows.push({ key, name, value: String(value) }); seen.add(key); };
  for (const [key, name] of ORDER) {
    let v = f[key];
    if (key === 'event_date' && v) v = prettyDate(v) + (lead.dateStatus === 'booked' ? '  (already on your calendar as booked)' : lead.dateStatus === 'open' ? '  (open on your calendar)' : '');
    else if (/^time_option_/.test(key) && v) v = prettyDateTime(v);
    else if ((key === 'phone' || (key === 'contact' && !/@/.test(v || ''))) && v) v = prettyPhone(v);
    else if (v) v = label(key, v);
    push(key, name, v);
  }
  for (const key of Object.keys(f)) {
    if (seen.has(key) || HIDDEN.has(key)) continue;
    push(key, key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), f[key]);
  }
  return rows;
}

function cellValue(r) {
  const v = esc(r.value).replace(/\n/g, '<br>');
  if (r.key === 'email' || (r.key === 'contact' && /@/.test(r.value))) return '<a href="mailto:' + esc(r.value) + '" style="color:' + VIOLET + ';text-decoration:none;">' + v + '</a>';
  if (r.key === 'phone' || r.key === 'contact') return '<a href="tel:' + esc(r.value.replace(/[^\d+]/g, '')) + '" style="color:' + VIOLET + ';text-decoration:none;">' + v + '</a>';
  if (r.key === 'share_url') return '<a href="' + esc(r.value) + '" style="color:' + VIOLET + ';">Open their picks</a>';
  return v;
}

function button(href, text, primary) {
  const bg = primary ? VIOLET : '#ffffff', color = primary ? '#ffffff' : VIOLET, border = primary ? VIOLET : '#cfc6de';
  return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-table;margin:0 8px 8px 0;"><tr><td style="border-radius:6px;background:' + bg + ';border:1px solid ' + border + ';">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:13px 22px;font-family:' + SANS + ';font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + color + ';text-decoration:none;">' + esc(text) + '</a></td></tr></table>';
}

function shell(preheader, headerKicker, body, footer) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + esc(headerKicker) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f3eff8;">' +
    '<div style="display:none;max-height:0;overflow:hidden;color:#f3eff8;">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3eff8;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">' +
      '<tr><td align="center" style="background:#0F0A1A;border-radius:10px 10px 0 0;padding:30px 24px 24px;">' +
        '<img src="' + LOGO + '" width="150" alt="Julie Schatz Music" style="display:block;width:150px;height:auto;margin:0 auto 12px;border:0;">' +
        '<div style="font-family:' + SANS + ';font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' + GOLD + ';">' + esc(headerKicker) + '</div>' +
      '</td></tr>' +
      body +
      '<tr><td align="center" style="background:#0F0A1A;border-radius:0 0 10px 10px;padding:22px 24px;">' + footer + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

// ─── The email Julie gets ───────────────────────────────────────────────
function buildLeadEmail(lead) {
  const f = lead.fields;
  const name = String(f.name || '').trim() || 'Someone';
  const first = firstName(f) || 'them';
  const email = emailOf(f), phone = phoneOf(f);
  const ev = eventLabel(f) || (/-picks$/.test(lead.source) ? lead.sourceLabel.replace(/ \(emailed picks\)$/, '') : '');
  const isCall = lead.source === 'corporate-15min-call-request';
  const isDateCheck = lead.source === 'date-check-home';
  const kind = isCall ? 'Call request' : isDateCheck ? 'Date check' : /-picks$/.test(lead.source) ? 'Song picks lead' : 'New inquiry';

  const subject = [
    (lead.ai ? '[AI: ' + lead.ai + '] ' : '') + kind,
    ev,
    f.event_date ? prettyDate(f.event_date, true) + (lead.dateStatus === 'booked' ? ' (booked)' : '') : '',
    name !== 'Someone' ? name : (email || phone),
  ].filter(Boolean).join(' · ');

  const summary = [ev, f.event_date ? prettyDate(f.event_date) : '', f.venue ? label('venue', f.venue) : ''].filter(Boolean).join('  ·  ');
  const rows = rowsFor(lead);
  const table = rows.map((r, i) =>
    '<tr>' +
      '<td valign="top" style="padding:11px 14px 11px 0;width:132px;font-family:' + SANS + ';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:' + MUTED + ';' + (i ? 'border-top:1px solid #eee8f3;' : '') + '">' + esc(r.name) + '</td>' +
      '<td valign="top" style="padding:11px 0;font-family:' + SANS + ';font-size:15px;line-height:1.55;color:' + INK + ';' + (r.key === 'name' ? 'font-weight:bold;' : '') + (i ? 'border-top:1px solid #eee8f3;' : '') + '">' + cellValue(r) + '</td>' +
    '</tr>').join('');

  const replySubject = 'Re: your ' + (ev ? ev.toLowerCase() + ' ' : '') + 'inquiry' + (f.event_date ? ' for ' + prettyDate(f.event_date, true) : '');
  const buttons =
    (email ? button('mailto:' + email + '?subject=' + encodeURIComponent(replySubject), 'Reply to ' + first, true) : '') +
    (phone ? button('tel:' + phone.replace(/[^\d+]/g, ''), 'Call ' + first, !email) : '') +
    (phone ? button('sms:' + phone.replace(/[^\d+]/g, ''), 'Text ' + first, false) : '');

  const pagePath = (lead.page || '').replace(/^https?:\/\/(www\.)?julieschatzmusic\.com/, '');
  const sourceLine = esc(lead.sourceLabel) + (pagePath && pagePath !== '/' ? ' · <a href="' + esc(lead.page) + '" style="color:' + VIOLET + ';">' + esc(pagePath) + '</a>' : '');
  const attribution = [
    lead.ai ? '<strong>Found you through ' + esc(lead.ai) + '</strong> (detected automatically)' : '',
    f.landing_page && f.landing_page !== lead.page ? 'First page they visited: ' + esc(f.landing_page) : '',
    f.first_referrer ? 'Came from: ' + esc(f.first_referrer) : '',
  ].filter(Boolean).join('<br>');

  const body =
    '<tr><td style="background:#ffffff;padding:30px 36px 6px;">' +
      '<p style="margin:0 0 4px;font-family:' + SERIF + ';font-size:26px;line-height:1.25;color:' + INK + ';">' + esc(name) + '</p>' +
      (summary ? '<p style="margin:0 0 18px;font-family:' + SERIF + ';font-size:17px;line-height:1.5;color:#3d3750;">' + esc(summary) + '</p>' : '<p style="margin:0 0 18px;"></p>') +
      (lead.dateStatus === 'booked' ? '<p style="margin:0 0 18px;padding:10px 14px;background:#fff4e5;border-left:3px solid #e0a040;font-family:' + SANS + ';font-size:14px;color:#5a4320;">This date is already marked booked on your calendar.</p>' : '') +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #eee8f3;border-bottom:1px solid #eee8f3;">' + table + '</table>' +
    '</td></tr>' +
    '<tr><td style="background:#ffffff;padding:22px 36px 30px;">' + buttons +
      '<p style="margin:14px 0 0;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + MUTED + ';">From: ' + sourceLine + '</p>' +
      (attribution ? '<p style="margin:6px 0 0;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + MUTED + ';">' + attribution + '</p>' : '') +
      (email ? '<p style="margin:6px 0 0;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + MUTED + ';">' + esc(first) + ' got an automatic confirmation that you will reply within 24 hours.</p>' : '') +
    '</td></tr>';

  const footer = '<p style="margin:0;font-family:' + SANS + ';font-size:12px;color:#8d86a0;">Sent by julieschatzmusic.com. Hit reply to answer ' + esc(first) + ' directly.</p>';

  const text = [kind + ' from ' + name, summary, '', ...rows.map(r => r.name + ': ' + r.value), '', 'From: ' + lead.sourceLabel + (lead.page ? ' (' + lead.page + ')' : ''),
    lead.ai ? 'Found you through ' + lead.ai + ' (detected automatically)' : ''].filter(s => s !== undefined).join('\n');

  return { subject, html: shell(summary || kind, kind, body, footer), text };
}

// ─── The confirmation the lead gets ─────────────────────────────────────
function buildConfirmationEmail(lead) {
  const f = lead.fields;
  const first = firstName(f);
  const ev = eventLabel(f);
  const when = f.event_date ? prettyDate(f.event_date) : '';
  let lines, kicker = 'Inquiry received';
  if (lead.source === 'corporate-15min-call-request') {
    kicker = 'Call request received';
    lines = ['Thank you for the times. I will confirm one of them by email within 24 hours.',
      'If none of them work after all, just reply to this email with a better window.'];
  } else if (lead.source === 'date-check-home') {
    kicker = 'Date check received';
    lines = ['Thank you for checking ' + (when || 'your date') + '. I will confirm it against my calendar and reply within 24 hours.',
      'If you send a few details about the event (venue, guest count, which parts of the day you want music for), I can include a quote in the same reply.'];
  } else {
    lines = ['Thank you for reaching out' + (when ? ' about ' + when : '') + '. I have your details and will reply within 24 hours with availability and a quote.',
      'If anything changes or you think of something to add, just reply to this email. It comes straight to me.'];
  }
  const recap = [
    ev ? ['Event', ev] : null,
    when ? ['Date', when] : null,
    f.venue ? ['Venue', label('venue', f.venue)] : null,
    f.estimate ? ['Your estimate', f.estimate] : null,
  ].filter(Boolean);

  const body =
    '<tr><td style="background:#ffffff;padding:34px 36px 8px;">' +
      '<p style="margin:0 0 14px;font-family:' + SERIF + ';font-size:26px;line-height:1.25;color:' + INK + ';">' + (first ? 'Hi ' + esc(first) + ',' : 'Hi,') + '</p>' +
      lines.map(l => '<p style="margin:0 0 16px;font-family:' + SERIF + ';font-size:17px;line-height:1.6;color:#3d3750;">' + esc(l) + '</p>').join('') +
      (recap.length ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 8px;background:#faf7fd;border-left:3px solid ' + VIOLET + ';"><tr><td style="padding:16px 20px;">' +
        recap.map(([k, v]) => '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:14px;line-height:1.5;color:' + INK + ';"><span style="color:' + MUTED + ';text-transform:uppercase;letter-spacing:1px;font-size:11px;">' + esc(k) + '</span>&nbsp;&nbsp;' + esc(v) + '</p>').join('') +
      '</td></tr></table>' : '') +
    '</td></tr>' +
    '<tr><td style="background:#ffffff;padding:18px 36px 32px;">' +
      '<p style="margin:0 0 14px;font-family:' + SANS + ';font-size:13px;letter-spacing:1px;text-transform:uppercase;color:' + MUTED + ';">While you wait</p>' +
      button(SITE + '/wedding-song-finder/', 'Find your songs', true) +
      button(SITE + '/wedding-violinist-pricing/', 'See pricing', false) +
      '<p style="margin:22px 0 0;font-family:' + SERIF + ';font-size:17px;line-height:1.6;color:' + INK + ';">Julie</p>' +
      '<p style="margin:2px 0 0;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + MUTED + ';">Violin, piano and vocals for weddings and events<br>New York City, Long Island, Westchester, New Jersey and Connecticut</p>' +
    '</td></tr>';

  const footer =
    '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:13px;color:#F4EFE6;"><a href="' + SITE + '/" style="color:#F4EFE6;text-decoration:none;">julieschatzmusic.com</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="tel:+16313659554" style="color:#F4EFE6;text-decoration:none;">631-365-9554</a></p>' +
    '<p style="margin:0;font-family:' + SANS + ';font-size:11px;line-height:1.6;color:#8d86a0;">You are getting this because you sent an inquiry on julieschatzmusic.com. It is a one-time confirmation, not a mailing list.</p>';

  const text = (first ? 'Hi ' + first + ',' : 'Hi,') + '\n\n' + lines.join('\n\n') +
    (recap.length ? '\n\n' + recap.map(([k, v]) => k + ': ' + v).join('\n') : '') +
    '\n\nFind your songs: ' + SITE + '/wedding-song-finder/\nPricing: ' + SITE + '/wedding-violinist-pricing/\n\nJulie\nViolin, piano and vocals for weddings and events\njulieschatzmusic.com · 631-365-9554';

  const subject = lead.source === 'corporate-15min-call-request' ? 'Got your call request' + (first ? ', ' + first : '') + ' · Julie Schatz Music'
    : 'Got your inquiry' + (first ? ', ' + first : '') + ' · Julie Schatz Music';
  return { subject, html: shell(lines[0], kicker, body, footer), text };
}

module.exports = { buildLeadEmail, buildConfirmationEmail, sourceLabel, prettyDate, emailOf, phoneOf, eventLabel };
