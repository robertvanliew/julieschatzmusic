// Vercel Serverless Function: forwards conversion events to Meta CAPI.
//
// Env vars required (Vercel dashboard -> Settings -> Environment Variables):
//   META_PIXEL_ID    - Meta pixel/dataset ID (public, safe to share)
//   META_CAPI_TOKEN  - Meta Conversions API access token (SECRET)
//
// Client contract (POST /api/track):
//   {
//     event_name:        "Lead" | "CompleteRegistration" | "Contact" | "ViewContent" | ...
//     event_id:          "uuid-v4"  // must match client Pixel event ID for dedup
//     event_source_url:  window.location.href
//     custom_data:       { value, currency, content_name, content_category, ... }  (optional)
//     user_data:         { email, phone, first_name, last_name, external_id }       (optional)
//   }
//
// Meta dedups when browser Pixel + CAPI both fire same event_name+event_id.

const crypto = require('crypto');

function sha256(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return undefined;
  // Meta expects E.164-ish: digits only, country code included
  const digits = String(phone).replace(/\D/g, '');
  return digits || undefined;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS: only our own origin should call this, but allow browser fetch
  res.setHeader('Access-Control-Allow-Origin', 'https://julieschatzmusic.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!pixelId || !token) {
    console.error('META_PIXEL_ID or META_CAPI_TOKEN env var missing');
    res.status(500).json({ error: 'Server config missing' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const {
    event_name,
    event_id,
    event_source_url,
    custom_data = {},
    user_data = {},
  } = body || {};

  if (!event_name || !event_id) {
    res.status(400).json({ error: 'Missing event_name or event_id' });
    return;
  }

  // Client IP + UA (server-side signals for stronger match)
  const clientIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    undefined;
  const clientUa = req.headers['user-agent'] || undefined;

  const hashedUserData = {
    em: user_data.email ? [sha256(user_data.email)] : undefined,
    ph: user_data.phone ? [sha256(normalizePhone(user_data.phone))] : undefined,
    fn: user_data.first_name ? [sha256(user_data.first_name)] : undefined,
    ln: user_data.last_name ? [sha256(user_data.last_name)] : undefined,
    external_id: user_data.external_id ? [sha256(user_data.external_id)] : undefined,
    client_ip_address: clientIp,
    client_user_agent: clientUa,
    fbc: user_data.fbc,   // Meta click ID (from _fbc cookie) — improves match rate
    fbp: user_data.fbp,   // Meta browser ID (from _fbp cookie)
  };
  Object.keys(hashedUserData).forEach(k => {
    if (hashedUserData[k] === undefined) delete hashedUserData[k];
  });

  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url: event_source_url || undefined,
        action_source: 'website',
        user_data: hashedUserData,
        custom_data,
      },
    ],
  };

  try {
    const graphUrl =
      'https://graph.facebook.com/v20.0/' +
      encodeURIComponent(pixelId) +
      '/events?access_token=' +
      encodeURIComponent(token);

    const upstream = await fetch(graphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error('Meta CAPI non-2xx', upstream.status, result);
      res.status(502).json({ error: 'CAPI upstream error', status: upstream.status, details: result });
      return;
    }

    res.status(200).json({ success: true, events_received: result.events_received || 0 });
  } catch (err) {
    console.error('CAPI fetch threw:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'CAPI request threw' });
  }
};
