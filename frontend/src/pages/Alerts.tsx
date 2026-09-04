import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import Glass from '../components/Glass';
import { Bell, BellOff, AlertTriangle, Zap, Plus, X } from 'lucide-react';

const EVENT_TYPES = ['rain', 'heat', 'cold', 'storm', 'wind', 'uv', 'aqi'];
const sevColor: Record<string, string> = { INFO: 'text-severity-info', WARNING: 'text-severity-warning', CRITICAL: 'text-severity-critical' };
const sevBg: Record<string, string> = { INFO: 'bg-severity-info/10', WARNING: 'bg-severity-warning/10', CRITICAL: 'bg-severity-critical/10' };

export default function Alerts() {
  const { activeId } = useLoc();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState('rain');
  const [newThreshold, setNewThreshold] = useState('70');

  const load = () => {
    api.alerts().then(setAlerts).catch(() => {});
    api.subscriptions().then(setSubs).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const createSub = async () => {
    if (!activeId) return;
    try {
      await api.createSubscription({ location_id: activeId, event_type: newEvent, threshold_value: parseFloat(newThreshold) });
      setShowCreate(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ice-50">Weather Alerts</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500/20 text-accent-400 text-sm font-medium hover:bg-accent-500/30 transition-colors"
        >
          <Plus size={16} /> New Subscription
        </button>
      </div>

      {showCreate && (
        <Glass className="p-5">
          <h3 className="text-sm font-semibold text-ice-50 mb-3">Create Alert Subscription</h3>
          <div className="flex flex-wrap gap-3">
            <select value={newEvent} onChange={(e) => setNewEvent(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm">
              {EVENT_TYPES.map((e) => <option key={e} value={e}>{e.toUpperCase()}</option>)}
            </select>
            <input type="number" value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm w-28" placeholder="Threshold" />
            <button onClick={createSub}
              className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-400 transition-colors">
              Subscribe
            </button>
          </div>
        </Glass>
      )}

      {/* Active Alerts */}
      <div>
        <h2 className="text-sm font-semibold text-ice-400 uppercase tracking-wider mb-3">Active Alerts</h2>
        {alerts.length === 0 ? (
          <Glass className="p-8 text-center" inset>
            <BellOff className="mx-auto mb-2 text-ice-600" size={32} />
            <p className="text-sm text-ice-400">No active alerts</p>
          </Glass>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <Glass key={a.id} className="p-4 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${sevBg[a.severity]} flex items-center justify-center ${sevColor[a.severity]}`}>
                  <AlertTriangle size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase ${sevColor[a.severity]}`}>{a.severity}</span>
                    <span className="text-xs text-ice-600">· {a.event_type}</span>
                    {a.location_name && <span className="text-xs text-ice-600">· {a.location_name}</span>}
                  </div>
                  <p className="text-sm text-ice-200 mt-1">{a.message}</p>
                  <div className="text-[11px] text-ice-600 mt-1">
                    Expires: {new Date(a.expires_at).toLocaleString()}
                  </div>
                </div>
              </Glass>
            ))}
          </div>
        )}
      </div>

      {/* Subscriptions */}
      <div>
        <h2 className="text-sm font-semibold text-ice-400 uppercase tracking-wider mb-3">Your Subscriptions</h2>
        {subs.length === 0 ? (
          <Glass className="p-6 text-center" inset><p className="text-sm text-ice-400">No alert subscriptions yet</p></Glass>
        ) : (
          <div className="space-y-2">
            {subs.map((s) => (
              <Glass key={s.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-accent-400"><Zap size={16} /></div>
                  <div>
                    <div className="text-sm font-medium text-ice-50">{s.event_type.toUpperCase()}</div>
                    <div className="text-xs text-ice-400">{s.location_name || 'Location'} · Threshold: {s.threshold_value ?? 'Default'}</div>
                  </div>
                </div>
                <button onClick={() => api.deleteSubscription(s.id).then(load)}
                  className="text-ice-600 hover:text-severity-critical transition-colors p-1"><X size={16} /></button>
              </Glass>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
