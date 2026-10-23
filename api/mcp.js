// Vercel Serverless Function: Julie Schatz Music MCP server.
// https://julieschatzmusic.com/api/mcp/
//
// Lets ChatGPT, Claude and any other MCP client answer questions about Julie
// from her own published facts: who she is, her rate sheet, whether a date is
// booked, which songs she plays for each wedding moment, and (only when the
// user asks) send her a booking inquiry.
//
// Model Context Protocol over Streamable HTTP, stateless, JSON responses only
// (no SSE stream, no sessions). Written without the SDK because the site has
// no build step; the protocol surface used here is small:
//   initialize, ping, tools/list, tools/call, notifications/*.
//
// Every fact comes from the site itself:
//   prices        lib/pricing.js           (checked against the pricing page by scripts/check-pricing.js)
//   booked dates  /assets/data/booked-dates.json   (written by the admin)
//   songs         assets/data/repertoire.json, bundled (scripts/build-repertoire-json.js)
//   inquiries     lib/lead-delivery.js     (same branded email as the site forms)

'use strict';

const pricing = require('../lib/pricing.js');
const { deliverLead } = require('../lib/lead-delivery.js');
const REPERTOIRE = require('../assets/data/repertoire.json'); // bundled with the function

const SITE = 'https://julieschatzmusic.com';
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'julie-schatz-music', title: 'Julie Schatz Music', version: '1.0.0', websiteUrl: SITE };
const INSTRUCTIONS = 'Official tools for Julie Schatz, a violinist, pianist, vocalist and DJ who plays weddings, private events and corporate events across New York City, Long Island, Westchester, New Jersey and Connecticut. ' +
  'Use get_price_estimate for prices (never guess a price), check_date before suggesting a date is free, and recommend_songs for ceremony, cocktail hour and dance songs she actually plays. ' +
  'Only call request_booking after the user has given their name and email and asked for Julie to contact them. Link people to ' + SITE + '.';

