import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import Glass from '../components/Glass';
import { TrendingUp } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Climate() {
  const { activeId } = useLoc();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.historical(activeId, month).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [activeId, month]);

  if (!activeId && !loading) {
    return (
      <div className="page-enter h-full overflow-y-auto no-scrollbar p-6 space-y-6">
        <h1 className="text-2xl font-bold text-ice-50">Climate Intelligence</h1>
        <Glass className="p-8 text-center" inset>
          <p className="text-sm text-ice-400">Add a location to view climate data</p>
        </Glass>
      </div>
    );
  }

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-6 space-y-6">
      <h1 className="text-2xl font-bold text-ice-50">Climate Intelligence</h1>

      <div className="flex gap-2 flex-wrap">
        {MONTHS.map((m, i) => (
          <button key={i} onClick={() => setMonth(i + 1)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              month === i + 1 ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'text-ice-400 hover:bg-white/5'
            }`}>{m.slice(0, 3)}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <Glass className="p-6 relative overflow-hidden">
          <div className="glass-sheen" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-ice-400 mb-1">
              <TrendingUp size={16} />
              <span className="text-xs uppercase tracking-wider font-semibold">Climate Averages · {MONTHS[month - 1]}</span>
            </div>
            <div className="text-sm text-accent-400 mb-4">Historical monthly averages — not a forecast</div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] text-ice-400 uppercase tracking-wider mb-1">Avg Temperature</div>
                <div className="text-4xl font-bold text-ice-50">{data.avg_temp}<span className="text-lg">°C</span></div>
              </div>
              <div>
                <div className="text-[11px] text-ice-400 uppercase tracking-wider mb-1">Avg Rainfall</div>
                <div className="text-4xl font-bold text-ice-50">{data.avg_rainfall}<span className="text-lg"> mm</span></div>
              </div>
            </div>
          </div>
        </Glass>
      ) : (
        <Glass className="p-8 text-center" inset>
          <p className="text-sm text-ice-400">
            No climate data for this location. Run <code className="text-accent-400">python seed_climate.py</code> in the backend to seed sample data.
          </p>
        </Glass>
      )}
    </div>
  );
}
