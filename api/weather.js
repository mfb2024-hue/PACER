// api/weather.js — Vercel serverless function
// Fetches AQI and weather data for an Indian city using Open-Meteo

const COORDS = {
  Bengaluru: { lat: 12.9716, lon: 77.5946 },
  Mumbai:    { lat: 19.0760, lon: 72.8777 },
  Delhi:     { lat: 28.6139, lon: 77.2090 },
  Chennai:   { lat: 13.0827, lon: 80.2707 },
  Hyderabad: { lat: 17.3850, lon: 78.4867 },
  Pune:      { lat: 18.5204, lon: 73.8567 },
  Kolkata:   { lat: 22.5726, lon: 88.3639 },
  Ahmedabad: { lat: 23.0225, lon: 72.5714 },
  Jaipur:    { lat: 26.9124, lon: 75.7873 },
  Bhubaneswar: { lat: 20.2961, lon: 85.8245 }
};

const DEFAULT = COORDS.Bengaluru;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const city = req.query.city || 'Bengaluru';
  const coord = COORDS[city] || DEFAULT;

  try {
    // Fetch weather + AQI in parallel from Open-Meteo
    const [weatherResp, aqiResp] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coord.lat}&longitude=${coord.lon}` +
        `&current=pm2_5,pm10,us_aqi&timezone=auto`
      )
    ]);

    const [weatherData, aqiData] = await Promise.all([
      weatherResp.json(),
      aqiResp.json()
    ]);

    const temp     = weatherData.current?.temperature_2m ?? 28;
    const humidity = weatherData.current?.relative_humidity_2m ?? 60;
    const wind     = weatherData.current?.wind_speed_10m ?? 10;
    const aqi      = aqiData.current?.us_aqi ?? 80;
    const pm25     = aqiData.current?.pm2_5 ?? 30;

    return res.status(200).json({
      temp, humidity, wind, aqi, pm25,
      city, live: true,
      ts: Date.now()
    });

  } catch (err) {
    // Return static fallback so app never crashes on weather failure
    return res.status(200).json({
      temp: 28, humidity: 60, wind: 10, aqi: 80, pm25: 30,
      city, live: false, ts: Date.now()
    });
  }
};
