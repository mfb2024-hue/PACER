// Netlify Function: /api/weather
// Proxies OpenWeatherMap — API key never leaves this server
// Deploy: add OWM_KEY to Netlify environment variables

const OWM_KEY = process.env.OWM_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const city = event.queryStringParameters?.city || 'Bhubaneswar';

  if (!OWM_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Weather API not configured' }) };
  }

  try {
    const cityQuery = encodeURIComponent(city + ',IN');
    
    // Fetch weather and AQI in parallel
    const [weatherRes, _placeholder] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cityQuery}&appid=${OWM_KEY}&units=metric`),
    ]);

    if (!weatherRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Weather fetch failed', status: weatherRes.status }) };
    }

    const w = await weatherRes.json();
    const temp     = Math.round(w.main.temp);
    const humidity = w.main.humidity;
    const windKph  = Math.round((w.wind?.speed || 0) * 3.6);
    const hi       = Math.round(temp + 0.33 * (humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.3 + temp))) - 4.0);
    const thermal  = Math.round(Math.max(0, (hi - 28) * 5 + Math.max(0, humidity - 60) / 10 * 3));

    // AQI
    let aqi = 75;
    try {
      const aqiRes = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${w.coord.lat}&lon=${w.coord.lon}&appid=${OWM_KEY}`
      );
      if (aqiRes.ok) {
        const aqiData = await aqiRes.json();
        const aqiMap = { 1: 25, 2: 60, 3: 110, 4: 170, 5: 250 };
        aqi = aqiMap[aqiData.list?.[0]?.main?.aqi] ?? 75;
      }
    } catch (e) { /* use default */ }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ temp, humidity, hi, thermal, aqi, windKph, live: true, city }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
