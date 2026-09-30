// IndexNow: tells Bing, Yandex, Naver, Seznam and Yep (and, through Bing, the
// AI search products built on it) that a URL changed, so it is re-crawled in
// minutes instead of whenever the bot next comes by. Google does not use it.
//
// The key file is hosted at /<KEY>.txt (already live). One POST covers up to
// 10,000 URLs and any one endpoint shares the submission with the others.
//
// Used by api/admin.js after a save, and by scripts/indexnow.js by hand.

'use strict';

const HOST = 'julieschatzmusic.com';
const KEY = '77513d7667d0461784c963045faca796';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// Accepts paths ("/blog/") or full URLs; drops anything not on this host.
function normalize(urls) {
  const out = new Set();
  (urls || []).forEach(u => {
    let s = String(u || '').trim();
    if (!s) return;
    if (s[0] === '/') s = 'https://' + HOST + s;
    try {
      const p = new URL(s);
      if (p.hostname !== HOST) return;
      out.add('https://' + HOST + p.pathname);
    } catch (e) { /* skip */ }
  });
  return Array.from(out).slice(0, 10000);
}

// Resolves to { ok, status, count }. Never throws: a failed ping must not
// turn a successful save into an error.
async function submit(urls) {
  const urlList = normalize(urls);
  if (!urlList.length) return { ok: true, status: 0, count: 0 };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: 'https://' + HOST + '/' + KEY + '.txt', urlList }),
    });
    // 200 = ok, 202 = accepted (key will be verified later)
    return { ok: res.status === 200 || res.status === 202, status: res.status, count: urlList.length };
  } catch (e) {
    return { ok: false, status: 0, count: urlList.length, error: e.message };
  }
}

module.exports = { submit, normalize, HOST, KEY };
