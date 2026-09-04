import { useState, useEffect } from 'react';
import LottieIcon from './LottieIcon';

const CDN_SVG = 'https://cdn.meteocons.com/3.0.0-next.10/svg/fill';

interface WeatherIconProps {
  /** WMO weather interpretation code */
  code?: number | null;
  /** Fallback condition text from API */
  condition?: string | null;
  /** Day or night — used for icon variant selection */
  isDay?: boolean;
  /** Icon size in pixels */
  size?: number;
  className?: string;
  /** Use Lottie animation (best for large hero icons ≥48px) */
  animated?: boolean;
  /** Show a static SVG instead of Lottie (good for small forecast rows) */
  static?: boolean;
}

/* ──────────────────────────────────────────────
   WMO code → Meteocons slug mapping
   Verified against https://cdn.meteocons.com/3.0.0-next.10/
   ────────────────────────────────────────────── */
function wmoToSlug(code: number, isDay: boolean): string {
  switch (code) {
    case 0: return isDay ? 'clear-day' : 'clear-night';
    case 1: return isDay ? 'mostly-clear-day' : 'mostly-clear-night';
    case 2: return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
    case 3: return 'overcast';
    // Fog
    case 45: return 'fog';
    case 48: return 'fog';
    // Drizzle
    case 51: return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';  // light drizzle → partly cloudy
    case 53: return 'drizzle';
    case 55: return 'drizzle';
    case 56: return 'drizzle';  // freezing drizzle → drizzle
    case 57: return 'drizzle';
    // Rain
    case 61: return 'rain';       // slight rain
    case 63: return 'rain';       // moderate rain
    case 65: return 'extreme-rain'; // heavy rain
    case 66: return 'rain';       // freezing rain slight
    case 67: return 'extreme-rain'; // freezing rain heavy
    // Snow
    case 71: return 'snow';       // slight snowfall
    case 73: return 'snow';       // moderate snowfall
    case 75: return 'snow';       // heavy snowfall
    case 77: return 'snow';       // snow grains
    // Rain showers
    case 80: return 'rain';       // slight rain showers
    case 81: return 'rain';       // moderate rain showers
    case 82: return 'extreme-rain'; // violent rain showers
    // Snow showers
    case 85: return 'snow';
    case 86: return 'snow';
    // Thunderstorms
    case 95: return 'thunderstorms-day';      // thunderstorm slight
    case 96: return 'thunderstorms-day-rain';  // thunderstorm with hail
    case 99: return 'thunderstorms-extreme-day'; // thunderstorm with heavy hail
    default: return 'overcast';
  }
}

/* ──────────────────────────────────────────────
   Condition text → Meteocons slug (fallback)
   ────────────────────────────────────────────── */
function conditionToSlug(condition: string, isDay: boolean): string {
  const c = condition.toLowerCase();

  // Severe storms first
  if (c.includes('thunder') && (c.includes('hail') || c.includes('extreme') || c.includes('severe')))
    return 'thunderstorms-extreme-day';
  if (c.includes('thunder') && c.includes('rain'))
    return 'thunderstorms-day-rain';
  if (c.includes('thunder'))
    return isDay ? 'thunderstorms-day' : 'thunderstorms-night';

  // Tornado
  if (c.includes('tornado') || c.includes('cyclone')) return 'tornado';

  // Extreme rain
  if (c.includes('heavy rain') || c.includes('violent') || c.includes('extreme rain'))
    return 'extreme-rain';

  // Snow
  if (c.includes('blizzard') || c.includes('heavy snow')) return 'snow';
  if (c.includes('snow') || c.includes('flurr') || c.includes('sleet')) return 'snow';

  // Rain
  if (c.includes('freezing rain')) return 'rain';
  if (c.includes('shower')) return 'rain';
  if (c.includes('rain')) return 'rain';

  // Drizzle
  if (c.includes('drizzle')) return 'drizzle';

  // Fog / mist / haze
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 'fog';

  // Wind
  if (c.includes('wind')) return 'wind';

  // Cloud cover
  if (c.includes('overcast')) return 'overcast';
  if (c.includes('partly cloudy') || c.includes('partly'))
    return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (c.includes('mostly cloudy') || c.includes('mainly cloudy'))
    return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (c.includes('mostly clear') || c.includes('mainly clear'))
    return isDay ? 'mostly-clear-day' : 'mostly-clear-night';
  if (c.includes('cloudy'))
    return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';

  // Clear
  if (c.includes('clear') || c.includes('sunny'))
    return isDay ? 'clear-day' : 'clear-night';

  // Alerts
  if (c.includes('heat') || c.includes('hot')) return 'fire-alert';
  if (c.includes('cold') || c.includes('freeze') || c.includes('frost')) return 'snow';

  return 'overcast';
}

