// netlify/functions/strava-auth-url.js
// Returns the Strava OAuth authorization URL.
// Requires STRAVA_CLIENT_ID in Netlify environment variables.

const handler = async (event, context) => {
  const clientId = process.env.STRAVA_CLIENT_ID;

  if (!clientId) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'STRAVA_CLIENT_ID not configured in Netlify environment variables.' })
    };
  }

  // Use Netlify's URL env var for the redirect, fallback to known production URL
  const baseUrl = process.env.URL || 'https://pacerbetaappv2.netlify.app';
  const redirectUri = baseUrl + '/';

  const url = 'https://www.strava.com/oauth/authorize' +
    '?client_id=' + clientId +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&approval_prompt=auto' +
    '&scope=activity:read_all';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ url })
  };
};

module.exports = { handler };
