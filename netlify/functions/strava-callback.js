// Netlify Function: /api/strava/callback
// Handles Strava OAuth token exchange — client_secret stays on server
// Deploy: add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to Netlify env vars

const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { code, grant_type, refresh_token } = event.httpMethod === 'POST'
    ? (JSON.parse(event.body || '{}'))
    : event.queryStringParameters;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Strava not configured on server' }) };
  }

  try {
    const payload = grant_type === 'refresh_token'
      ? { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token, grant_type: 'refresh_token' }
      : { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' };

    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Strava token exchange failed', detail: err }) };
    }

    const data = await res.json();
    // Return token data to the app — app stores it in localStorage
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
        athlete: {
          id:        data.athlete?.id,
          firstname: data.athlete?.firstname,
          lastname:  data.athlete?.lastname,
          city:      data.athlete?.city,
        }
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
