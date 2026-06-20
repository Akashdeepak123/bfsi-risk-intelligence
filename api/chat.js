export const config = { runtime: 'edge' };

const LYZR_ENDPOINT = 'https://agent-prod.studio.lyzr.ai/v3/inference/chat/';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const LYZR_API_KEY = process.env.LYZR_API_KEY;
  const AGENT_ID     = process.env.LYZR_AGENT_ID;
  const LYZR_USER_ID = process.env.LYZR_USER_ID;

  if (!LYZR_API_KEY || !AGENT_ID || !LYZR_USER_ID) {
    return new Response(
      JSON.stringify({ error: 'Server not configured. Check LYZR_API_KEY and LYZR_AGENT_ID env vars.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { message, session_id } = body;
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    return new Response(JSON.stringify({ error: 'Message too short.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

const payload = {
  user_id:   LYZR_USER_ID,
  agent_id:  AGENT_ID,
  session_id: session_id || `session_${Date.now()}`,
  message:   message.trim(),
  system_prompt_variables: {},
  filter_variables: {}
};

  try {
    const upstream = await fetch(LYZR_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    LYZR_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(
        JSON.stringify({ error: `Lyzr API error ${upstream.status}: ${errText.slice(0, 300)}` }),
        { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await upstream.json();
    const response = data?.response ?? data?.message ?? JSON.stringify(data);

    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not reach Lyzr API: ' + err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
