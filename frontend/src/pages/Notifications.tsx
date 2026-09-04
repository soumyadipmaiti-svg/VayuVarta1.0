import { useState } from 'react';
import Glass from '../components/Glass';
import { Bell } from 'lucide-react';

export default function Notifications() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [minSeverity, setMinSeverity] = useState('WARNING');
  const [briefingTime, setBriefingTime] = useState('');

  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-6 space-y-6">
      <h1 className="text-2xl font-bold text-ice-50">Notification Settings</h1>
      {msg && <div className="text-sm text-accent-400 bg-accent-500/10 px-4 py-2 rounded-xl">{msg}</div>}

      {/* Push Notifications */}
      <Glass className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center text-accent-400"><Bell size={20} /></div>
            <div>
              <div className="text-sm font-semibold text-ice-50">Browser Push Notifications</div>
              <div className="text-xs text-ice-400">Get alerts like Zomato/Swiggy directly on your device</div>
            </div>
          </div>
          <button onClick={() => setPushEnabled(!pushEnabled)}
            className={`w-12 h-6 rounded-full transition-all ${pushEnabled ? 'bg-accent-500' : 'bg-white/10'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </Glass>

      {/* Severity Filter */}
      <Glass className="p-5">
        <div className="text-sm font-semibold text-ice-50 mb-3">Minimum Alert Severity</div>
        <div className="flex gap-2">
          {['INFO', 'WARNING', 'CRITICAL'].map((s) => (
            <button key={s} onClick={() => setMinSeverity(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                minSeverity === s ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'text-ice-400 hover:bg-white/5'
              }`}>{s}</button>
          ))}
        </div>
      </Glass>

      {/* Daily Briefing */}
      <Glass className="p-5">
        <div className="text-sm font-semibold text-ice-50 mb-3">Daily Briefing Time</div>
        <input type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
      </Glass>
    </div>
  );
}
