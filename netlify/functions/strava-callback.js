// Exchanges Strava auth code for tokens - keeps CLIENT_SECRET server-side
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { code } = JSON.parse(event.body || '{}');
    if (!code) return { statusCode: 400, body: 'code required' };

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code:          code,
        grant_type:    'authorization_code'
      })
    });

    const data = await response.json();
    if (!data.access_token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Token exchange failed', details: data }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
