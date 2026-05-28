// PACER Weather Function - Open-Meteo (no API key, better accuracy)
// Combines weather forecast + air quality in one response

const COORDS = {
  Bhubaneswar:{lat:20.2961,lon:85.8245}, Bengaluru:{lat:12.9716,lon:77.5946},
  Mumbai:{lat:19.0760,lon:72.8777},      Delhi:{lat:28.6139,lon:77.2090},
  Chennai:{lat:13.0827,lon:80.2707},     Hyderabad:{lat:17.3850,lon:78.4867},
  Pune:{lat:18.5204,lon:73.8567},        Kolkata:{lat:22.5726,lon:88.3639},
  Ahmedabad:{lat:23.0225,lon:72.5714},   Jaipur:{lat:26.9124,lon:75.7873}
};

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800', // cache 30 min
    'Access-Control-Allow-Origin': '*'
  };

  const city = event.queryStringParameters && event.queryStringParameters.city;
  if (!city) return { statusCode: 400, headers, body: JSON.stringify({ error: 'city param required' }) };

  // Handle unknown cities by trying to geocode them via Open-Meteo's geocoding API
  let coords = COORDS[city];
  if (!coords) {
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results[0]) {
        coords = { lat: geoData.results[0].latitude, lon: geoData.results[0].longitude };
      } else {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'City not found' }) };
      }
    } catch (err) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'City not found' }) };
    }
  }

  try {
    // Fetch weather + air quality in parallel from Open-Meteo
    const [weatherRes, aqiRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code` +
        `&hourly=temperature_2m&forecast_days=1&timezone=auto`
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality` +
        `?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=pm2_5,pm10,us_aqi,european_aqi` +
        `&hourly=us_aqi,pm2_5&forecast_days=1`
      )
    ]);

    if (!weatherRes.ok || !aqiRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream error' }) };
    }

    const [wData, aData] = await Promise.all([weatherRes.json(), aqiRes.json()]);

    const current = wData.current;
    const aqiCurrent = aData.current;

    // Open-Meteo gives US AQI directly - no conversion needed
    const usAqi = Math.round(aqiCurrent.us_aqi || 0);
    const pm25 = Math.round((aqiCurrent.pm2_5 || 0) * 10) / 10;
    const temp = Math.round(current.temperature_2m);
    const humidity = Math.round(current.relative_humidity_2m);
    const feelsLike = Math.round(current.apparent_temperature);
    const wind = Math.round(current.wind_speed_10m);

    // Get next 5 hours of AQI forecast for the "plan a run" feature
    const hourlyAqi = (aData.hourly && aData.hourly.us_aqi)
      ? aData.hourly.us_aqi.slice(0, 24)
      : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        temp,
        humidity,
        feelsLike,
        aqi: usAqi,
        pm25,
        wind,
        live: true,
        source: 'open-meteo',
        hourlyAqi: hourlyAqi.filter(v => v !== null).slice(0, 12)
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
