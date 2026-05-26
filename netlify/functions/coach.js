// Netlify Function: /api/coach
// Proxies Claude API — key never exposed to users
// Deploy: add CLAUDE_KEY to Netlify environment variables

const CLAUDE_KEY = process.env.CLAUDE_KEY;

// Simple cache to avoid duplicate calls (same message, same context, within 5 mins)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!CLAUDE_KEY)                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Coach not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { message, context } = body;
  if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'message required' }) };

  // Cache key
  const cacheKey = `${message}|${context?.city}|${context?.hi}|${new Date().getHours()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { statusCode: 200, headers, body: JSON.stringify({ response: cached.response, cached: true }) };
  }

  const { city='Bhubaneswar', planName='General fitness', weekNum=1, sessDesc='free run',
          hi=28, thermal=0, aqi=75, weeklyKm=0, goalKm=40, streak=0, recentRuns=[] } = context || {};

  const runsText = recentRuns.slice(0, 3)
    .map(r => `${r.name||r.label||'Run'} ${r.dist||''} (felt ${r.feel||'—'})`)
    .join('; ') || 'no recent runs';

  const hr = new Date().getHours();
  const timeLabel = hr < 7 ? 'pre-dawn' : hr < 10 ? 'morning' : hr < 14 ? 'midday' : hr < 18 ? 'afternoon' : hr < 21 ? 'evening' : 'night';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 160,
        system: `You are PACER's running coach for Indian runners. You deeply know Jack Daniels methodology, 80/20 training, periodisation, and Indian conditions. Be direct and specific in 2-3 short sentences. Always end with one clear action. You know Indian food (roti, dal, curd rice, sattu, coconut water, ORS, dates). You know Indian conditions (monsoon, high AQI, heat index). Never start with "I" or "Great question". Sound like a knowledgeable friend who runs, not a textbook.`,
        messages: [{
          role: 'user',
          content: `Runner context:
City: ${city} | Time: ${timeLabel}
Conditions: heat index ${hi}°C, AQI ${aqi}, +${thermal}s/km harder than normal
Plan: ${planName} Week ${weekNum} | Today's session: ${sessDesc}
Week: ${weeklyKm}/${goalKm}km | Streak: ${streak} runs
Recent: ${runsText}

Runner says: "${message}"

Coaching advice (2-3 sentences, end with one clear action):`
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Claude error:', res.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Coach unavailable' }) };
    }

    const data = await res.json();
    const response = data.content?.[0]?.text || '';

    // Cache it
    cache.set(cacheKey, { response, ts: Date.now() });
    // Clean old cache entries
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts).slice(0, 100);
      oldest.forEach(([k]) => cache.delete(k));
    }

    return { statusCode: 200, headers, body: JSON.stringify({ response }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
