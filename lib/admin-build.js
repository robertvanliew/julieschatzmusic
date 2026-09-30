// Turns the admin's data (events + blog posts) into the static HTML the site serves.
//
// Pure functions: strings in, strings out. No file system and no network here,
// so the same code runs inside the /api/admin serverless function (which
// commits the results to the repo) and in local tests.
//
// The site has no build step. When Julie saves in /admin/, the function reads
// the affected files from the repo, regenerates the marked regions below, and
// commits the result. Vercel then redeploys. Everything ends up as real HTML,
// so search engines see events and posts without running JavaScript.
//
// Marked regions (everything between the markers is generated, do not hand-edit):
//   index.html      <!-- ADMIN:EVENTS:START --> ... <!-- ADMIN:EVENTS:END -->
//                   <!-- ADMIN:EVENTS-SCHEMA:START --> ... :END -->
//   blog.html       <!-- ADMIN:POSTS:START --> ... :END -->
//   sitemap.xml     <!-- ADMIN:POSTS:START --> ... :END -->
//   blog/feed.xml   <!-- ADMIN:POSTS:START --> ... :END -->

'use strict';

const BASE = 'https://julieschatzmusic.com';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const US_STATES = /^[A-Z]{2}$/;

// URLs that already exist as hand-built posts or routes; a new post may not reuse them.
const RESERVED_SLUGS = ['feed.xml', 'orchestral-house-music-spitfire', 'wedding-violinist-candlewood-inn-ct', 'spitfire-house-track', 'uploads'];

// ───────────────────────── helpers ─────────────────────────

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}
function longDate(ymd) { const d = parseDate(ymd); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
function dayName(ymd) { return DAYS[parseDate(ymd).getUTCDay()]; }
function rfc822(ymd) {
  const d = parseDate(ymd);
  return DAYS[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3) + ' ' + d.getUTCFullYear() + ' 12:00:00 -0500';
}
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function clean(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max); }

function replaceRegion(text, name, body, file) {
  const start = '<!-- ADMIN:' + name + ':START -->';
  const end = '<!-- ADMIN:' + name + ':END -->';
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error('Marker ADMIN:' + name + ' not found in ' + file);
  return text.slice(0, a + start.length) + '\n' + body + '\n' + text.slice(b);
}

// ───────────────────────── events ─────────────────────────

