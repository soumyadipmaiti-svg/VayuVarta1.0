import { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useLoc } from '../contexts/LocContext';

export default function LocationSwitcher() {
  const { locations, activeId, setActiveId } = useLoc();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = locations.find((l) => (l.location_id || l.id) === activeId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-inset text-sm text-ice-200 hover:text-ice-50 transition-colors"
      >
        <div className="relative">
          <MapPin size={16} />
          {active?.label === 'Current Location' && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </div>
        <span>{active?.name || 'Select Location'}</span>
        <ChevronDown size={14} />
      </button>
      {open && locations.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-56 glass-strong rounded-xl py-2 z-50">
          {locations.map((loc) => {
            const id = loc.location_id || loc.id;
            const isGPS = loc.label === 'Current Location';
            return (
              <button
                key={id}
                onClick={() => { setActiveId(id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                  id === activeId ? 'text-accent-400 bg-white/5' : 'text-ice-200 hover:bg-white/5'
                }`}
              >
                <MapPin size={14} className={isGPS ? 'text-green-400' : ''} />
                <div>
                  <div className="font-medium">{loc.name}</div>
                  {loc.label && <div className="text-[11px] text-ice-600">{loc.label}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
