// Julie's published rate sheet, for the MCP server (api/mcp.js).
// Mirrors the quote tool on /wedding-violinist-pricing/ (pricing.html).
// If you change prices there, change them here too; `node scripts/check-pricing.js`
// fails when the two disagree.

'use strict';

const RATES = {
  wedding: {
    violin: { one: [725, 825, 925],  both: [1250, 1350, 1450] },
    piano:  { one: [875, 975, 1075], both: [1450, 1550, 1650] },
    both:   { both: [1550, 1650, 1750] },
    duo:    { one: [2875, 2975, null], both: [3825, 3925, null] }
  },
  private: {
    violin: { one: [725, 825, 925],  two: [1025, 1125, 1225] },
    piano:  { one: [875, 975, 1075], two: [1175, 1275, 1375] }
  }
};
const DJ_ADD = [3800, 4000, 4200], DJ_ALONE = [4500, 4700, 4900];
const EXTRA_HOUR = 300;
const CORPORATE_FROM = 3000;

const ZONES = {
  1: 'Zone 1: NYC, Hoboken, Jersey City (under 20 miles from Brooklyn)',
  2: 'Zone 2: most of Long Island, Westchester, Northern NJ, Greenwich (20 to 40 miles)',
  3: 'Zone 3: Fairfield County CT, Central NJ, deeper Suffolk (40 to 60 miles)',
  4: 'Zone 4: Hamptons, deep Hudson Valley, inland CT (60+ miles), quoted individually',
};
const MUSIC = { violin: 'Solo violin', piano: 'Solo piano', both: 'Violin and piano (Julie on both)', duo: 'Soul Shades duo (two musicians)' };
const COVERAGE = {
  one: 'Ceremony or cocktail hour (up to 1 hour)', both: 'Ceremony and cocktail hour', two: '2 hours',
};
const money = n => '$' + n.toLocaleString('en-US');

// { event: wedding|private|corporate, music, coverage: one|both|two, zone: 1-4, extra_hours, dj }
// -> { price, lines: [[label, amount]], quoted, note }
function estimate(o) {
  const lines = [];
  const zone = String(o.zone || 1);
  const music = o.music || 'violin';
  if (o.event === 'corporate') {
    return { price: 'from ' + money(CORPORATE_FROM), quoted: true, lines: [['Corporate engagements begin at ' + money(CORPORATE_FROM) + ' and are quoted individually by format, hours, guest count and production', '']] };
  }
  const z = { 1: 0, 2: 1, 3: 2 }[zone];
  let total = 0, quoted = false;
  if (zone === '4') { quoted = true; lines.push(['Zone 4 is quoted individually and may include overnight', 'quoted']); }
  const table = (RATES[o.event] || {})[music];
  const cov = o.coverage || (o.event === 'private' ? 'one' : (music === 'both' ? 'both' : 'one'));
  if (!table || !table[cov]) {
    quoted = true;
    lines.push([(MUSIC[music] || music) + (COVERAGE[cov] ? ', ' + COVERAGE[cov].toLowerCase() : '') + ' for this event type', 'quoted']);
  } else if (zone !== '4') {
    const base = table[cov][z];
    if (base == null) { quoted = true; lines.push([MUSIC[music] + ', ' + COVERAGE[cov].toLowerCase() + ' in Zone ' + zone, 'quoted']); }
    else { total += base; lines.push([MUSIC[music] + ': ' + COVERAGE[cov].toLowerCase(), money(base)]); }
  }
  const xh = Math.max(0, Math.min(6, parseInt(o.extra_hours, 10) || 0));
  if (xh) {
    if (music === 'duo') { quoted = true; lines.push([xh + ' extra hour' + (xh > 1 ? 's' : '') + ' (duo)', 'quoted']); }
    else { total += EXTRA_HOUR * xh; lines.push([xh + ' extra hour' + (xh > 1 ? 's' : '') + ' at ' + money(EXTRA_HOUR), money(EXTRA_HOUR * xh)]); }
  }
  if (o.dj) {
    if (zone === '4') lines.push(['DJ and live violin, 4 hours', 'quoted']);
    else { const add = total > 0 ? DJ_ADD[z] : DJ_ALONE[z]; total += add; lines.push(['DJ and live violin, 4 hours' + (total - add > 0 ? ' (added to booking)' : ' (standalone)'), money(add)]); }
  }
  return { price: total > 0 ? money(total) + (quoted ? '+' : '') : 'Quoted individually', lines, quoted };
}

module.exports = { RATES, DJ_ADD, DJ_ALONE, EXTRA_HOUR, CORPORATE_FROM, ZONES, MUSIC, COVERAGE, estimate, money };
