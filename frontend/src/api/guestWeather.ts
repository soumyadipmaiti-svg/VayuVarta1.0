/**
 * Guest Weather — fetches directly from Open-Meteo (no backend needed)
 * Used when user is in explorer mode (not logged in)
 */

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm',
};

function wmoToCondition(code: number): string {
  return WMO_CODES[code] || 'Unknown';
}

export interface GuestWeather {
  location: string;
  current: {
    temp_c: number;
    feels_like_c: number;
    humidity: number;
    wind_kph: number;
    wind_dir: string;
    condition: string;
    pressure_mb: number;
    uv_index: number;
    visibility_km: number;
    cloud_coverage: number;
    is_day: number;
    rain_mm: number;
    localtime: string;
    sunrise: string;
    sunset: string;
  };
}

export interface GuestForecastDay {
  date: string;
  condition: string;
  max_temp_c: number;
  min_temp_c: number;
  rain_probability: number;
  max_wind_kph: number;
  uv_index: number;
  humidity: number;
  pressure_mb: number;
  visibility_km: number;
  sunrise: string;
  sunset: string;
}

export interface GuestForecast {
  days: GuestForecastDay[];
}

export interface GuestHour {
  time: string;
  temp_c: number;
  condition: string;
  rain_probability: number;
  humidity: number;
  wind_kph: number;
  is_day: number;
}

export interface GuestHourly {
  hours: GuestHour[];
}

export async function fetchGuestWeather(lat: number, lon: number, name: string): Promise<GuestWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,`
      + `surface_pressure,wind_speed_10m,wind_direction_10m,rain,precipitation,uv_index,`
      + `visibility,cloud_cover,is_day`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,`
      + `wind_speed_10m_max,uv_index_max,sunrise,sunset`
      + `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current;
    const daily = data.daily;
    if (!cur) return null;

    const windDirDeg = cur.wind_direction_10m ?? 0;
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const windDir = dirs[Math.round(windDirDeg / 22.5) % 16];

    return {
      location: name,
      current: {
        temp_c: cur.temperature_2m ?? 25,
        feels_like_c: cur.apparent_temperature ?? cur.temperature_2m ?? 25,
        humidity: cur.relative_humidity_2m ?? 50,
        wind_kph: Math.round((cur.wind_speed_10m ?? 0) * 3.6),
        wind_dir: windDir,
        condition: wmoToCondition(cur.weather_code ?? 0),
        pressure_mb: cur.surface_pressure ?? 1013,
        uv_index: cur.uv_index ?? 0,
        visibility_km: (cur.visibility ?? 10000) / 1000,
        cloud_coverage: cur.cloud_cover ?? 0,
        is_day: cur.is_day ?? 1,
        rain_mm: cur.rain ?? cur.precipitation ?? 0,
        localtime: data.current?.time || new Date().toISOString(),
        sunrise: daily?.sunrise?.[0] || '',
        sunset: daily?.sunset?.[0] || '',
      },
    };
  } catch {
    return null;
  }
}

export async function fetchGuestForecast(lat: number, lon: number): Promise<GuestForecast | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,`
      + `wind_speed_10m_max,uv_index_max,sunrise,sunset`
      + `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.daily;
    if (!d) return null;

    const days: GuestForecastDay[] = d.time.map((date: string, i: number) => ({
      date,
      condition: wmoToCondition(d.weather_code?.[i] ?? 0),
      max_temp_c: d.temperature_2m_max?.[i] ?? 0,
      min_temp_c: d.temperature_2m_min?.[i] ?? 0,
      rain_probability: d.precipitation_probability_max?.[i] ?? 0,
      max_wind_kph: Math.round((d.wind_speed_10m_max?.[i] ?? 0) * 3.6),
      uv_index: d.uv_index_max?.[i] ?? 0,
      humidity: 0,
      pressure_mb: 1013,
      visibility_km: 10,
      sunrise: d.sunrise?.[i] || '',
      sunset: d.sunset?.[i] || '',
    }));

    return { days };
  } catch {
    return null;
  }
}

export async function fetchGuestHourly(lat: number, lon: number): Promise<GuestHourly | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&hourly=temperature_2m,weather_code,precipitation_probability,relative_humidity_10m,`
      + `wind_speed_10m,is_day`
      + `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const h = data.hourly;
    if (!h) return null;

    const hours: GuestHour[] = h.time.slice(0, 168).map((time: string, i: number) => ({
      time,
      temp_c: h.temperature_2m?.[i] ?? 0,
      condition: wmoToCondition(h.weather_code?.[i] ?? 0),
      rain_probability: h.precipitation_probability?.[i] ?? 0,
      humidity: h.relative_humidity_10m?.[i] ?? 0,
      wind_kph: Math.round((h.wind_speed_10m?.[i] ?? 0) * 3.6),
      is_day: h.is_day?.[i] ?? 1,
    }));

    return { hours };
  } catch {
    return null;
  }
}
