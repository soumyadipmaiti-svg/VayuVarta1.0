import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import { fetchGuestWeather, fetchGuestForecast } from '../api/guestWeather';
import Glass from '../components/Glass';
import WeatherIcon, { getIconBgColor } from '../components/WeatherIcon';
import {
  MapPin, Thermometer, Droplets, Wind, Sun, Eye, Gauge, Cloud, AlertTriangle, Satellite,
} from 'lucide-react';

function _getWeatherCode(condition?: string | null): number | null {
  if (!condition) return null;
  const c = condition.toLowerCase();
  if (c.includes('thunder') && (c.includes('hail') || c.includes('heavy'))) return 99;
  if (c.includes('thunder')) return 95;
  if (c.includes('heavy snow') || c.includes('blizzard')) return 75;
  if (c.includes('snow') || c.includes('flurr')) return 73;
  if (c.includes('freezing rain') || c.includes('freezing drizzle')) return 66;
  if (c.includes('heavy rain') || c.includes('violent')) return 82;
  if (c.includes('rain') || c.includes('shower')) return 63;
  if (c.includes('heavy drizzle') || c.includes('dense drizzle')) return 55;
  if (c.includes('drizzle')) return 51;
  if (c.includes('overcast')) return 3;
  if (c.includes('partly cloudy') || c.includes('partly')) return 2;
  if (c.includes('mainly clear') || c.includes('mostly clear')) return 1;
  if (c.includes('clear') || c.includes('sunny')) return 0;
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 45;
  return null;
}

function _formatTime(isoStr?: string): string {
  if (!isoStr) return '--';
  try {
    const time = isoStr.includes('T') ? isoStr.split('T')[1] : isoStr;
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
  } catch { return isoStr; }
}

