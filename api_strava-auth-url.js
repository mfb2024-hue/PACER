// api/strava-auth-url.js — Vercel serverless function
// Returns the Strava OAuth authorization URL

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'STRAVA_CLIENT_ID not configured' });
  }

  // Use Vercel's VERCEL_URL env var, fallback to production URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://pacerbetaappv2.netlify.app');
  const redirectUri = baseUrl + '/';

  const url = 'https://www.strava.com/oauth/authorize' +
    '?client_id=' + clientId +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&approval_prompt=auto' +
    '&scope=activity:read_all';

  return res.status(200).json({ url });
};
