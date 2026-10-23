// Exports Julie's repertoire (the REPERTOIRE list in repertoire.html) to
// assets/data/repertoire.json for the MCP server's recommend_songs tool.
// Re-run after editing the repertoire:  node scripts/build-repertoire-json.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const h = fs.readFileSync(path.join(ROOT, 'repertoire.html'), 'utf8');
const i = h.indexOf('const REPERTOIRE = [');
const j = h.indexOf('\n  ];', i);
if (i < 0 || j < 0) throw new Error('REPERTOIRE not found in repertoire.html');
const songs = [];
let style = '';
for (const line of h.slice(i, j).split('\n')) {
  const c = line.match(/^\s*\/\/\s*(.+?)\s*(\(\d+\))?\s*$/);
  if (c && !line.includes('{')) { style = c[1].replace(/\s+—\s+/g, ': ').replace(/ & /g, ' and '); continue; }
  const t = line.match(/title:\s*(['"])((?:\.|(?!\1).)*)\1/), a = line.match(/artist:\s*(['"])((?:\.|(?!\1).)*)\1/), s = line.match(/section:\s*'([^']*)'/);
  if (!t) continue;
  songs.push({ title: t[2].replace(/\'/g, "'"), artist: a ? a[2].replace(/\'/g, "'") : '', moment: s ? s[1] : '', style: style.toLowerCase() });
}
if (songs.length < 200) throw new Error('only ' + songs.length + ' songs parsed');
fs.writeFileSync(path.join(ROOT, 'assets/data/repertoire.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), count: songs.length, songs }) + '\n');
const by = {}; songs.forEach(s => { by[s.moment] = (by[s.moment] || 0) + 1; });
console.log(songs.length + ' songs ->', JSON.stringify(by));
console.log('styles:', [...new Set(songs.map(s => s.style))].join(' | '));
