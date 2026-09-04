/**
 * useWeatherAlarms — Client-side weather alarm engine
 * 
 * Fetches REAL weather data from Open-Meteo and evaluates 8 risk patterns:
 *   Cyclone, Flash Flood, Heatwave, Cold Wave, Severe Storm,
 *   High Wind, Heavy Rain, UV Danger
 *
 * Runs every 5 minutes. Zero backend/Supabase dependency.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WeatherAlarm {
  id: string;
  patternKey: string;
  patternName: string;
  patternIcon: string;
  severity: 'WATCH' | 'WARNING' | 'CRITICAL';
  riskScore: number;
  confidence: number;
  factors: string[];
  countdownMinutes: number;
  onsetTime: string | null;
  safetyGuidance: string;
  detectedAt: string;
}

export interface WeatherSnapshot {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  windGustKph: number;
  pressureMsl: number;
  weatherCode: number;
  rainMm: number;
  uvIndex: number;
  visibility: number;
  description: string;
}

// ─── Risk Pattern Definitions ──────────────────────────────────────────────

const RISK_PATTERNS: Record<string, {
  name: string;
  icon: string;
  detect: (current: WeatherSnapshot, forecast: any) => { riskScore: number; factors: string[]; countdown: number } | null;
  safety: string[];
}> = {
  cyclone: {
    name: 'Cyclone / Tropical Storm',
    icon: '🌀',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.windKph > 120) { score.value += 50; score.factors.push(`Extreme wind: ${c.windKph.toFixed(0)} km/h`); }
      else if (c.windKph > 90) { score.value += 35; score.factors.push(`Very high wind: ${c.windKph.toFixed(0)} km/h`); }
      else if (c.windKph > 60) { score.value += 15; score.factors.push(`Strong wind: ${c.windKph.toFixed(0)} km/h`); }
      if (c.pressureMsl < 980) { score.value += 40; score.factors.push(`Very low pressure: ${c.pressureMsl.toFixed(0)} hPa`); }
      else if (c.pressureMsl < 990) { score.value += 25; score.factors.push(`Low pressure: ${c.pressureMsl.toFixed(0)} hPa`); }
      else if (c.pressureMsl < 1000) { score.value += 10; score.factors.push(`Below-normal pressure: ${c.pressureMsl.toFixed(0)} hPa`); }
      if ([95, 96, 99].includes(c.weatherCode)) { score.value += 20; score.factors.push('Active thunderstorm conditions'); }
      if (score.value < 30) return null;
      const countdown = c.pressureMsl < 980 ? 15 : c.pressureMsl < 990 ? 30 : c.pressureMsl < 1000 ? 45 : 60;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown };
    },
    safety: [
      'Stay indoors away from windows',
      'Stock emergency supplies (water, food, flashlight)',
      'Follow local disaster management authority',
      'Avoid coastal areas and low-lying regions',
      'Keep phone charged for emergency communications',
    ],
  },

  flash_flood: {
    name: 'Flash Flood Risk',
    icon: '🌊',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.rainMm > 50) { score.value += 45; score.factors.push(`Extreme rainfall: ${c.rainMm.toFixed(1)}mm`); }
      else if (c.rainMm > 20) { score.value += 30; score.factors.push(`Heavy rainfall: ${c.rainMm.toFixed(1)}mm`); }
      else if (c.rainMm > 10) { score.value += 15; score.factors.push(`Moderate rainfall: ${c.rainMm.toFixed(1)}mm`); }
      if ([65, 67, 82].includes(c.weatherCode)) { score.value += 25; score.factors.push('Heavy/violent rain code active'); }
      else if ([63, 81].includes(c.weatherCode)) { score.value += 10; score.factors.push('Moderate rain code active'); }
      if (c.humidity > 95 && c.rainMm > 5) { score.value += 10; score.factors.push('Very high humidity with rain'); }
      if (score.value < 25) return null;
      const countdown = c.rainMm > 50 ? 20 : c.rainMm > 30 ? 45 : 90;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown };
    },
    safety: [
      'Move to higher ground immediately if in flood-prone area',
      'Do NOT walk or drive through flood water',
      'Disconnect electrical appliances if safe',
      'Keep emergency kit ready',
      'Monitor local flood warnings',
    ],
  },

  heatwave: {
    name: 'Extreme Heat / Heatwave',
    icon: '🔥',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.feelsLikeC >= 50) { score.value += 50; score.factors.push(`Extreme heat index: ${c.feelsLikeC.toFixed(0)}°C`); }
      else if (c.feelsLikeC >= 45) { score.value += 35; score.factors.push(`Very high heat index: ${c.feelsLikeC.toFixed(0)}°C`); }
      else if (c.tempC >= 42) { score.value += 30; score.factors.push(`Extreme temperature: ${c.tempC.toFixed(0)}°C`); }
      else if (c.tempC >= 38) { score.value += 15; score.factors.push(`High temperature: ${c.tempC.toFixed(0)}°C`); }
      if (c.uvIndex >= 10) { score.value += 10; score.factors.push(`Extreme UV index: ${c.uvIndex.toFixed(0)}`); }
      if (score.value < 15) return null;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown: 0 };
    },
    safety: [
      'Stay hydrated — drink water frequently',
      'Avoid outdoor activity during peak hours (11am–4pm)',
      'Use sunscreen and wear light clothing',
      'Check on elderly and vulnerable neighbors',
      'Know signs of heatstroke: dizziness, nausea, rapid heartbeat',
    ],
  },

  cold_wave: {
    name: 'Extreme Cold / Cold Wave',
    icon: '🥶',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.feelsLikeC <= -5) { score.value += 45; score.factors.push(`Extreme cold: feels like ${c.feelsLikeC.toFixed(0)}°C`); }
      else if (c.tempC <= 2) { score.value += 30; score.factors.push(`Near-freezing: ${c.tempC.toFixed(0)}°C`); }
      else if (c.tempC <= 5) { score.value += 15; score.factors.push(`Cold conditions: ${c.tempC.toFixed(0)}°C`); }
      if (score.value < 15) return null;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown: 0 };
    },
    safety: [
      'Layer clothing and keep extremities covered',
      'Use heating safely — avoid open flames indoors',
      'Watch for hypothermia signs: shivering, confusion',
      'Keep pipes from freezing',
      'Stock warm blankets and hot liquids',
    ],
  },

  severe_storm: {
    name: 'Severe Thunderstorm',
    icon: '⛈️',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.weatherCode === 99) { score.value += 50; score.factors.push('Extreme thunderstorm with heavy hail'); }
      else if (c.weatherCode === 96) { score.value += 35; score.factors.push('Thunderstorm with hail'); }
      else if (c.weatherCode === 95) { score.value += 25; score.factors.push('Active thunderstorm'); }
      if (c.windKph > 80) { score.value += 25; score.factors.push(`Dangerous wind: ${c.windKph.toFixed(0)} km/h`); }
      else if (c.windKph > 50) { score.value += 10; score.factors.push(`Strong wind: ${c.windKph.toFixed(0)} km/h`); }
      if (c.windGustKph > 100) { score.value += 10; score.factors.push(`Extreme gusts: ${c.windGustKph.toFixed(0)} km/h`); }
      if (score.value < 25) return null;
      const countdown = c.windKph > 80 ? 15 : c.windKph > 50 ? 30 : 45;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown };
    },
    safety: [
      'Stay indoors away from windows',
      'Unplug electronics to prevent surge damage',
      'Avoid using landline phones during lightning',
      'Do NOT shelter under trees',
      'Move vehicles away from trees if possible',
    ],
  },

  high_wind: {
    name: 'Dangerous Wind Conditions',
    icon: '💨',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.windKph > 100) { score.value += 50; score.factors.push(`Hurricane-force wind: ${c.windKph.toFixed(0)} km/h`); }
      else if (c.windKph > 80) { score.value += 35; score.factors.push(`Very dangerous wind: ${c.windKph.toFixed(0)} km/h`); }
      else if (c.windKph > 60) { score.value += 20; score.factors.push(`Strong wind: ${c.windKph.toFixed(0)} km/h`); }
      if (c.windGustKph > 120) { score.value += 15; score.factors.push(`Extreme gusts: ${c.windGustKph.toFixed(0)} km/h`); }
      if (score.value < 20) return null;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown: 0 };
    },
    safety: [
      'Secure loose outdoor objects',
      'Avoid driving high-profile vehicles',
      'Stay away from damaged buildings',
      'If driving, reduce speed and increase following distance',
      'Watch for flying debris',
    ],
  },

  heavy_rain: {
    name: 'Heavy / Prolonged Rainfall',
    icon: '🌧️',
    detect: (c) => {
      const score = { value: 0, factors: [] as string[] };
      if (c.rainMm > 30) { score.value += 40; score.factors.push(`Very heavy rain: ${c.rainMm.toFixed(1)}mm`); }
      else if (c.rainMm > 15) { score.value += 20; score.factors.push(`Heavy rain: ${c.rainMm.toFixed(1)}mm`); }
      if ([65, 67, 82].includes(c.weatherCode)) { score.value += 15; score.factors.push('Heavy rain weather code active'); }
      else if ([61, 63].includes(c.weatherCode) && c.rainMm > 10) { score.value += 10; score.factors.push('Persistent rain detected'); }
      if (score.value < 20) return null;
      const countdown = c.rainMm > 30 ? 30 : c.rainMm > 15 ? 60 : 120;
      return { riskScore: Math.min(score.value, 100), factors: score.factors, countdown };
    },
    safety: [
      'Avoid low-lying areas prone to waterlogging',
      'Do not drive through waterlogged roads',
      'Keep drains clear near your home',
      'Monitor water levels if near rivers',
      'Carry umbrella and waterproof gear',
    ],
  },

  uv_danger: {
    name: 'Dangerous UV Exposure',
    icon: '☀️',
    detect: (c) => {
      if (c.uvIndex < 8) return null;
      const score = { value: 0, factors: [] as string[] };
      if (c.uvIndex >= 11) { score.value = 50; score.factors.push(`Extreme UV index: ${c.uvIndex.toFixed(0)}`); }
      else if (c.uvIndex >= 9) { score.value = 35; score.factors.push(`Very high UV index: ${c.uvIndex.toFixed(0)}`); }
      else if (c.uvIndex >= 8) { score.value = 20; score.factors.push(`High UV index: ${c.uvIndex.toFixed(0)}`); }
      return { riskScore: score.value, factors: score.factors, countdown: 0 };
    },
    safety: [
      'Apply SPF 50+ sunscreen every 2 hours',
      'Wear protective clothing and sunglasses',
      'Stay in shade during 10am–4pm',
      'Drink extra water to prevent dehydration',
      'Seek medical help if sunburn is severe',
    ],
  },
};

// ─── Severity Classification ───────────────────────────────────────────────

function classifySeverity(score: number): 'WATCH' | 'WARNING' | 'CRITICAL' {
  if (score >= 60) return 'CRITICAL';
  if (score >= 35) return 'WARNING';
  return 'WATCH';
}

// ─── Fetch Weather from Open-Meteo (directly, no backend) ──────────────────

async function fetchWeather(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,`
      + `surface_pressure,wind_speed_10m,wind_gusts_10m,rain,precipitation,uv_index,visibility`
      + `&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current;
    if (!cur) return null;

    // Map WMO weather code to description
    const wmoDescriptions: Record<number, string> = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Freezing rain', 67: 'Heavy freezing rain',
      71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Light showers', 81: 'Moderate showers', 82: 'Violent showers',
      85: 'Light snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm',
    };

    return {
      tempC: cur.temperature_2m ?? 25,
      feelsLikeC: cur.apparent_temperature ?? cur.temperature_2m ?? 25,
      humidity: cur.relative_humidity_2m ?? 50,
      windKph: (cur.wind_speed_10m ?? 0) * 3.6, // m/s → km/h
      windGustKph: (cur.wind_gusts_10m ?? 0) * 3.6,
      pressureMsl: cur.surface_pressure ?? 1013,
      weatherCode: cur.weather_code ?? 0,
      rainMm: cur.rain ?? cur.precipitation ?? 0,
      uvIndex: cur.uv_index ?? 0,
      visibility: cur.visibility ?? 10000,
      description: wmoDescriptions[cur.weather_code] ?? 'Unknown',
    };
  } catch {
    return null;
  }
}

// ─── The Hook ──────────────────────────────────────────────────────────────

export function useWeatherAlarms(
  lat: number | null,
  lon: number | null,
  locationName: string
) {
  const [alarms, setAlarms] = useState<WeatherAlarm[]>([]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [criticalAlarm, setCriticalAlarm] = useState<WeatherAlarm | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const evaluate = useCallback(async () => {
    if (lat == null || lon == null) {
      setLoading(false);
      return;
    }

    try {
      const snapshot = await fetchWeather(lat, lon);
      if (!snapshot) return;
      setWeather(snapshot);

      const detected: WeatherAlarm[] = [];

      for (const [key, pattern] of Object.entries(RISK_PATTERNS)) {
        const result = pattern.detect(snapshot, {});
        if (!result) continue;

        const severity = classifySeverity(result.riskScore);

        // Only show WARNING and CRITICAL (skip WATCH to reduce noise)
        if (severity === 'WATCH') continue;

        const id = `${key}-${severity}-${new Date().toISOString().slice(0, 13)}`;

        // Deduplicate — don't re-alert for same pattern+hour
        if (seenIdsRef.current.has(id)) continue;
        seenIdsRef.current.add(id);

        const onsetTime = result.countdown > 0
          ? new Date(Date.now() + result.countdown * 60000).toISOString()
          : null;

        const alarm: WeatherAlarm = {
          id,
          patternKey: key,
          patternName: pattern.name,
          patternIcon: pattern.icon,
          severity,
          riskScore: result.riskScore,
          confidence: Math.min(65 + Math.floor(result.riskScore / 4), 92),
          factors: result.factors,
          countdownMinutes: result.countdown,
          onsetTime,
          safetyGuidance: pattern.safety.join('\n'),
          detectedAt: new Date().toISOString(),
        };

        detected.push(alarm);

        // Trigger full-screen overlay for CRITICAL
        if (severity === 'CRITICAL') {
          setCriticalAlarm(alarm);
        }
      }

      if (detected.length > 0) {
        setAlarms((prev) => [...detected, ...prev]);
      }

      setLastChecked(new Date());
    } catch (err) {
      console.error('Weather alarm evaluation failed:', err);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, locationName]);

  // Initial evaluation + periodic refresh every 5 minutes
  useEffect(() => {
    evaluate();
    const interval = setInterval(evaluate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [evaluate]);

  const dismissCritical = useCallback(() => {
    setCriticalAlarm(null);
  }, []);

  const acknowledgeAlarm = useCallback((id: string) => {
    setAlarms((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, severity: 'WATCH' as const } : a
      )
    );
  }, []);

  return {
    alarms,
    weather,
    loading,
    lastChecked,
    criticalAlarm,
    dismissCritical,
    acknowledgeAlarm,
    recheck: evaluate,
  };
}
