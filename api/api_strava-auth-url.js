// api/strava-auth-url.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'STRAVA_CLIENT_ID not set in Vercel environment variables' });
  }

  // Trim whitespace/newlines that can get copied in accidentally
  const cleanClientId = String(clientId).trim();

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim() ||
                  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL.trim() : '');

  if (!baseUrl) {
    return res.status(500).json({ error: 'NEXT_PUBLIC_SITE_URL not set. Add it to Vercel environment variables.' });
  }

  const redirectUri = baseUrl.replace(/\/$/, '') + '/';

  const url = 'https://www.strava.com/oauth/authorize' +
    '?client_id=' + encodeURIComponent(cleanClientId) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&approval_prompt=auto' +
    '&scope=activity:read_all';

  return res.status(200).json({ url, redirectUri, clientId: cleanClientId });
};
