// Collects every <select> option (value -> visible text) from the site's inquiry
// forms into lib/form-labels.json, so inquiry emails show "DJ + Live Violin"
// instead of "dj-dx-julie". Re-run after changing a form's options:
//   node scripts/build-form-labels.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const files = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT }).toString().trim().split('\n')
  .filter(f => !/^_temp|original|^admin\//.test(f));
const labels = {};
const decode = s => s.replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
for (const f of files) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const form of h.match(/<form[\s\S]*?<\/form>/g) || []) {
    for (const sel of form.match(/<select[\s\S]*?<\/select>/g) || []) {
      const name = (sel.match(/name="([^"]+)"/) || [])[1];
      if (!name) continue;
      for (const o of sel.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)) {
        const v = o[1], t = decode(o[2]);
        if (!v || !t) continue;
        labels[name] = labels[name] || {};
        if (!labels[name][v]) labels[name][v] = t;
      }
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'lib/form-labels.json'), JSON.stringify(labels, null, 2) + '\n');
console.log(Object.keys(labels).map(k => k + ' (' + Object.keys(labels[k]).length + ')').join(', '));
