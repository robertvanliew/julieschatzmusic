// Vercel Serverless Function behind /admin/.
//
// Julie signs in with one password. Saving commits to the GitHub repo, and
// Vercel redeploys the site about a minute later. There is no database: the
// repo is the storage, so every change is versioned and can be undone.
//
// Env vars required (Vercel dashboard -> Settings -> Environment Variables):
//   ADMIN_PASSWORD  - the password Julie types at /admin/ (SECRET, make it long)
//   GITHUB_TOKEN    - fine-grained token for this repo with
//                     "Contents: Read and write" (SECRET)
// Optional:
//   GITHUB_REPO     - "owner/name", defaults to robertvanliew/julieschatzmusic
//   GITHUB_BRANCH   - defaults to main
//   SESSION_SECRET  - signs the login cookie; derived from the two secrets if unset
//
// Client contract: POST /api/admin with JSON { action, ... }
//   login        { password }
//   logout       {}
//   load         {}                      -> { events, posts }
//   saveEvents   { events: [...] }
//   savePost     { post: {...}, previousSlug? }
//   deletePost   { slug }
//   uploadImage  { filename, data }      data = base64 of a JPG, PNG or WebP
//
// Every action except login requires the session cookie and the header
// X-Requested-With: jsm-admin (a simple cross-site request guard alongside
// SameSite=Strict).

const crypto = require('crypto');
const build = require('../lib/admin-build.js');

const REPO = process.env.GITHUB_REPO || 'robertvanliew/julieschatzmusic';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const COOKIE = 'jsm_admin';
const SESSION_DAYS = 14;
const EVENTS_PATH = 'data/events.json';
const POSTS_PATH = 'data/posts.json';
const UPLOAD_DIR = 'assets/blog/uploads';

// ───────────────────────── auth ─────────────────────────

