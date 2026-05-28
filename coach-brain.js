// PACER Coach Function
// Handles both call formats:
//   New: { system, user, max_tokens, model }
//   Legacy: { message, context }

const CLAUDE_KEY = process.env.CLAUDE_KEY;
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!CLAUDE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Coach not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  let systemPrompt, userMessage, maxTokens, model;

  if (body.system && body.user) {
    // New format from app
    systemPrompt = body.system;
    userMessage = body.user;
    maxTokens = body.max_tokens || 300;
    model = body.model || 'claude-haiku-4-5-20251001';

  } else if (body.message) {
    // Legacy format
    const { message, context = {} } = body;
    const { city = 'Bengaluru', planName = 'General', weekNum = 1, sessDesc = 'run',
            hi = 28, thermal = 0, aqi = 75, weeklyKm = 0, goalKm = 40, streak = 0, recentRuns = [] } = context;

    const hr = new Date().getHours();
    const timeLabel = hr < 7 ? 'pre-dawn' : hr < 10 ? 'morning' : hr < 14 ? 'midday' : hr < 18 ? 'afternoon' : hr < 21 ? 'evening' : 'night';
    const runsText = recentRuns.slice(0, 3).map(r => `${r.dist || ''} (felt ${r.feel || '-'})`).join('; ') || 'no recent runs';

    const cacheKey = `${message}|${city}|${hi}|${new Date().getHours()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { statusCode: 200, headers, body: JSON.stringify({ response: cached.response, content: [{ type: 'text', text: cached.response }], cached: true }) };
    }

    systemPrompt = `You are PACER's running coach for Indian runners. Know Jack Daniels methodology, 80/20 training, Indian conditions and food. Be direct, 2-3 sentences, end with one clear action. Never start with "I".`;
    userMessage = `City: ${city} | Time: ${timeLabel} | Heat: ${hi}C | AQI: ${aqi} | +${thermal}s/km harder\nPlan: ${planName} | Today: ${sessDesc}\nWeek: ${weeklyKm}/${goalKm}km | Streak: ${streak}\nRecent: ${runsText}\n\nRunner: "${message}"\n\nCoaching response:`;
    maxTokens = 160;
    model = 'claude-haiku-4-5-20251001';
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'system+user or message required' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Claude error:', res.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Coach unavailable', detail: err }) };
    }

    const data = await res.json();
    const response = (data.content && data.content[0] && data.content[0].text) || '';

    // Cache legacy calls
    if (body.message) {
      const cacheKey = `${body.message}|${body.context?.city}|${body.context?.hi}|${new Date().getHours()}`;
      cache.set(cacheKey, { response, ts: Date.now() });
      if (cache.size > 500) {
        [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100).forEach(([k]) => cache.delete(k));
      }
    }

    // Return both formats
    return { statusCode: 200, headers, body: JSON.stringify({ response, content: [{ type: 'text', text: response }] }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
