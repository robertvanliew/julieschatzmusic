// Fails if lib/pricing.js (used by the MCP server) disagrees with the quote
// tool on the pricing page. Run after any price change:
//   node scripts/check-pricing.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const lib = require('../lib/pricing.js');
const h = fs.readFileSync(path.join(__dirname, '..', 'pricing.html'), 'utf8');
const grab = (name, open, close) => {
  const i = h.search(new RegExp('(var |, )' + name + ' = '));
  if (i < 0) throw new Error('pricing.html: var ' + name + ' not found');
  let depth = 0, j = h.indexOf(open, i);
  for (let k = j; k < h.length; k++) { if (h[k] === open) depth++; else if (h[k] === close && --depth === 0) return vm.runInNewContext('(' + h.slice(j, k + 1) + ')'); }
};
const page = { RATES: grab('RATES', '{', '}'), DJ_ADD: grab('DJ_ADD', '[', ']'), DJ_ALONE: grab('DJ_ALONE', '[', ']') };
const problems = [];
for (const k of ['RATES', 'DJ_ADD', 'DJ_ALONE']) if (JSON.stringify(page[k]) !== JSON.stringify(lib[k])) problems.push(k);
if (!/total \+= 300 \* xh/.test(h)) problems.push('EXTRA_HOUR (pricing.html no longer adds 300 per extra hour)');
if (!h.includes('begin at $3,000')) problems.push('CORPORATE_FROM (pricing.html no longer says from $3,000)');
if (problems.length) { console.error('Pricing mismatch between pricing.html and lib/pricing.js: ' + problems.join(', ')); process.exit(1); }
console.log('lib/pricing.js matches the pricing page quote tool.');