function validateEvents(input) {
  if (!Array.isArray(input)) throw new Error('Events must be a list.');
  if (input.length > 200) throw new Error('Too many events.');
  const out = input.map((e, i) => {
    const date = clean(e.date, 10);
    if (!parseDate(date)) throw new Error('Event ' + (i + 1) + ': pick a valid date.');
    const title = clean(e.title, 80);
    if (!title) throw new Error('Event ' + (i + 1) + ': add an event type, such as "Wedding Ceremony".');
    const city = clean(e.city, 80);
    if (!city) throw new Error('Event ' + (i + 1) + ': add a town, such as "Freehold, NJ".');
    return {
      id: clean(e.id, 40) || (date + '-' + slugify(title) + '-' + i),
      date, title, city,
      time: clean(e.time, 40),
      venue: clean(e.venue, 80),
      format: clean(e.format, 60),
    };
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function splitCity(city) {
  const parts = city.split(',').map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (parts.length >= 2 && US_STATES.test(last)) return { locality: parts.slice(0, -1).join(', '), region: last };
  return { locality: city, region: '' };
}

// `today` is a YYYY-MM-DD string. Past events are kept in the data file but not rendered.
function renderEventCards(events, today) {
  const upcoming = events.filter(e => e.date >= today);
  if (!upcoming.length) return '      <p class="events-empty">New dates are added here as they are confirmed. <a href="/#inquire">Ask about your date</a>.</p>';
  const SEP = ' <span class="event-meta-sep">·</span> ';
  return upcoming.map((e, i) => {
    const meta = [dayName(e.date), e.time, e.venue, e.city].filter(Boolean).map(esc).join(SEP);
    return '      <div class="event-card' + (i === 0 ? ' is-next' : '') + '">\n' +
      '        <div class="event-date">' + (i === 0 ? '<span class="event-next-tag">Next up</span>' : '') + longDate(e.date) + '</div>\n' +
      '        <div class="event-title">' + esc(e.title) + '</div>\n' +
      '        <div class="event-meta">' + meta + '</div>\n' +
      '      </div>';
  }).join('\n');
}

function renderEventSchema(events, today) {
  const upcoming = events.filter(e => e.date >= today);
  const list = upcoming.map(e => {
    const c = splitCity(e.city);
    const address = { '@type': 'PostalAddress', addressLocality: c.locality };
    if (c.region) address.addressRegion = c.region;
    address.addressCountry = 'US';
    const where = [e.venue, e.city.replace(/,\s*/g, ' ')].filter(Boolean).join(', ');
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.title + (e.format ? ' · ' + e.format : ''),
      startDate: e.date,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: e.venue || e.city, address },
      performer: { '@id': BASE + '/#julie' },
      organizer: { '@id': BASE + '/#business' },
      image: BASE + '/assets/photos/julie-schatz-blacksteinway-nyc.png',
      description: 'Julie Schatz performing ' + (e.format ? e.format.toLowerCase() + ' ' : '') + 'at a ' + e.title.toLowerCase() + ' at ' + where + '.',
      offers: { '@type': 'Offer', url: BASE + '/#inquire', availability: 'https://schema.org/SoldOut', price: '0', priceCurrency: 'USD', validFrom: e.date.slice(0, 4) + '-01-01' },
      isAccessibleForFree: false,
    };
  });
  // "<" is written as < so text typed in the admin can never close the script tag.
  return '<script type="application/ld+json">\n' + JSON.stringify(list, null, 2).replace(/</g, '\\u003c') + '\n</script>';
}

function applyEvents(indexHtml, events, today) {
  let h = replaceRegion(indexHtml, 'EVENTS', renderEventCards(events, today), 'index.html');
  h = replaceRegion(h, 'EVENTS-SCHEMA', renderEventSchema(events, today), 'index.html');
  return h;
}

// ───────────────────────── blog posts ─────────────────────────

function validatePost(p) {
  const title = clean(p.title, 120);
  if (!title) throw new Error('Add a title.');
  const slug = slugify(p.slug || title);
  if (!slug) throw new Error('The web address for this post is empty.');
  if (RESERVED_SLUGS.includes(slug)) throw new Error('That web address is already used by an existing post. Change the title or address.');
  const date = clean(p.date, 10);
  if (!parseDate(date)) throw new Error('Pick a valid date.');
  const status = p.status === 'published' ? 'published' : 'draft';
  const excerpt = clean(p.excerpt, 300);
  const body = String(p.body == null ? '' : p.body).replace(/\r\n/g, '\n').slice(0, 60000).trim();
  if (status === 'published') {
    if (!excerpt) throw new Error('Add a short summary before publishing. It is what shows in Google and on the blog page.');
    if (body.length < 50) throw new Error('The post is too short to publish.');
  }
  const cover = clean(p.cover, 300);
  if (cover && !/^\/assets\/[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp)$/i.test(cover)) throw new Error('The cover image must be one uploaded through this admin.');
  const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map(t => clean(t, 40)).filter(Boolean).slice(0, 8);
  return { slug, title, date, status, excerpt, body, cover, coverAlt: clean(p.coverAlt, 160), category: clean(p.category, 50) || 'Notes', tags };
}

// Inline formatting on already-escaped text.
function inline(text) {
  let t = esc(text);
  t = t.replace(/!\[([^\]]*)\]\((\/assets\/[A-Za-z0-9/_.-]+)\)/g, (m, alt, src) => '<img src="' + src + '" alt="' + alt + '" loading="lazy" decoding="async">');
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)"<>]+)\)/g, (m, label, href) => {
    const external = /^https?:\/\//.test(href) && href.indexOf(BASE) !== 0;
    return '<a href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return t;
}

