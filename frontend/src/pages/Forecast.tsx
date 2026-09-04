import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import { fetchGuestForecast, fetchGuestHourly } from '../api/guestWeather';
import Glass from '../components/Glass';
import WeatherIcon, { getIconBgColor } from '../components/WeatherIcon';
import { Wind, Droplet, ChevronLeft, Sun, Sunrise, Sunset, Eye, Gauge } from 'lucide-react';

/** Map condition text to approximate WMO code */
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
    const timePart = isoStr.includes('T') ? isoStr.split('T')[1] : isoStr.split(' ')[1];
    if (!timePart) return isoStr;
    const [h, m] = timePart.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return isoStr; }
}

function _formatDate(dateStr: string, i: number): string {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  try {
    return new Date(dateStr).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function _fullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

/** Get date string (YYYY-MM-DD) from a time string */
function _dateFromTime(time: string): string {
  if (!time) return '';
  // Handle both 'YYYY-MM-DDTHH:MM' and 'YYYY-MM-DD HH:MM' formats
  const t = time.trim();
  if (t.includes('T')) return t.split('T')[0];
  if (t.includes(' ')) return t.split(' ')[0];
  return t;
}

/** Normalize a date to YYYY-MM-DD for comparison */
function _normalizeDate(d: string): string {
  if (!d) return '';
  const s = d.trim();
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
}

export default function Forecast() {
  const { activeId } = useLoc();
  const [daily, setDaily] = useState<any>(null);
  const [hourly, setHourly] = useState<any>(null);
  const [tab, setTab] = useState<'daily' | 'hourly'>('daily');
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { locations } = useLoc();

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    setSelectedDay(null);

    const loc = locations.find((l) => (l.location_id || l.id) === activeId);
    const isGuest = activeId.startsWith('guest_') || !!loc;

    if (isGuest && loc) {
      Promise.all([
        fetchGuestForecast(loc.latitude, loc.longitude),
        fetchGuestHourly(loc.latitude, loc.longitude),
      ]).then(([d, h]) => {
        setDaily(d ? { days: d.days } : null);
        setHourly(h ? { hours: h.hours } : null);
      }).finally(() => setLoading(false));
    } else {
      Promise.all([
        api.forecast(activeId, 'daily').catch(() => null),
        api.forecast(activeId, 'hourly').catch(() => null),
      ]).then(([d, h]) => { setDaily(d); setHourly(h); })
        .finally(() => setLoading(false));
    }
  }, [activeId]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!activeId) {
    return <div className="flex items-center justify-center h-full text-ice-400 text-sm">Add a location to see forecasts</div>;
  }

  const days = daily?.days || [];
  const hours = hourly?.hours || [];

  // Filter hourly data for selected day
  const selectedDayData = selectedDay != null ? days[selectedDay] : null;
  const selectedDate = selectedDayData ? _normalizeDate(selectedDayData.date) : '';
  const dayHours = selectedDate
    ? hours.filter((h: any) => _dateFromTime(h.time) === selectedDate)
    : [];

  // ── Day detail view ──────────────────────────────────────────────────────
  if (selectedDay != null && selectedDayData) {
    const dayCode = _getWeatherCode(selectedDayData.condition);
    return (
      <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Back button + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedDay(null)}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <ChevronLeft size={18} className="text-ice-300" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-ice-50">{_formatDate(selectedDayData.date, selectedDay)}</h1>
            <p className="text-xs text-ice-400">{_fullDate(selectedDayData.date)}</p>
          </div>
        </div>

        {/* Day summary card */}
        <Glass className="p-4 sm:p-5 relative overflow-hidden">
          <div className="glass-sheen" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${getIconBgColor(dayCode, selectedDayData.condition)} flex items-center justify-center`}>
                <WeatherIcon code={dayCode} condition={selectedDayData.condition} isDay={true} size={48} animated />
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-bold text-ice-50">
                  {Math.round(selectedDayData.max_temp_c)}° / {Math.round(selectedDayData.min_temp_c)}°
                </div>
                <div className="text-sm text-ice-300 mt-0.5">{selectedDayData.condition}</div>
              </div>
            </div>
          </div>

          {/* Day stats grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
            {[
              { icon: <Wind size={14} />, label: 'Wind', value: `${Math.round(selectedDayData.max_wind_kph)} km/h`, color: 'text-cyan-400' },
              { icon: <Droplet size={14} />, label: 'Rain', value: `${selectedDayData.rain_probability}%`, color: 'text-blue-400' },
              { icon: <Sun size={14} />, label: 'UV', value: `${selectedDayData.uv_index ?? '--'}`, color: 'text-amber-400' },
              { icon: <Gauge size={14} />, label: 'Pressure', value: `${selectedDayData.pressure_mb ?? '--'} mb`, color: 'text-purple-400' },
              { icon: <Eye size={14} />, label: 'Visibility', value: `${selectedDayData.visibility_km ?? '--'} km`, color: 'text-teal-400' },
              { icon: <Droplet size={14} />, label: 'Humidity', value: `${selectedDayData.humidity ?? '--'}%`, color: 'text-blue-400' },
            ].map((s) => (
              <div key={s.label} className="glass-inset rounded-xl p-2.5 text-center">
                <div className={`${s.color} flex justify-center mb-1`}>{s.icon}</div>
                <div className="text-[10px] text-ice-400 uppercase">{s.label}</div>
                <div className="text-xs font-semibold text-ice-100 mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Sunrise / Sunset */}
          {(selectedDayData.sunrise || selectedDayData.sunset) && (
            <div className="flex gap-3 mt-3">
              {selectedDayData.sunrise && (
                <div className="flex items-center gap-2 text-xs text-ice-400">
                  <Sunrise size={14} className="text-amber-400" />
                  <span>Sunrise {_formatTime(selectedDayData.sunrise)}</span>
                </div>
              )}
              {selectedDayData.sunset && (
                <div className="flex items-center gap-2 text-xs text-ice-400">
                  <Sunset size={14} className="text-indigo-400" />
                  <span>Sunset {_formatTime(selectedDayData.sunset)}</span>
                </div>
              )}
            </div>
          )}
        </Glass>

        {/* Hourly breakdown for this day */}
        <div>
          <h2 className="text-xs font-semibold text-ice-400 uppercase tracking-wider mb-3 px-1">
            Hourly Forecast — {_formatDate(selectedDayData.date, selectedDay)}
          </h2>
          {dayHours.length > 0 ? (
            <div className="space-y-1.5">
              {dayHours.map((h: any, i: number) => {
                const hourCode = _getWeatherCode(h.condition);
                const hour = h.time?.includes('T') ? parseInt(h.time.split('T')[1]) : parseInt(h.time?.split(' ')[1] || '0');
                const isNight = hour < 6 || hour >= 19;
                return (
                  <Glass key={i} className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                    <div className={`w-8 h-8 rounded-lg ${getIconBgColor(hourCode, h.condition)} flex items-center justify-center flex-shrink-0`}>
                      <WeatherIcon code={hourCode} condition={h.condition} isDay={!isNight} size={22} static />
                    </div>
                    <div className="text-xs text-ice-400 w-16 sm:w-20 flex-shrink-0 font-medium">
                      {_formatTime(h.time)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ice-50">{h.temp_c != null ? Math.round(h.temp_c) : '--'}°C</div>
                      <div className="text-[10px] sm:text-xs text-ice-600 truncate">{h.condition}</div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      <div className="text-xs text-accent-400">💧 {h.rain_probability}%</div>
                      {h.humidity != null && (
                        <div className="text-[10px] text-ice-500 hidden sm:flex items-center gap-0.5">
                          <Droplet size={10} /> {h.humidity}%
                        </div>
                      )}
                      {h.wind_kph != null && (
                        <div className="text-[10px] text-ice-500 hidden md:flex items-center gap-0.5">
                          <Wind size={10} /> {Math.round(h.wind_kph)}
                        </div>
                      )}
                    </div>
                  </Glass>
                );
              })}
            </div>
          ) : (
            <Glass className="p-6 text-center" inset>
              <p className="text-sm text-ice-400">No hourly data available for this day</p>
            </Glass>
          )}
        </div>
      </div>
    );
  }

  // ── Default view (7-day or hourly list) ──────────────────────────────────
  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-ice-50">Weather Forecast</h1>

      <div className="flex gap-2">
        {([['daily', '7-Day'], ['hourly', 'Hourly']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSelectedDay(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'text-ice-400 hover:bg-white/5'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'daily' ? (
        <div className="space-y-2 sm:space-y-3">
          {days.map((d: any, i: number) => {
            const dayCode = _getWeatherCode(d.condition);
            return (
              <Glass
                key={i}
                className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4 cursor-pointer hover:bg-white/[0.04] transition-all active:scale-[0.98]"
                onClick={() => setSelectedDay(i)}
              >
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${getIconBgColor(dayCode, d.condition)} flex items-center justify-center flex-shrink-0`}>
                  <WeatherIcon code={dayCode} condition={d.condition} isDay={true} size={28} static />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ice-50 truncate">
                    {_formatDate(d.date, i)}
                  </div>
                  <div className="text-xs text-ice-400 truncate">{d.condition}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-base sm:text-lg font-bold text-ice-50">
                    {d.max_temp_c != null ? Math.round(d.max_temp_c) : '--'}° / {d.min_temp_c != null ? Math.round(d.min_temp_c) : '--'}°
                  </div>
                  <div className="text-xs text-accent-400">💧 {d.rain_probability}%</div>
                </div>
                <div className="text-right text-xs text-ice-400 hidden md:block space-y-0.5 flex-shrink-0 min-w-[80px]">
                  <div className="flex items-center gap-1 justify-end"><Wind size={12} className="text-cyan-400" /> {Math.round(d.max_wind_kph)} km/h</div>
                </div>
              </Glass>
            );
          })}
          {daily?.confidence_note && (
            <div className="text-xs text-severity-warning bg-severity-warning/10 px-4 py-2 rounded-xl">{daily.confidence_note}</div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 sm:space-y-2">
          {hours.slice(0, 48).map((h: any, i: number) => {
            const hourCode = _getWeatherCode(h.condition);
            return (
              <Glass key={i} className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                <div className={`w-8 h-8 rounded-lg ${getIconBgColor(hourCode, h.condition)} flex items-center justify-center flex-shrink-0`}>
                  <WeatherIcon code={hourCode} condition={h.condition} isDay={h.is_day !== 0} size={22} static />
                </div>
                <div className="text-xs text-ice-400 w-16 sm:w-20 flex-shrink-0">
                  {_formatTime(h.time)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ice-50">{h.temp_c != null ? Math.round(h.temp_c) : '--'}°C</div>
                  <div className="text-[10px] sm:text-xs text-ice-600 truncate">{h.condition}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-xs text-accent-400">💧 {h.rain_probability}%</div>
                  {h.humidity != null && (
                    <div className="text-[10px] text-ice-500 hidden sm:flex items-center gap-0.5">
                      <Droplet size={10} /> {h.humidity}%
                    </div>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}