/**
 * Resolves the Meteocons slug from WMO code or condition text.
 */
function resolveSlug(
  code: number | null | undefined,
  condition: string | null | undefined,
  isDay: boolean,
): string {
  if (code != null) return wmoToSlug(code, isDay);
  if (condition) return conditionToSlug(condition, isDay);
  return 'overcast';
}

/**
 * Get a background color class for the icon container based on weather.
 */
export function getIconBgColor(code: number | null | undefined, condition?: string | null): string {
  const c = (condition || '').toLowerCase();
  const n = code ?? -1;

  if (n === 95 || n === 96 || n === 99 || c.includes('thunder')) return 'bg-violet-500/15';
  if (n === 0 || n === 1 || c.includes('clear') || c.includes('sunny')) return 'bg-amber-500/10';
  if ([61, 63, 65, 80, 81, 82].includes(n) || c.includes('rain') || c.includes('shower')) return 'bg-blue-500/15';
  if ([51, 53, 55].includes(n) || c.includes('drizzle')) return 'bg-cyan-500/10';
  if ([71, 73, 75, 85, 86].includes(n) || c.includes('snow')) return 'bg-sky-400/10';
  if (n === 45 || n === 48 || c.includes('fog') || c.includes('mist')) return 'bg-slate-400/10';
  if (c.includes('wind')) return 'bg-cyan-400/10';
  if (c.includes('cold') || c.includes('frost')) return 'bg-cyan-300/10';
  return 'bg-white/5';
}

/**
 * Get alert type from condition text (if it's an alert, not weather).
 */
export function getAlertSlug(condition: string | null | undefined): string | null {
  if (!condition) return null;
  const c = condition.toLowerCase();
  if (c.includes('cyclone') || c.includes('typhoon') || c.includes('hurricane')) return 'cyclone-alert';
  if (c.includes('heat') || c.includes('fire') || c.includes('extreme hot')) return 'fire-alert';
  if (c.includes('alert') || c.includes('warning') || c.includes('advisory')) return 'weather-alert';
  return null;
}

/**
 * Main WeatherIcon component.
 *
 * - Size ≥ 48px + animated → Lottie animation from CDN
 * - Size < 48px or static → Static SVG from CDN
 * - Fallback → condition text badge
 */
export default function WeatherIcon({
  code,
  condition,
  isDay = true,
  size = 24,
  className = '',
  animated = false,
  static: isStatic = false,
}: WeatherIconProps) {
  const [svgError, setSvgError] = useState(false);

  const slug = resolveSlug(code, condition, isDay);
  const useLottie = animated && size >= 48 && !isStatic;

  // Reset error state when slug changes
  useEffect(() => {
    setSvgError(false);
  }, [slug]);

  // Fallback if SVG fails
  if (svgError) {
    return (
      <span
        className={`inline-flex items-center justify-center text-ice-400 font-medium ${className}`}
        style={{ fontSize: Math.max(10, size * 0.45) }}
      >
        {condition || '—'}
      </span>
    );
  }

  // Lottie animation for large icons
  if (useLottie) {
    return (
      <div className={`${className}`} style={{ width: size, height: size }}>
        <LottieIcon slug={slug} size={size} speed={0.6} />
      </div>
    );
  }

  // Static SVG from CDN for small icons
  const svgUrl = `${CDN_SVG}/${slug}.svg`;
  return (
    <img
      src={svgUrl}
      alt={condition || 'weather'}
      width={size}
      height={size}
      className={`select-none pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))',
      }}
      onError={() => setSvgError(true)}
      draggable={false}
    />
  );
}
