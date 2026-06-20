export const config = { runtime: 'edge' };

export default async function handler(req) {
  const LYZR_API_KEY = process.env.LYZR_API_KEY;
  const AGENT_ID     = process.env.LYZR_AGENT_ID;
  const LYZR_USER_ID = process.env.LYZR_USER_ID || 'default_user';

  if (!LYZR_API_KEY || !AGENT_ID) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing env vars',
      has_key: !!LYZR_API_KEY,
      has_agent: !!AGENT_ID
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const res = await fetch('https://agent-prod.studio.lyzr.ai/v3/inference/chat/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify({
        user_id:    LYZR_USER_ID,
        agent_id:   AGENT_ID,
        session_id: `${AGENT_ID}-debug`,
        message:    'Hello, this is a debug test.',
        system_prompt_variables: {},
        filter_variables: {}
      }),
    });

    const raw = await res.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    return new Response(JSON.stringify({
      ok: res.ok,
      status: res.status,
      key_prefix: LYZR_API_KEY.slice(0, 12) + '...',
      agent_id: AGENT_ID,
      user_id: LYZR_USER_ID,
      raw_response: raw.slice(0, 800),
      parsed_response: parsed,
      response_field: parsed?.response?.slice?.(0, 200) ?? '(not found)'
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    });
  }
}
