// The "your song picks" email. Table layout and inline styles so it renders
// the same in Gmail, Apple Mail and Outlook. Dark header with the ivory logo,
// a white card for the picks, one clear next step, and a plain footer.
//
// buildPicksEmail({ label, name, date, picks, shareUrl }) -> { subject, html, text }

'use strict';

const SITE = 'https://julieschatzmusic.com';
const LOGO = SITE + '/assets/email/logo-ivory.png';
const VIOLET = '#7B2CBF';
const GOLD = '#d4b872';
const INK = '#1a1428';
const MUTED = '#6f6a7a';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function prettyDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd || '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function button(href, label, primary) {
  const bg = primary ? VIOLET : '#ffffff';
  const color = primary ? '#ffffff' : VIOLET;
  const border = primary ? VIOLET : '#cfc6de';
  return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-table;margin:0 8px 8px 0;"><tr><td style="border-radius:6px;background:' + bg + ';border:1px solid ' + border + ';">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:13px 22px;font-family:' + SANS + ';font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + color + ';text-decoration:none;">' + esc(label) + '</a></td></tr></table>';
}

function buildPicksEmail(d) {
  const hasMoments = d.picks.some(p => p.moment);
  const isCeremony = /Picker/.test(d.label);
  const rows = d.picks.map((p, i) =>
    '<tr>' +
      '<td valign="top" style="padding:12px 14px 12px 0;width:36px;font-family:' + SERIF + ';font-size:22px;font-style:italic;color:' + GOLD + ';border-bottom:1px solid #eee8f3;">' + (i + 1) + '</td>' +
      '<td valign="top" style="padding:12px 0;border-bottom:1px solid #eee8f3;">' +
        (p.moment ? '<div style="font-family:' + SANS + ';font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + MUTED + ';padding-bottom:3px;">' + esc(p.moment) + '</div>' : '') +
        '<div style="font-family:' + SERIF + ';font-size:19px;color:' + INK + ';">' + esc(p.title) + '</div>' +
        (p.artist ? '<div style="font-family:' + SANS + ';font-size:14px;color:' + MUTED + ';padding-top:2px;">' + esc(p.artist) + '</div>' : '') +
      '</td>' +
    '</tr>').join('');

  const intro = isCeremony
    ? 'Here is the ceremony music you put together. Every one of these is in my live repertoire.'
    : 'Here are the three picks you saved from the ' + esc(d.label) + '. Any of them can be played live on violin or piano.';

  const dateBlock = d.date
    ? '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + GOLD + ';">Your date</p>' +
      '<p style="margin:0 0 10px;font-family:' + SERIF + ';font-size:20px;color:' + INK + ';">' + esc(prettyDate(d.date)) + '</p>' +
      '<p style="margin:0 0 18px;font-family:' + SERIF + ';font-size:16px;line-height:1.6;color:#3d3750;">I will check it against my calendar and reply within 24 hours with availability and a quote.</p>'
    : '<p style="margin:0 0 18px;font-family:' + SERIF + ';font-size:16px;line-height:1.6;color:#3d3750;">Have a date in mind? Send it over and I will check my calendar and reply within 24 hours.</p>';

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Your song picks</title></head>' +
  '<body style="margin:0;padding:0;background:#f3eff8;">' +
  '<div style="display:none;max-height:0;overflow:hidden;color:#f3eff8;">' + esc(d.picks.map(p => p.title).join(', ')) + '</div>' +
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3eff8;"><tr><td align="center" style="padding:28px 12px;">' +
  '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">' +

    // header
    '<tr><td align="center" style="background:#0F0A1A;border-radius:10px 10px 0 0;padding:30px 24px 24px;">' +
      '<img src="' + LOGO + '" width="150" alt="Julie Schatz Music" style="display:block;width:150px;height:auto;margin:0 auto 12px;border:0;">' +
      '<div style="font-family:' + SANS + ';font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' + GOLD + ';">Your song picks</div>' +
    '</td></tr>' +

    // body
    '<tr><td style="background:#ffffff;padding:34px 36px 8px;">' +
      '<p style="margin:0 0 14px;font-family:' + SERIF + ';font-size:26px;line-height:1.25;color:' + INK + ';">Hi' + (d.name ? ' ' + esc(d.name.split(' ')[0]) : '') + ',</p>' +
      '<p style="margin:0 0 22px;font-family:' + SERIF + ';font-size:17px;line-height:1.6;color:#3d3750;">' + intro + '</p>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #eee8f3;">' + rows + '</table>' +
      (d.shareUrl ? '<p style="margin:16px 0 0;font-family:' + SANS + ';font-size:13px;"><a href="' + esc(d.shareUrl) + '" style="color:' + VIOLET + ';">Open your picks again</a></p>' : '') +
    '</td></tr>' +

    // next step
    '<tr><td style="background:#ffffff;padding:22px 36px 34px;">' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:#faf7fd;border-left:3px solid ' + VIOLET + ';padding:20px 22px;">' +
        dateBlock +
        button(SITE + '/#inquire', d.date ? 'Send event details' : 'Check my date', true) +
        button(SITE + '/wedding-violinist-pricing/', 'See pricing', false) +
      '</td></tr></table>' +
      '<p style="margin:26px 0 0;font-family:' + SERIF + ';font-size:17px;line-height:1.6;color:' + INK + ';">Julie</p>' +
      '<p style="margin:2px 0 0;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + MUTED + ';">Violin, piano and vocals for weddings and events<br>New York City, Long Island, Westchester, New Jersey and Connecticut</p>' +
    '</td></tr>' +

    // footer
    '<tr><td align="center" style="background:#0F0A1A;border-radius:0 0 10px 10px;padding:22px 24px;">' +
      '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:13px;color:#F4EFE6;"><a href="' + SITE + '/" style="color:#F4EFE6;text-decoration:none;">julieschatzmusic.com</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="tel:+16313659554" style="color:#F4EFE6;text-decoration:none;">631-365-9554</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="mailto:bookings@julieschatzmusic.com" style="color:#F4EFE6;text-decoration:none;">bookings@julieschatzmusic.com</a></p>' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:11px;line-height:1.6;color:#8d86a0;">You asked for this email on julieschatzmusic.com. It is a one-time message, not a mailing list.</p>' +
    '</td></tr>' +

  '</table></td></tr></table></body></html>';

  const text = 'Hi' + (d.name ? ' ' + d.name.split(' ')[0] : '') + ',\n\n' +
    (isCeremony ? 'Here is the ceremony music you put together:' : 'Here are the picks you saved from the ' + d.label + ':') + '\n\n' +
    d.picks.map((p, i) => (p.moment ? p.moment + ': ' : (i + 1) + '. ') + p.title + (p.artist ? ' · ' + p.artist : '')).join('\n') +
    (d.shareUrl ? '\n\nOpen your picks again: ' + d.shareUrl : '') +
    (d.date ? '\n\nYour date: ' + prettyDate(d.date) + '. I will check it against my calendar and reply within 24 hours.' : '\n\nHave a date in mind? Reply with it and I will check my calendar.') +
    '\n\nCheck my date: ' + SITE + '/#inquire\nPricing: ' + SITE + '/wedding-violinist-pricing/' +
    '\n\nJulie Schatz\nViolin, piano and vocals for weddings and events\njulieschatzmusic.com · 631-365-9554 · bookings@julieschatzmusic.com';

  return { subject: (isCeremony ? 'Your ceremony music' : 'Your song picks') + ' from Julie Schatz Music', html, text };
}

module.exports = { buildPicksEmail, prettyDate };