// A small, safe Markdown subset. All HTML in the source is escaped.
//   ## Heading, ### Subheading, blank line = new paragraph, - list, 1. list,
//   > quote, **bold**, *italic*, [text](link), ![description](image)
function renderMarkdown(md) {
  const blocks = String(md || '').split(/\n{2,}/).map(b => b.replace(/^\n+|\n+$/g, '')).filter(Boolean);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (/^###\s+/.test(b) && lines.length === 1) return '<h3>' + inline(b.replace(/^###\s+/, '')) + '</h3>';
    if (/^##\s+/.test(b) && lines.length === 1) return '<h2>' + inline(b.replace(/^##\s+/, '')) + '</h2>';
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) return '<ul>\n' + lines.map(l => '  <li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('\n') + '\n</ul>';
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return '<ol>\n' + lines.map(l => '  <li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('\n') + '\n</ol>';
    if (lines.every(l => /^>\s?/.test(l))) return '<blockquote><p>' + lines.map(l => inline(l.replace(/^>\s?/, ''))).join('<br>') + '</p></blockquote>';
    if (lines.length === 1 && /^!\[[^\]]*\]\(\/assets\/[A-Za-z0-9/_.-]+\)$/.test(b)) return '<figure>' + inline(b) + '</figure>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('\n');
}

function postUrl(p) { return BASE + '/blog/' + p.slug + '/'; }

function renderPostPage(p) {
  const url = postUrl(p);
  const image = BASE + (p.cover || '/assets/photos/julie-schatz-blacksteinway-nyc.png');
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.excerpt, datePublished: p.date, dateModified: p.updated || p.date,
      image, url, mainEntityOfPage: url,
      author: { '@type': 'Person', '@id': BASE + '/#julie', name: 'Julie Schatz' },
      publisher: { '@id': BASE + '/#business' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE + '/blog/' },
      { '@type': 'ListItem', position: 3, name: p.title, item: url } ] },
  ].map(o => '<script type="application/ld+json">\n' + JSON.stringify(o, null, 2).replace(/</g, '\\u003c') + '\n</script>').join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-JWQF347KQ6"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-JWQF347KQ6');</script>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)} | Julie Schatz</title>
<meta name="description" content="${esc(p.excerpt)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.excerpt)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:site_name" content="Julie Schatz Music">
<meta property="article:published_time" content="${p.date}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Julie Schatz · Blog" href="/blog/feed.xml">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="apple-touch-icon" href="/assets/julie-schatz-logo.png">

${ld}

<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

