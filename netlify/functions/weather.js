// Live weather + AQI via OpenWeatherMap - OWM_KEY is server-side
const COORDS = {
  Bhubaneswar:{lat:20.2961,lon:85.8245}, Bengaluru:{lat:12.9716,lon:77.5946},
  Mumbai:{lat:19.0760,lon:72.8777},      Delhi:{lat:28.6139,lon:77.2090},
  Chennai:{lat:13.0827,lon:80.2707},     Hyderabad:{lat:17.3850,lon:78.4867},
  Pune:{lat:18.5204,lon:73.8567},        Kolkata:{lat:22.5726,lon:88.3639},
  Ahmedabad:{lat:23.0225,lon:72.5714},   Jaipur:{lat:26.9124,lon:75.7873}
};

function pm25toAQI(pm) {
  if (pm <= 12)    return Math.round(pm * 50 / 12);
  if (pm <= 35.4)  return Math.round(51  + (pm - 12.1)  * 49 / 23.3);
  if (pm <= 55.4)  return Math.round(101 + (pm - 35.5)  * 49 / 19.9);
  if (pm <= 150.4) return Math.round(151 + (pm - 55.5)  * 49 / 94.9);
  if (pm <= 250.4) return Math.round(201 + (pm - 150.5) * 99 / 99.9);
  return Math.round(301 + (pm - 250.5) * 100 / 149.9);
}

exports.handler = async function(event) {
  const city = event.queryStringParameters && event.queryStringParameters.city;
  if (!city) return { statusCode: 400, body: 'city param required' };

  const coords = COORDS[city];
  if (!coords) return { statusCode: 404, body: 'city not found' };

  const key = process.env.OWM_KEY;
  if (!key) return { statusCode: 500, body: 'OWM_KEY not configured' };

  try {
    const [wRes, aRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${key}&units=metric`),
      fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${coords.lat}&lon=${coords.lon}&appid=${key}`)
    ]);

    if (!wRes.ok || !aRes.ok) return { statusCode: 502, body: 'OWM request failed' };

    const [wData, aData] = await Promise.all([wRes.json(), aRes.json()]);
    const pm25 = aData.list[0].components.pm2_5;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
      },
      body: JSON.stringify({
        temp:     Math.round(wData.main.temp),
        humidity: wData.main.humidity,
        aqi:      pm25toAQI(pm25),
        pm25:     Math.round(pm25 * 10) / 10,
        desc:     wData.weather[0].description,
        wind:     Math.round((wData.wind && wData.wind.speed) || 0),
        live:     true
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