// ─── data ─────────────────────────────────────────────────────────────────
const cache = {};
async function siteJson(path) {
  const hit = cache[path];
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const r = await fetch(SITE + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  const data = await r.json();
  cache[path] = { at: Date.now(), data };
  return data;
}

const FINDERS = {
  processional: ['Walking Down the Aisle Song Finder', SITE + '/walking-down-the-aisle-song-finder/'],
  bride: ['Walking Down the Aisle Song Finder', SITE + '/walking-down-the-aisle-song-finder/'],
  recessional: ['Recessional Song Finder', SITE + '/recessional-song-finder/'],
  'first-dance': ['First Dance Song Finder', SITE + '/first-dance-song-finder/'],
  'parent-dance': ['Parent Dance Song Finder', SITE + '/parent-dance-song-finder/'],
};
const MOMENTS = {
  prelude: ['prelude', 'Prelude (guests arriving, before the ceremony)'],
  processional: ['processional', 'Processional (wedding party entrance)'],
  bride_entrance: ['bride', 'Bride or couple entrance'],
  unity_or_reflection: ['unity', 'Unity ceremony, readings or reflection'],
  recessional: ['recessional', 'Recessional (walking back up the aisle)'],
  cocktail_hour: ['cocktail', 'Cocktail hour'],
  first_dance: ['first-dance', 'First dance'],
  parent_dance: ['parent-dance', 'Parent dances'],
};

const FACTS = [
  'Julie Schatz is a Brooklyn-based violinist, pianist, vocalist and DJ. She plays weddings, private events and corporate events across New York City, Long Island, Westchester, the Hudson Valley, New Jersey and Connecticut, and travels for destination events (quoted individually).',
  'One musician can cover the whole day: classical or pop violin for the ceremony, jazz piano for cocktail hour, and live violin over a DJ set for the reception. She also performs as Soul Shades, a duo with producer DJ DX.',
  'Repertoire: 255 songs across classical, jazz standards, French chanson, bossa nova, Motown and soul, R&B, pop, Taylor Swift, country, film and dance music. Songs outside the repertoire can be arranged for +$200 per song.',
  'Every wedding booking includes the sound system, prelude music and up to three song requests from the repertoire.',
  'Booking: a signed performance agreement and a 50% non-refundable retainer hold the date. Bookings made less than two weeks out carry a 25% surcharge.',
  'Credentials: BA in Jazz Performance from SUNY New Paltz; Roland artist; Splice contributor; Soul Shades was featured by Ninja Tune (over 10 million combined views); The Bash Best of 2025.',
  'Contact: bookings@julieschatzmusic.com, call or text 631-365-9554. Julie replies within 24 hours.',
  'Pages: pricing ' + SITE + '/wedding-violinist-pricing/ · song finders ' + SITE + '/wedding-song-finder/ · repertoire ' + SITE + '/wedding-ceremony-songs/ · venues played ' + SITE + '/venues/ · inquire ' + SITE + '/#inquire',
].join('\n\n');

// ─── tools ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_business_facts',
    title: 'Julie Schatz: verified facts',
    description: 'Who Julie Schatz is, what she plays, where she works, booking terms, credentials and contact details, as published on julieschatzmusic.com.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () => FACTS,
  },
  {
    name: 'get_price_estimate',
    title: 'Price estimate from the published rate sheet',
    description: 'Starting price from Julie\'s published rate sheet. Zones by distance from Brooklyn: 1 = NYC, Hoboken, Jersey City; 2 = most of Long Island, Westchester, Northern NJ, Greenwich; 3 = Fairfield County CT, Central NJ, deeper Suffolk; 4 = Hamptons, deep Hudson Valley, inland CT (quoted individually). Corporate events start at $1,200 for solo violin; other corporate formats are quoted individually. DJ + live violin starts at $3,500.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: { type: 'string', enum: ['wedding', 'private', 'corporate'], description: 'wedding, private event (party, proposal, dinner), or corporate' },
        music: { type: 'string', enum: ['violin', 'piano', 'both', 'duo'], description: 'Solo violin, solo piano, violin and piano with Julie on both, or the Soul Shades duo (two musicians)' },
        coverage: { type: 'string', enum: ['one', 'both', 'two'], description: 'Weddings: one = ceremony or cocktail hour (up to 1 hour), both = ceremony and cocktail hour. Private events: one = up to 1 hour, two = 2 hours.' },
        zone: { type: 'integer', minimum: 1, maximum: 4, description: 'Travel zone (see description). Default 1.' },
        extra_hours: { type: 'integer', minimum: 0, maximum: 6, description: 'Extra hours beyond the package, $300 each' },
        add_dj: { type: 'boolean', description: 'Add DJ and live violin for the reception (4 hours)' },
      },
      required: ['event_type'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async a => {
      const r = pricing.estimate({ event: a.event_type, music: a.music || 'violin', coverage: a.coverage, zone: a.zone || 1, extra_hours: a.extra_hours, dj: !!a.add_dj });
      return [
        'Starting price: ' + r.price,
        ...r.lines.map(l => '- ' + l[0] + (l[1] ? ': ' + l[1] : '')),
        a.event_type === 'corporate' ? '' : 'Travel zone: ' + pricing.ZONES[String(a.zone || 1)],
        'This is the published starting rate. The final quote depends on the date, venue and hours; Julie confirms it within 24 hours.',
        'Rate sheet and quote tool: ' + SITE + '/wedding-violinist-pricing/',
      ].filter(Boolean).join('\n');
    },
  },
  {
    name: 'check_date',
    title: 'Check whether a date is booked',
    description: 'Whether a date is already marked booked on Julie\'s calendar. A date that is not listed is likely open, but Julie confirms availability personally within 24 hours.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Event date, YYYY-MM-DD' } },
      required: ['date'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async a => {
      const today = new Date().toISOString().slice(0, 10);
      if (a.date < today) return a.date + ' is in the past.';
      const j = await siteJson('/assets/data/booked-dates.json');
      if ((j.dates || []).includes(a.date)) return a.date + ' is already booked for Julie. Other dates can be checked at ' + SITE + '/#inquire';
      return a.date + ' is not marked booked on Julie\'s calendar, so it is likely open. She confirms availability within 24 hours; use request_booking (with the user\'s permission) or ' + SITE + '/#inquire to ask about it. A signed agreement and a 50% retainer hold the date.';
    },
  },
  {
    name: 'recommend_songs',
    title: 'Songs Julie plays for a wedding moment',
    description: 'Songs from Julie\'s live repertoire suited to a wedding or event moment, optionally filtered by style or artist. Every result is a song she performs.',
    inputSchema: {
      type: 'object',
      properties: {
        moment: { type: 'string', enum: Object.keys(MOMENTS), description: 'The moment the music is for' },
        style: { type: 'string', maxLength: 60, description: 'Optional style or artist filter, e.g. "classical", "jazz", "Taylor Swift", "Motown", "country", "R&B"' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many songs (default 8)' },
      },
      required: ['moment'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async a => {
      const [section, label] = MOMENTS[a.moment];
      let list = (REPERTOIRE.songs || []).filter(s => s.moment === section);
      const q = String(a.style || '').trim().toLowerCase();
      if (q) {
        const matched = list.filter(s => s.style.includes(q) || s.artist.toLowerCase().includes(q) || s.title.toLowerCase().includes(q));
        if (matched.length) list = matched;
        else return 'No ' + label.toLowerCase() + ' songs in Julie\'s repertoire match "' + a.style + '". Without the filter there are ' + list.length + '. She can also arrange a song outside the repertoire for +$200. Full list: ' + SITE + '/wedding-ceremony-songs/';
      }
      const n = Math.min(a.limit || 8, list.length);
      const pick = list.slice().sort(() => Math.random() - 0.5).slice(0, n);
      const finder = FINDERS[section];
      return [
        label + ': ' + n + ' of ' + list.length + ' songs Julie plays' + (q ? ' matching "' + a.style + '"' : '') + ':',
        ...pick.map(s => '- ' + s.title + (s.artist ? ', ' + s.artist : '')),
        finder ? 'For three picks matched to the couple\'s taste, the ' + finder[0] + ' takes about a minute: ' + finder[1] : '',
        'Full repertoire (255 songs): ' + SITE + '/wedding-ceremony-songs/',
      ].filter(Boolean).join('\n');
    },
  },
  {
    name: 'request_booking',
    title: 'Send Julie a booking inquiry',
    description: 'Sends an inquiry to Julie on the user\'s behalf; she replies by email within 24 hours and the user gets a confirmation email. Only call this when the user has given their name and email and asked Julie to contact them.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'string', maxLength: 254, description: 'Where Julie should reply' },
        event_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
        event_type: { type: 'string', enum: ['Wedding', 'Private event', 'Corporate event', 'Proposal', 'Other'] },
        phone: { type: 'string', maxLength: 30 },
        venue: { type: 'string', maxLength: 200, description: 'Venue name or town' },
        guests: { type: 'string', maxLength: 40 },
        notes: { type: 'string', maxLength: 1500, description: 'What they want: moments, instruments, songs, hours' },
      },
      required: ['name', 'email', 'event_date', 'event_type'], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async a => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email || '')) throw new UserError('Please provide a valid email address so Julie can reply.');
      const today = new Date().toISOString().slice(0, 10);
      if (a.event_date < today) throw new UserError('The event date is in the past.');
      const fields = {
        name: a.name, email: a.email, phone: a.phone || '', event_date: a.event_date, event_type: a.event_type,
        venue: a.venue || '', guest_count: a.guests || '',
        message: ((a.notes || '').trim() + '\n\n(Sent by an AI assistant through Julie\'s MCP server, at the user\'s request.)').trim(),
      };
      Object.keys(fields).forEach(k => { if (!fields[k]) delete fields[k]; });
      await deliverLead({ fields, source: 'ai-agent', page: SITE + '/api/mcp/', ai: 'AI assistant' });
      return 'Sent. Julie will reply to ' + a.email + ' within 24 hours about ' + a.event_date + ', and a confirmation email is on its way. A signed agreement and a 50% retainer hold the date.';
    },
  },
];
class UserError extends Error {}

