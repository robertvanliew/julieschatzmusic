#!/usr/bin/env node
// Submit changed pages to IndexNow by hand.
//
//   node scripts/indexnow.js                  pages changed since the last push (origin/main..HEAD)
//   node scripts/indexnow.js <git-range>      e.g. 67bc705..HEAD
//   node scripts/indexnow.js --all            every URL in sitemap.xml
//   node scripts/indexnow.js /weddings/ /blog/   explicit paths
//
// Run it after pushing, once the deploy is live, so the engines fetch the
// new version and not the old one.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { submit } = require('../lib/indexnow.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);

function sitemapUrls() {
  const s = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

// Map a changed file to its public URL via vercel.json rewrites (file -> pretty URL).
function fileToUrl(file) {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const hit = v.rewrites.find(r => r.destination.replace(/^\//, '') === file);
  if (hit) return hit.source;
  if (file === 'index.html') return '/';
  const m = /^blog\/([^/]+)\/index\.html$/.exec(file);
  if (m) return '/blog/' + m[1] + '/';
  return null;
}

let urls;
if (args.includes('--all')) {
  urls = sitemapUrls();
} else if (args.length && args[0][0] === '/') {
  urls = args;
} else {
  const range = args[0] || 'origin/main..HEAD';
  const files = execFileSync('git', ['diff', '--name-only', range], { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
  urls = files.map(fileToUrl).filter(Boolean);
  if (!urls.length) { console.log('No page changes in ' + range + '.'); process.exit(0); }
}

submit(urls).then(r => {
  console.log((r.ok ? 'IndexNow accepted ' : 'IndexNow FAILED (HTTP ' + r.status + ') for ') + r.count + ' URL' + (r.count === 1 ? '' : 's') + (r.error ? ': ' + r.error : ''));
  urls.slice(0, 40).forEach(u => console.log('  ' + u));
  if (urls.length > 40) console.log('  … and ' + (urls.length - 40) + ' more');
  process.exit(r.ok ? 0 : 1);
});