<style>
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#0F0A1A; --violet:#7B2CBF; --violet-2:#a855f7; --gold:#d4b872; --ivory:#F4EFE6; --ivory-dim:rgba(244,239,230,0.85); --ivory-soft:rgba(244,239,230,0.6); --ivory-faint:rgba(244,239,230,0.4); --hairline:rgba(244,239,230,0.14); }
html, body { width:100%; min-height:100vh; background:var(--bg); font-family:'Cormorant Garamond',serif; color:var(--ivory); overflow-x:hidden; }
nav.site-nav { position:absolute; top:0; left:0; right:0; z-index:100; display:flex; align-items:center; justify-content:flex-end; padding:32px 48px; }
.nav-logo { position:absolute; left:48px; top:50%; transform:translateY(-50%); }
.nav-logo img { height:110px; width:auto; filter:brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0,0,0,0.35)); }
.nav-links { display:flex; gap:36px; list-style:none; position:absolute; left:50%; transform:translateX(-50%); }
.nav-links a { font-family:'Cormorant Garamond',serif; font-size:13px; letter-spacing:0.35em; text-transform:uppercase; color:rgba(255,255,255,0.95); text-decoration:none; }
.nav-links a:hover { color:#fff; text-shadow:0 0 12px rgba(255,255,255,0.5); }
@media (max-width:900px) { nav.site-nav { position:relative; padding:14px 16px; justify-content:center; } .nav-logo { display:none; } .nav-links { position:relative; left:auto; transform:none; gap:6px 14px; flex-wrap:wrap; justify-content:center; } .nav-links a { font-size:11px; letter-spacing:0.16em; padding:10px 0; } }
main { max-width:760px; margin:0 auto; padding:200px 40px 100px; }
@media (max-width:768px) { main { padding:70px 20px 60px; } }
.post-kicker { display:block; font-family:'Inter',sans-serif; font-size:12px; font-weight:600; letter-spacing:0.28em; text-transform:uppercase; color:var(--gold); margin-bottom:18px; }
.post-kicker a { color:inherit; text-decoration:none; }
h1 { font-family:'Playfair Display',serif; font-style:italic; font-weight:400; font-size:clamp(32px,4.6vw,54px); line-height:1.08; letter-spacing:-0.015em; color:#fff; margin-bottom:20px; text-wrap:balance; }
.post-lede { font-weight:300; font-size:clamp(19px,1.8vw,23px); line-height:1.55; color:var(--ivory-dim); margin-bottom:34px; }
.post-cover { margin:0 0 40px; border-radius:6px; overflow:hidden; }
.post-cover img, .post-body img { width:100%; height:auto; display:block; border-radius:6px; }
.post-body h2 { font-family:'Playfair Display',serif; font-style:italic; font-weight:400; font-size:clamp(24px,2.8vw,32px); line-height:1.2; color:#fff; margin:44px 0 14px; }
.post-body h3 { font-family:'Playfair Display',serif; font-style:italic; font-weight:400; font-size:clamp(20px,2.2vw,25px); color:#fff; margin:32px 0 10px; }
.post-body p, .post-body li { font-size:clamp(18px,1.6vw,21px); line-height:1.7; color:var(--ivory-dim); }
.post-body p { margin-bottom:18px; }
.post-body ul, .post-body ol { margin:0 0 20px 1.3em; }
.post-body li { margin-bottom:6px; }
.post-body strong { color:#fff; font-weight:500; }
.post-body a { color:#fff; text-decoration:underline; text-decoration-color:rgba(212,184,114,0.55); text-underline-offset:3px; }
.post-body a:hover { text-decoration-color:var(--gold); }
.post-body blockquote { margin:26px 0; padding:4px 0 4px 22px; border-left:3px solid rgba(168,85,247,0.6); font-style:italic; }
.post-body figure { margin:30px 0; }
.post-tags { display:flex; flex-wrap:wrap; gap:8px; margin:36px 0 0; }
.post-tags span { padding:7px 14px; border:1px solid var(--hairline); border-radius:999px; font-family:'Inter',sans-serif; font-size:12px; color:var(--ivory-soft); }
.cta-block { padding:36px 30px; background:linear-gradient(160deg,rgba(168,85,247,0.09) 0%,rgba(15,10,26,0.6) 100%); border:1px solid rgba(168,85,247,0.28); border-left:3px solid rgba(168,85,247,0.7); border-radius:6px; text-align:center; margin:56px 0 0; }
.cta-block h2 { font-family:'Playfair Display',serif; font-style:italic; font-weight:400; font-size:clamp(22px,2.8vw,30px); color:#fff; margin-bottom:10px; }
.cta-block p { font-size:17px; color:var(--ivory-dim); margin:0 auto 20px; max-width:50ch; }
.cta-primary { display:inline-block; padding:15px 28px; background:linear-gradient(90deg,var(--violet),var(--violet-2)); color:var(--ivory); text-decoration:none; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; border-radius:6px; }
.site-footer { border-top:1px solid var(--hairline); margin-top:60px; padding:40px 20px 20px; text-align:center; font-family:'Inter',sans-serif; font-size:13px; line-height:2; color:var(--ivory-faint); }
.site-footer a { color:var(--ivory-soft); text-decoration:none; }
.site-footer a:hover { color:var(--gold); }
</style>
</head>
<body>

<nav class="site-nav">
  <a href="/" class="nav-logo" aria-label="Julie Schatz home"><img src="/assets/julie-schatz-logo.png" alt="Julie Schatz Music" width="512" height="512" loading="eager" decoding="async"></a>
  <ul class="nav-links">
    <li><a href="/corporate-events/">Corporate</a></li>
    <li><a href="/private-events/">Private</a></li>
    <li><a href="/weddings/">Weddings</a></li>
    <li><a href="/#listen">Listen</a></li>
    <li><a href="/#about">About</a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
</nav>

<main>
  <article>
    <span class="post-kicker"><a href="/blog/">Blog</a> · ${esc(p.category)} · <time datetime="${p.date}">${longDate(p.date)}</time></span>
    <h1>${esc(p.title)}</h1>
    <p class="post-lede">${esc(p.excerpt)}</p>
${p.cover ? '    <figure class="post-cover"><img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt || p.title) + '" decoding="async"></figure>\n' : ''}    <div class="post-body">
${renderMarkdown(p.body)}
    </div>
${p.tags.length ? '    <div class="post-tags">' + p.tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>\n' : ''}  </article>

  <div class="cta-block">
    <h2>Planning an event?</h2>
    <p>Tell Julie the date, the venue and what you have in mind. She replies within 24 hours.</p>
    <a href="/#inquire" class="cta-primary">Check your date →</a>
  </div>
</main>

<footer class="site-footer">
  <p>Julie Schatz Music · <a href="/blog/">Blog</a></p>
  <p><a href="tel:+16313659554">631 · 365 · 9554</a> &nbsp;·&nbsp; <a href="mailto:bookings@julieschatzmusic.com">bookings@julieschatzmusic.com</a></p>
  <p><a href="/">Home</a> · <a href="/corporate-events/">Corporate</a> · <a href="/private-events/">Private</a> · <a href="/weddings/">Weddings</a> · <a href="/wedding-violinist-pricing/">Pricing</a> · <a href="/venues/">Venues</a></p>
</footer>

<script src="/assets/js/global-inquire-cta.js" defer></script>
</body>
</html>
`;
}

function publishedPosts(posts) {
  return posts.filter(p => p.status === 'published').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function renderBlogCards(posts) {
  return publishedPosts(posts).map(p =>
    '      <a href="/blog/' + p.slug + '/" class="post-card">\n' +
    '        <div class="post-meta">\n' +
    '          <span class="post-date">' + longDate(p.date) + '</span>\n' +
    '          <span class="post-category">' + esc(p.category) + '</span>\n' +
    '        </div>\n' +
    '        <div class="post-body">\n' +
    '          <h2>' + esc(p.title) + '</h2>\n' +
    '          <p class="post-excerpt">' + esc(p.excerpt) + '</p>\n' +
    (p.tags.length ? '          <div class="post-tags">\n            ' + p.tags.map(t => '<span>' + esc(t) + '</span>').join('') + '\n          </div>\n' : '') +
    '          <span class="post-read">Read the post</span>\n' +
    '        </div>\n' +
    '      </a>').join('\n');
}

function renderSitemapEntries(posts) {
  return publishedPosts(posts).map(p =>
    '  <url>\n    <loc>' + postUrl(p) + '</loc>\n    <lastmod>' + (p.updated || p.date) + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>').join('\n');
}

function renderFeedItems(posts) {
  return publishedPosts(posts).map(p =>
    '    <item>\n' +
    '      <title>' + esc(p.title) + '</title>\n' +
    '      <link>' + postUrl(p) + '</link>\n' +
    '      <guid isPermaLink="true">' + postUrl(p) + '</guid>\n' +
    '      <pubDate>' + rfc822(p.date) + '</pubDate>\n' +
    '      <author>bookings@julieschatzmusic.com (Julie Schatz)</author>\n' +
    '      <category>' + esc(p.category) + '</category>\n' +
    '      <description><![CDATA[' + p.excerpt.replace(/]]>/g, ']]&gt;') + ']]></description>\n' +
    '    </item>').join('\n');
}

// Given current file contents and the full post list, returns { path: newContent }.
function applyPosts(files, posts) {
  const out = {};
  out['blog.html'] = replaceRegion(files['blog.html'], 'POSTS', renderBlogCards(posts), 'blog.html');
  out['sitemap.xml'] = replaceRegion(files['sitemap.xml'], 'POSTS', renderSitemapEntries(posts), 'sitemap.xml');
  out['blog/feed.xml'] = replaceRegion(files['blog/feed.xml'], 'POSTS', renderFeedItems(posts), 'blog/feed.xml');
  publishedPosts(posts).forEach(p => { out['blog/' + p.slug + '/index.html'] = renderPostPage(p); });
  return out;
}

// Public list of booked dates (dates only, nothing else) for the
// "Is my date open?" check on the site. Written next to index.html on save.
function bookedDatesJson(events, today) {
  const dates = Array.from(new Set(events.filter(e => e.date >= today).map(e => e.date))).sort();
  return JSON.stringify({ updated: today, dates }) + '\n';
}

module.exports = {
  BASE, RESERVED_SLUGS, bookedDatesJson, slugify, parseDate, longDate,
  validateEvents, renderEventCards, renderEventSchema, applyEvents,
  validatePost, renderMarkdown, renderPostPage, applyPosts, publishedPosts, replaceRegion,
};