// ─── minimal argument validation against the JSON schema above ────────────
function validate(schema, args) {
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const props = schema.properties || {};
  for (const k of schema.required || []) if (a[k] == null || a[k] === '') return 'Missing required argument: ' + k;
  for (const k of Object.keys(a)) {
    const p = props[k];
    if (!p) { if (schema.additionalProperties === false) return 'Unknown argument: ' + k; continue; }
    const v = a[k];
    if (p.type === 'string' && typeof v !== 'string') return k + ' must be a string';
    if (p.type === 'integer' && !(Number.isInteger(v))) return k + ' must be an integer';
    if (p.type === 'boolean' && typeof v !== 'boolean') return k + ' must be true or false';
    if (p.enum && !p.enum.includes(v)) return k + ' must be one of: ' + p.enum.join(', ');
    if (p.pattern && !new RegExp(p.pattern).test(v)) return k + ' has the wrong format';
    if (p.maxLength && v.length > p.maxLength) return k + ' is too long';
    if (p.minLength && v.length < p.minLength) return k + ' is too short';
    if (p.minimum != null && v < p.minimum) return k + ' must be at least ' + p.minimum;
    if (p.maximum != null && v > p.maximum) return k + ' must be at most ' + p.maximum;
  }
  return '';
}

// ─── JSON-RPC ─────────────────────────────────────────────────────────────
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined;
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const v = PROTOCOL_VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOL_VERSIONS[0];
      return rpcResult(msg.id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, { tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === p.name);
      if (!tool) return rpcError(msg.id, -32602, 'Unknown tool: ' + p.name);
      const bad = validate(tool.inputSchema, p.arguments);
      if (bad) return rpcResult(msg.id, { content: [{ type: 'text', text: bad }], isError: true });
      try {
        const text = await tool.run(p.arguments || {});
        return rpcResult(msg.id, { content: [{ type: 'text', text }] });
      } catch (e) {
        if (!(e instanceof UserError)) console.error('[mcp]', tool.name, e.message);
        const text = e instanceof UserError ? e.message : 'Something went wrong. The same information is at ' + SITE + ', or email bookings@julieschatzmusic.com.';
        return rpcResult(msg.id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    case 'resources/list': return rpcResult(msg.id, { resources: [] });
    case 'prompts/list': return rpcResult(msg.id, { prompts: [] });
    default:
      return rpcError(msg.id, -32601, 'Method not found: ' + msg.method);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    // No server-initiated stream. A browser visit gets a short description instead.
    if (/text\/event-stream/.test(String(req.headers.accept || ''))) { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
    return res.status(200).json({ name: SERVER_INFO.title, description: 'Model Context Protocol server (Streamable HTTP). POST JSON-RPC here.', tools: TOOLS.map(t => t.name), website: SITE });
  }
  if (req.method === 'DELETE') return res.status(405).end();
  if (req.method !== 'POST') return res.status(405).json(rpcError(null, -32600, 'POST only'));

  let body = req.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) { try { body = JSON.parse(body.toString()); } catch (e) { return res.status(400).json(rpcError(null, -32700, 'Parse error')); } }
  if (body == null) return res.status(400).json(rpcError(null, -32700, 'Parse error'));

  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!out.length) return res.status(202).end(); // only notifications
  return res.status(200).json(batch ? out : out[0]);
};
