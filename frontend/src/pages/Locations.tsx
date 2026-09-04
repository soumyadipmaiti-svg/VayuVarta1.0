import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import Glass from '../components/Glass';
import { MapPin, Plus, X, Search, Globe, Loader2, Check } from 'lucide-react';

export default function Locations() {
  const { locations, activeId, setActiveId, reload } = useLoc();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [geoResults, setGeoResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setGeoResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { results } = await api.geocode(value.trim());
        setGeoResults(results || []);
      } catch { setGeoResults([]); }
      setSearching(false);
    }, 400);
  }, []);

  const addFromGeo = async (place: any) => {
    setLoading(true);
    try {
      await api.addLocation({
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.display || undefined,
      });
      flash(`${place.name} added!`);
      setSearch('');
      setGeoResults([]);
      reload();
    } catch (e: any) { flash(e.message); }
    setLoading(false);
  };

  const addManual = async () => {
    if (!name || !lat || !lon) { flash('Please fill city name, latitude and longitude'); return; }
    setLoading(true);
    try {
      await api.addLocation({ name, latitude: parseFloat(lat), longitude: parseFloat(lon), label: label || undefined });
      setShowAdd(false); setName(''); setLat(''); setLon(''); setLabel('');
      flash('Location added!');
      reload();
    } catch (e: any) { flash(e.message); }
    setLoading(false);
  };

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-ice-50">Saved Locations</h1>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-accent-500/20 text-accent-400 text-sm font-medium hover:bg-accent-500/30 transition-colors">
          <Plus size={16} /> Add
        </button>
      </div>

      {msg && (
        <div className="text-sm text-accent-400 bg-accent-500/10 px-4 py-2 rounded-xl flex items-center gap-2">
          <Check size={14} /> {msg}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <Glass className="p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ice-50">Add Location</h3>
          <div>
            <div className="flex items-center gap-2 text-xs text-ice-400 mb-2">
              <Globe size={14} /> Search any city in the world
            </div>
            <div className="relative">
              <input value={search} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Type a city name... (e.g. Kolkata, Tokyo, Paris)"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ice-600" />
              {searching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-accent-400 animate-spin" />}
            </div>
            {search && geoResults.length > 0 && (
              <div className="mt-2 max-h-60 overflow-y-auto no-scrollbar space-y-1">
                {geoResults.map((place, i) => (
                  <button key={`${place.name}-${place.latitude}-${i}`}
                    onClick={() => { addFromGeo(place); setSearch(''); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ice-200 hover:bg-white/10 transition-colors flex items-center gap-2">
                    <MapPin size={14} className="text-accent-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{place.name}</div>
                      <div className="text-xs text-ice-600 truncate">{place.display}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-white/5 pt-4">
            <div className="text-xs text-ice-400 mb-2">Or enter coordinates manually</div>
            <div className="grid grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="City name"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (Home, College)"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
              <input type="number" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" step="any"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
              <input type="number" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" step="any"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-ice-200 text-sm focus:border-accent-500/50 transition-all" />
            </div>
            <button onClick={addManual} disabled={loading}
              className="mt-3 px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-400 transition-colors disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Location'}
            </button>
          </div>
        </Glass>
      )}

      {/* Saved locations list */}
      <div className="space-y-2">
        {locations.length === 0 && !showAdd && (
          <Glass className="p-8 text-center" inset>
            <MapPin className="mx-auto mb-3 text-ice-600" size={32} />
            <p className="text-sm text-ice-400 mb-4">No locations yet. Allow location access or add one manually.</p>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500/20 text-accent-400 text-sm font-medium hover:bg-accent-500/30 transition-colors mx-auto">
              <Plus size={14} /> Add Location
            </button>
          </Glass>
        )}
        {locations.map((loc) => {
          const id = loc.location_id || loc.id;
          const isActive = id === activeId;
          const isGPS = loc.label === 'Current Location';
          return (
            <Glass key={loc.id}
              className={`p-3 sm:p-4 flex items-center justify-between cursor-pointer transition-all ${isActive ? 'ring-1 ring-accent-500/40' : ''}`}
              onClick={() => setActiveId(id)}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isGPS ? 'bg-green-500/20 text-green-400' :
                  isActive ? 'bg-accent-500/20 text-accent-400' : 'bg-white/5 text-ice-400'
                }`}>
                  <MapPin size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ice-50 truncate">{loc.name}</span>
                    {isGPS && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">GPS</span>}
                    {loc.is_default && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-500/10 text-accent-400 font-medium">Default</span>}
                  </div>
                  <div className="text-xs text-ice-400 truncate">
                    {loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}{loc.label && loc.label !== 'Current Location' ? ` · ${loc.label}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!loc.is_default && (
                  <button onClick={(e) => { e.stopPropagation(); api.setDefault(id).then(reload); }}
                    className="text-[11px] text-ice-600 hover:text-accent-400 transition-colors px-2 py-1">
                    Set Default
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); api.deleteLocation(id).then(reload); }}
                  className="text-ice-600 hover:text-severity-critical transition-colors p-1">
                  <X size={14} />
                </button>
              </div>
            </Glass>
          );
        })}
      </div>
    </div>
  );
}
