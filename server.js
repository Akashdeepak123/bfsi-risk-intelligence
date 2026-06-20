const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// Load .env if present
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch (_) {}

const LYZR_API_KEY = process.env.LYZR_API_KEY;
const AGENT_ID     = process.env.LYZR_AGENT_ID;
const LYZR_USER_ID = process.env.LYZR_USER_ID || 'demo_user';
const PORT         = process.env.PORT || 3001;
const LYZR_URL     = 'https://agent-prod.studio.lyzr.ai/v3/inference/chat/';

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon'
};

async function proxyLyzr(body) {
  const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
  const fn = fetch || globalThis.fetch;

  const payload = {
    user_id:   LYZR_USER_ID,
    agent_id:  AGENT_ID,
    session_id: `${AGENT_ID}-${Math.random().toString(36).slice(2, 10)}`,
    message:   body.message,
    system_prompt_variables: {},
    filter_variables: {}
  };

  const res = await fn(LYZR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': LYZR_API_KEY },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  if (!res.ok) return { error: `Lyzr error ${res.status}: ${rawText.slice(0, 300)}` };

  let response;
  try {
    const data = JSON.parse(rawText);
    response = data.response || data.message || data.output || rawText;
  } catch (_) {
    response = rawText;
  }
  return { response };
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = req.url.split('?')[0];

  // ── API: /api/chat ──────────────────────────────────────────────────────
  if (url === '/api/chat' && req.method === 'POST') {
    if (!LYZR_API_KEY || !AGENT_ID) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Add LYZR_API_KEY and LYZR_AGENT_ID to your .env file' }));
    }
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed.message || parsed.message.trim().length < 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Message too short.' }));
        }
        console.log(`[${new Date().toLocaleTimeString()}] Query: ${parsed.message.slice(0,80)}...`);
        console.log('  Calling Lyzr — this takes 60-90s for manager agents...');
        const result = await proxyLyzr(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        console.log('  Done.');
	console.log('\n--- RAW RESPONSE ---');
	console.log(JSON.stringify(result).slice(0, 2000));
	console.log('--- END ---\n');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── API: /api/debug ─────────────────────────────────────────────────────
  if (url === '/api/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      key_set: !!LYZR_API_KEY,
      key_prefix: LYZR_API_KEY ? LYZR_API_KEY.slice(0,12)+'...' : 'NOT SET',
      agent_id: AGENT_ID || 'NOT SET',
      user_id: LYZR_USER_ID
    }));
  }

  // ── Static files from ./public ──────────────────────────────────────────
  let filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch (_) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.timeout = 180000; // 3 minutes — enough for slow Lyzr responses

server.listen(PORT, () => {
  console.log(`\n  BFSI Risk Intelligence — local server`);
  console.log(`  ──────────────────────────────────────`);
  console.log(`  Open: http://localhost:${PORT}`);
  console.log(`  Key:  ${LYZR_API_KEY ? '✓ set' : '✗ MISSING — add to .env'}`);
  console.log(`  Agent: ${AGENT_ID || '✗ MISSING — add to .env'}`);
  console.log(`\n  Note: Lyzr manager agents take 60-90s. This is normal.\n`);
});
