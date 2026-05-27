// Refreshes an expired Strava access token - keeps CLIENT_SECRET server-side
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { refresh_token } = JSON.parse(event.body || '{}');
    if (!refresh_token) return { statusCode: 400, body: 'refresh_token required' };

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type:    'refresh_token'
      })
    });

    const data = await response.json();
    if (!data.access_token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Refresh failed' }) };
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