export default function Dashboard() {
  const { activeId, locations } = useLoc();
  const [weather, setWeather] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);

    // Check if this is a guest location (starts with 'guest_')
    const loc = locations.find((l) => (l.location_id || l.id) === activeId);
    const isGuest = activeId.startsWith('guest_') || !!loc;

    if (isGuest && loc) {
      // Fetch directly from Open-Meteo (no backend needed)
      Promise.all([
        fetchGuestWeather(loc.latitude, loc.longitude, loc.name),
        fetchGuestForecast(loc.latitude, loc.longitude),
      ]).then(([w, f]) => { setWeather(w); setForecast(f); })
        .finally(() => setLoading(false));
    } else {
      // Logged in: fetch from backend
      Promise.all([
        api.weather(activeId).catch(() => null),
        api.forecast(activeId, 'daily').catch(() => null),
      ]).then(([w, f]) => { setWeather(w); setForecast(f); })
        .finally(() => setLoading(false));
    }
  }, [activeId, locations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!weather && !forecast) {
    return (
      <div className="page-enter flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
          <WeatherIcon condition="cloudy" size={48} animated />
        </div>
        <h2 className="text-xl font-semibold text-ice-50 mb-2">No Weather Data</h2>
        <p className="text-sm text-ice-400 max-w-sm">
          Allow location access or add a location to see weather data.
        </p>
      </div>
    );
  }

  const cur = weather?.current || weather;
  const days = forecast?.days || [];
  const locName = weather?.location || 'Unknown';
  const isDay = cur?.is_day ?? true;
  const weatherCode = _getWeatherCode(cur?.condition);

  // Check if this is a GPS-detected location
  const activeLoc = locations.find((l) => (l.location_id || l.id) === activeId);
  const isGPSLocation = activeLoc?.label === 'Current Location';

  const metrics = [
    { label: 'Feels Like', value: `${cur?.feels_like_c != null ? Math.round(cur.feels_like_c) : '--'}°C`, icon: Thermometer, accent: 'text-orange-400 bg-orange-500/10' },
    { label: 'Humidity', value: `${cur?.humidity ?? '--'}%`, icon: Droplets, accent: 'text-blue-400 bg-blue-500/10' },
    { label: 'Wind', value: `${cur?.wind_kph != null ? Math.round(cur.wind_kph) : '--'} km/h ${cur?.wind_dir || ''}`, icon: Wind, accent: 'text-cyan-400 bg-cyan-500/10' },
    { label: 'UV Index', value: `${cur?.uv_index ?? '--'}`, icon: Sun, accent: 'text-amber-400 bg-amber-500/10' },
    { label: 'Pressure', value: `${cur?.pressure_mb != null ? Math.round(cur.pressure_mb) : '--'} mb`, icon: Gauge, accent: 'text-purple-400 bg-purple-500/10' },
    { label: 'Visibility', value: `${cur?.visibility_km ?? '--'} km`, icon: Eye, accent: 'text-teal-400 bg-teal-500/10' },
    { label: 'Cloud Cover', value: `${cur?.cloud_coverage ?? '--'}%`, icon: Cloud, accent: 'text-ice-300 bg-white/5' },
    { label: 'Rain Prob', value: `${days[0]?.rain_probability ?? '--'}%`, icon: Droplets, accent: 'text-blue-400 bg-blue-500/10' },
  ];

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
      {weather?.data_warning && (
        <Glass className="p-3 flex items-center gap-3 text-sm text-severity-warning">
          <AlertTriangle size={18} /> <span>{weather.data_warning}</span>
        </Glass>
      )}

      {/* Hero Card — Current Weather */}
      <Glass className="p-5 sm:p-8 relative overflow-hidden">
        <div className="glass-sheen" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-ice-400 text-sm mb-3 flex-wrap">
              <MapPin size={16} className="flex-shrink-0" />
              <span className="truncate">{locName}</span>
              {isGPSLocation && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium flex-shrink-0">
                  <Satellite size={10} /> GPS
                </span>
              )}
              {cur?.localtime && (
                <span className="text-ice-600 flex-shrink-0">
                  · {cur.localtime?.split('T')[1] || cur.localtime}
                </span>
              )}
            </div>
            <div className="flex items-end gap-4 sm:gap-6">
              <span className="text-6xl sm:text-7xl font-bold tracking-tighter bg-gradient-to-br from-ice-50 to-accent-400 bg-clip-text text-transparent">
                {cur?.temp_c != null ? Math.round(cur.temp_c) : '--'}°
              </span>
              <div className="pb-2 sm:pb-3">
                <div className="text-base sm:text-lg font-medium text-ice-200">{cur?.condition ?? 'N/A'}</div>
                <div className="text-xs sm:text-sm text-ice-400">
                  H:{days[0]?.max_temp_c != null ? Math.round(days[0].max_temp_c) : '--'}° L:{days[0]?.min_temp_c != null ? Math.round(days[0].min_temp_c) : '--'}°
                </div>
                {cur?.feels_like_c != null && (
                  <div className="text-xs text-ice-500 mt-0.5">Feels like {Math.round(cur.feels_like_c)}°C</div>
                )}
              </div>
            </div>
          </div>

          <div className={`w-20 h-20 sm:w-28 sm:h-28 rounded-3xl ${getIconBgColor(weatherCode, cur?.condition)} flex items-center justify-center flex-shrink-0`}>
            <WeatherIcon
              code={weatherCode}
              condition={cur?.condition}
              isDay={isDay}
              size={64}
              className="sm:w-[80px] sm:h-[80px]"
              animated
            />
          </div>
        </div>
      </Glass>

      {/* 7-Day Forecast */}
      {days.length > 0 && (
        <Glass className="p-4">
          <div className="text-xs font-semibold text-ice-400 uppercase tracking-wider mb-3 px-1">7-Day Forecast</div>
          <div className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-1">
            {days.map((d: any, i: number) => {
              const dayCode = _getWeatherCode(d.condition);
              return (
                <div key={i} className="flex-shrink-0 glass-inset rounded-xl p-3 min-w-[90px] sm:min-w-[100px] text-center">
                  <div className="text-[11px] text-ice-400 font-medium mb-1">
                    {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d.date).toLocaleDateString('en', { weekday: 'short' })}
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${getIconBgColor(dayCode, d.condition)} flex items-center justify-center mx-auto my-1`}>
                    <WeatherIcon code={dayCode} condition={d.condition} isDay={true} size={26} static />
                  </div>
                  <div className="text-sm font-semibold text-ice-50">{d.max_temp_c != null ? Math.round(d.max_temp_c) : '--'}°</div>
                  <div className="text-[11px] text-ice-600">{d.min_temp_c != null ? Math.round(d.min_temp_c) : '--'}°</div>
                  <div className="text-[10px] text-accent-400 mt-1">💧 {d.rain_probability}%</div>
                </div>
              );
            })}
          </div>
        </Glass>
      )}

      {/* Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <Glass key={i} className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg ${m.accent.split(' ')[1]} flex items-center justify-center`}>
                <m.icon size={14} className={m.accent.split(' ')[0]} />
              </div>
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-ice-400">{m.label}</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-ice-50">{m.value}</div>
          </Glass>
        ))}
      </div>

      {/* Sunrise / Sunset */}
      {(cur?.sunrise || cur?.sunset) && (
        <div className="grid grid-cols-2 gap-3">
          <Glass className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <img src="https://cdn.meteocons.com/3.0.0-next.10/svg/fill/sunrise.svg" alt="Sunrise" width={28} height={28} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <div className="text-[11px] text-ice-400 uppercase tracking-wider">Sunrise</div>
              <div className="text-lg font-semibold text-ice-50">{_formatTime(cur.sunrise)}</div>
            </div>
          </Glass>
          <Glass className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <img src="https://cdn.meteocons.com/3.0.0-next.10/svg/fill/sunset.svg" alt="Sunset" width={28} height={28} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <div className="text-[11px] text-ice-400 uppercase tracking-wider">Sunset</div>
              <div className="text-lg font-semibold text-ice-50">{_formatTime(cur.sunset)}</div>
            </div>
          </Glass>
        </div>
      )}

      <div className="text-center text-[11px] text-ice-600 pb-4">
        Source: Open-Meteo · Free weather data · Cached up to 10 minutes
      </div>
    </div>
  );
}
