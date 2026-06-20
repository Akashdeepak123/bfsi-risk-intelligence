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
  const LYZR_USER_ID = process.env.LYZR_USER_ID || 'default_user';

  if (!LYZR_API_KEY || !AGENT_ID) {
    return new Response(
      JSON.stringify({ error: 'Server not configured. Add LYZR_API_KEY and LYZR_AGENT_ID in Vercel env vars.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { message, session_id } = body || {};

  if (!message || typeof message !== 'string' || message.trim().length < 3) {
    return new Response(JSON.stringify({ error: 'Message too short.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Match the session_id format Lyzr uses: {agent_id}-{random}
  const sid = session_id || `${AGENT_ID}-${Math.random().toString(36).slice(2, 10)}`;

  const payload = {
    user_id:                LYZR_USER_ID,
    agent_id:               AGENT_ID,
    session_id:             sid,
    message:                message.trim(),
    system_prompt_variables: {},
    filter_variables:       {}
  };

  try {
    const upstream = await fetch(LYZR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    LYZR_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // Read raw text first — avoids pattern mismatch errors from unexpected bodies
    const rawText = await upstream.text();

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Lyzr API error ${upstream.status}: ${rawText.slice(0, 400)}` }),
        { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Parse JSON safely
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If Lyzr returned plain text, use it directly
      return new Response(
        JSON.stringify({ response: rawText }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Extract response string — handle all known Lyzr response shapes
    let response;
    if (typeof data?.response === 'string' && data.response.length > 0) {
      response = data.response;
    } else if (typeof data?.message === 'string' && data.message.length > 0) {
      response = data.message;
    } else if (typeof data?.output === 'string') {
      response = data.output;
    } else if (data?.response?.content) {
      response = data.response.content;
    } else if (data?.choices?.[0]?.message?.content) {
      response = data.choices[0].message.content;
    } else {
      response = JSON.stringify(data);
    }

    return new Response(
      JSON.stringify({ response }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not reach Lyzr API: ' + err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