function secret() {
  return process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update('jsm-admin|' + process.env.ADMIN_PASSWORD + '|' + process.env.GITHUB_TOKEN).digest('hex');
}
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('hex'); }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function makeSession() {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  return exp + '.' + sign(exp);
}
function validSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.indexOf(COOKIE + '=') === 0);
  if (!raw) return false;
  const [exp, mac] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (!safeEqual(mac, sign(exp))) return false;
  return Number(exp) > Date.now();
}
function cookieHeader(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ───────────────────────── GitHub ─────────────────────────

async function gh(path, opts) {
  const res = await fetch('https://api.github.com/repos/' + REPO + path, Object.assign({}, opts, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jsm-admin',
      'Content-Type': 'application/json',
    }, (opts && opts.headers) || {}),
  }));
  return res;
}
async function ghJson(path, opts) {
  const res = await gh(path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error('GitHub ' + res.status + ' on ' + path.split('?')[0] + ': ' + text.slice(0, 200));
    err.status = res.status;
    throw err;
  }
  return res.json();
}
// Returns file text, or null when the file does not exist.
async function readFile(path) {
  const res = await gh('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(BRANCH), { headers: { 'Accept': 'application/vnd.github.raw' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub ' + res.status + ' reading ' + path);
  return res.text();
}
async function readJson(path, fallback) {
  const text = await readFile(path);
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch (e) { throw new Error(path + ' in the repo is not valid JSON.'); }
}
// One atomic commit. `changes` maps path -> string content, { blobSha } for
// an already-uploaded binary, or null to delete the file.
async function commit(message, changes) {
  const ref = await ghJson('/git/ref/heads/' + BRANCH);
  const parent = ref.object.sha;
  const parentCommit = await ghJson('/git/commits/' + parent);
  const tree = Object.keys(changes).map(path => {
    const v = changes[path];
    if (v === null) return { path, mode: '100644', type: 'blob', sha: null };
    if (typeof v === 'object') return { path, mode: '100644', type: 'blob', sha: v.blobSha };
    return { path, mode: '100644', type: 'blob', content: v };
  });
  const newTree = await ghJson('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }) });
  const newCommit = await ghJson('/git/commits', { method: 'POST', body: JSON.stringify({ message: message + '\n\nSaved from /admin/.', tree: newTree.sha, parents: [parent] }) });
  await ghJson('/git/refs/heads/' + BRANCH, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return newCommit.sha;
}

// ───────────────────────── actions ─────────────────────────

function todayNY() {
  // YYYY-MM-DD in New York, so an event stays listed through its own day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function load() {
  const [events, posts] = await Promise.all([readJson(EVENTS_PATH, []), readJson(POSTS_PATH, [])]);
  return { events, posts, today: todayNY() };
}

async function saveEvents(body) {
  const events = build.validateEvents(body.events);
  const index = await readFile('index.html');
  if (index == null) throw new Error('index.html not found in the repo.');
  const changes = {};
  changes['index.html'] = build.applyEvents(index, events, todayNY());
  changes[EVENTS_PATH] = JSON.stringify(events, null, 2) + '\n';
  await commit('admin: update event dates (' + events.length + ' on file)', changes);
  return { events };
}

async function postFiles() {
  const [blog, sitemap, feed] = await Promise.all([readFile('blog.html'), readFile('sitemap.xml'), readFile('blog/feed.xml')]);
  if (blog == null || sitemap == null || feed == null) throw new Error('A blog file is missing from the repo.');
  return { 'blog.html': blog, 'sitemap.xml': sitemap, 'blog/feed.xml': feed };
}

async function savePost(body) {
  const post = build.validatePost(body.post || {});
  post.updated = todayNY();
  const posts = await readJson(POSTS_PATH, []);
  const previousSlug = build.slugify(body.previousSlug || '');
  const existing = posts.find(p => p.slug === post.slug);
  if (existing && previousSlug !== post.slug) throw new Error('Another post already uses that web address. Change the title or address.');

  const changes = {};
  let next = posts.filter(p => p.slug !== post.slug && p.slug !== previousSlug);
  next.push(post);
  // A renamed or unpublished post must not leave its old page behind.
  const before = posts.find(p => p.slug === (previousSlug || post.slug));
  if (before && before.status === 'published' && (before.slug !== post.slug || post.status !== 'published')) {
    changes['blog/' + before.slug + '/index.html'] = null;
  }
  Object.assign(changes, build.applyPosts(await postFiles(), next));
  changes[POSTS_PATH] = JSON.stringify(next, null, 2) + '\n';
  await commit('admin: ' + (post.status === 'published' ? 'publish' : 'save draft') + ' "' + post.title + '"', changes);
  return { posts: next, post };
}

async function deletePost(body) {
  const slug = build.slugify(body.slug || '');
  const posts = await readJson(POSTS_PATH, []);
  const target = posts.find(p => p.slug === slug);
  if (!target) throw new Error('That post no longer exists.');
  const next = posts.filter(p => p.slug !== slug);
  const changes = {};
  if (target.status === 'published') changes['blog/' + slug + '/index.html'] = null;
  Object.assign(changes, build.applyPosts(await postFiles(), next));
  changes[POSTS_PATH] = JSON.stringify(next, null, 2) + '\n';
  await commit('admin: delete "' + target.title + '"', changes);
  return { posts: next };
}

async function uploadImage(body) {
  const m = /\.(jpe?g|png|webp)$/i.exec(String(body.filename || ''));
  if (!m) throw new Error('Upload a JPG, PNG or WebP image.');
  const data = String(body.data || '');
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('The image did not upload correctly. Try again.');
  if (data.length > 5500000) throw new Error('That image is too large. Try a smaller one.');
  const base = build.slugify(String(body.filename).replace(/\.[^.]+$/, '')) || 'image';
  const name = todayNY() + '-' + base + '-' + crypto.randomBytes(3).toString('hex') + '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
  const path = UPLOAD_DIR + '/' + name;
  const blob = await ghJson('/git/blobs', { method: 'POST', body: JSON.stringify({ content: data, encoding: 'base64' }) });
  const changes = {}; changes[path] = { blobSha: blob.sha };
  await commit('admin: upload image ' + name, changes);
  return { url: '/' + path };
}

// ───────────────────────── handler ─────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  if (!process.env.ADMIN_PASSWORD || !process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'The admin is not set up yet. ADMIN_PASSWORD and GITHUB_TOKEN need to be added in Vercel.', setup: true });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Bad request.' });
  const action = String(body.action || '');

  if (action === 'login') {
    if (!safeEqual(crypto.createHash('sha256').update(String(body.password || '')).digest('hex'),
                   crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest('hex'))) {
      await wait(900); // slows password guessing
      return res.status(401).json({ error: 'That password is not right.' });
    }
    res.setHeader('Set-Cookie', cookieHeader(makeSession(), SESSION_DAYS * 86400));
    return res.status(200).json({ ok: true });
  }

  if (req.headers['x-requested-with'] !== 'jsm-admin' || !validSession(req)) {
    return res.status(401).json({ error: 'Please sign in again.', signedOut: true });
  }

  try {
    if (action === 'logout') {
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(200).json({ ok: true });
    }
    if (action === 'load') return res.status(200).json(await load());
    if (action === 'saveEvents') return res.status(200).json(await saveEvents(body));
    if (action === 'savePost') return res.status(200).json(await savePost(body));
    if (action === 'deletePost') return res.status(200).json(await deletePost(body));
    if (action === 'uploadImage') return res.status(200).json(await uploadImage(body));
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    // 409/422 from GitHub here usually means two saves landed at once.
    const conflict = e.status === 409 || e.status === 422;
    const upstream = /^GitHub \d/.test(e.message || '');
    if (upstream) console.error('[admin]', e.message);
    return res.status(conflict ? 409 : upstream ? 502 : 400).json({
      error: conflict ? 'Something else was saved at the same moment. Reload the page and try again.'
        : upstream ? 'The save did not go through. Please try again in a minute.'
        : e.message,
    });
  }
};
