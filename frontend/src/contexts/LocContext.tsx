import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

export interface Location {
  id: string;
  user_location_id?: string;
  location_id?: string;
  name: string;
  latitude: number;
  longitude: number;
  label?: string;
  is_default?: boolean;
}

interface LocCtx {
  locations: Location[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  reload: () => Promise<void>;
  geoInitializing: boolean;
}

const LocCtx = createContext<LocCtx>(null!);

// ─── Reverse geocode via Open-Meteo (free, reliable) ─────────────────────────
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  // Try Open-Meteo first (already used in the project, reliable)
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      // Open-Meteo reverse geocode doesn't exist directly, so we use Nominatim as fallback
    }
  } catch { /* fall through to Nominatim */ }

  // Nominatim — reliable, free, no key needed
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=en`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) throw new Error('Nominatim failed');
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
    if (city && city !== 'My Location') return city;
  } catch { /* fall through to fallback */ }

  // Fallback: use coordinates as name
  return `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
}

// ─── localStorage helpers for guest mode ────────────────────────────────────
const GUEST_LOCATIONS_KEY = 'vayu_guest_locations';

function loadGuestLocations(): Location[] {
  try {
    const raw = localStorage.getItem(GUEST_LOCATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveGuestLocations(locs: Location[]) {
  try {
    localStorage.setItem(GUEST_LOCATIONS_KEY, JSON.stringify(locs));
  } catch { /* ignore */ }
}

// ─── Default fallback location (Kolkata, India) ─────────────────────────────
const FALLBACK_LOCATION: Location = {
  id: 'fallback_1',
  name: 'Kolkata',
  latitude: 22.5726,
  longitude: 88.3639,
  label: 'Default Location',
  is_default: true,
};

// ─── GPS retry with exponential backoff ──────────────────────────────────────
function requestGPSPosition(retries = 3, delay = 1000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number, currentDelay: number) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          if (remaining <= 0) {
            reject(err);
            return;
          }
          // Retry on timeout or network error
          if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
            setTimeout(() => attempt(remaining - 1, currentDelay * 2), currentDelay);
          } else {
            // PERMISSION_DENIED — don't retry
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        }
      );
    };
    attempt(retries, delay);
  });
}

export function LocProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [geoInitializing, setGeoInitializing] = useState(false);

  // Refs to avoid stale closures — always read the latest value
  const userRef = useRef(user);
  userRef.current = user;
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const gpsInitRef = useRef(false);
  const gpsInProgress = useRef(false);

  const isGuest = !user;

  // ─── Load saved locations (reads user from ref to avoid stale closure) ───
  const reload = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      // Guest: load from localStorage
      const locs = loadGuestLocations();
      setLocations(locs);
      if (locs.length > 0 && !activeIdRef.current) {
        const def = locs.find((l) => l.is_default) || locs[0];
        setActiveId(def.id);
      }
      return;
    }

    // Logged in: load from backend
    try {
      const locs = await api.locations();
      setLocations(locs);
      if (locs.length > 0 && !activeIdRef.current) {
        const def = locs.find((l: any) => l.is_default) || locs[0];
        setActiveId(def.location_id || def.id);
      }
    } catch (e) {
      console.error('Failed to load locations', e);
    }
  }, []); // no deps — reads from refs

  // ─── Save a location (guest: localStorage, user: backend) ─────────────
  const saveLocation = useCallback(async (loc: Location): Promise<Location | null> => {
    const currentUser = userRef.current;

    if (!currentUser) {
      // Guest: save to localStorage
      const existing = loadGuestLocations();
      const isDupe = existing.some(
        (l) => Math.abs(l.latitude - loc.latitude) < 0.01 && Math.abs(l.longitude - loc.longitude) < 0.01
      );
      if (isDupe) return existing.find((l) => Math.abs(l.latitude - loc.latitude) < 0.01) || null;
      const updated = [...existing, loc];
      saveGuestLocations(updated);
      setLocations(updated);
      return loc;
    }

    // Logged in: save to backend
    try {
      const result = await api.addLocation({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        label: loc.label,
      });
      const savedLoc: Location = {
        id: result.location_id,
        location_id: result.location_id,
        user_location_id: result.user_location_id,
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        label: result.label,
        is_default: result.is_default,
      };
      const locs = await api.locations();
      setLocations(locs);
      return savedLoc;
    } catch (e) {
      console.error('Failed to save location:', e);
      return null;
    }
  }, []); // no deps — reads from refs

  // ─── Auto-request GPS for ALL users — bulletproof with retry + fallback ──
  const autoRequestGPS = useCallback(async () => {
    // Prevent duplicate runs
    if (gpsInitRef.current || gpsInProgress.current) return;
    gpsInitRef.current = true;
    gpsInProgress.current = true;

    try {
      // Check if browser supports geolocation
      if (!navigator.geolocation) {
        console.log('Geolocation not supported — using fallback location');
        await useFallbackLocation();
        return;
      }

      // Load existing locations first
      await reload();

      // Check if user already has locations
      const currentUser = userRef.current;
      if (currentUser) {
        try {
          const existing = await api.locations();
          if (existing.length > 0) return; // Already has locations
        } catch { /* continue to GPS */ }
      } else {
        if (loadGuestLocations().length > 0) return; // Already has locations
      }

      setGeoInitializing(true);

      // Try GPS with retry
      let pos: GeolocationPosition;
      try {
        pos = await requestGPSPosition(3, 1500);
      } catch (gpsErr: any) {
        console.log('GPS failed after retries:', gpsErr.message || gpsErr.code);
        await useFallbackLocation();
        return;
      }

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // Validate coordinates
      if (lat === 0 && lon === 0) {
        console.log('GPS returned 0,0 — using fallback');
        await useFallbackLocation();
        return;
      }

      const cityName = await reverseGeocode(lat, lon);

      const newLoc: Location = {
        id: `guest_${Date.now()}`,
        name: cityName,
        latitude: lat,
        longitude: lon,
        label: 'Current Location',
        is_default: true,
      };

      const saved = await saveLocation(newLoc);

      if (saved) {
        const correctId = saved.location_id || saved.id;
        setActiveId(correctId);
        console.log(`GPS location saved: ${cityName} (${lat}, ${lon})`);
      } else {
        console.log('Failed to save GPS location — using fallback');
        await useFallbackLocation();
      }
    } catch (err: any) {
      console.error('GPS auto-request failed:', err.message || err);
      await useFallbackLocation();
    } finally {
      setGeoInitializing(false);
      gpsInProgress.current = false;
    }
  }, [reload, saveLocation]);

  // ─── Fallback: use default location when GPS fails ──────────────────────
  const useFallbackLocation = async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      // Guest: check if we already have locations
      const existing = loadGuestLocations();
      if (existing.length > 0) {
        const def = existing.find((l) => l.is_default) || existing[0];
        setActiveId(def.id);
        return;
      }

      // No locations at all — save fallback
      const fallback = { ...FALLBACK_LOCATION, id: `fallback_${Date.now()}` };
      const updated = [...existing, fallback];
      saveGuestLocations(updated);
      setLocations(updated);
      setActiveId(fallback.id);
      console.log('Using fallback location: Kolkata');
    } else {
      // Logged in: try to save fallback to backend
      try {
        const result = await api.addLocation({
          name: FALLBACK_LOCATION.name,
          latitude: FALLBACK_LOCATION.latitude,
          longitude: FALLBACK_LOCATION.longitude,
          label: 'Default Location',
        });
        const locs = await api.locations();
        setLocations(locs);
        if (locs.length > 0) {
          const def = locs.find((l: any) => l.is_default) || locs[0];
          setActiveId(def.location_id || def.id);
        }
      } catch (e) {
        console.error('Failed to save fallback location:', e);
      }
    }
  };

  // ─── Single effect: trigger GPS + reload when user changes ────────────
  useEffect(() => {
    // Reset GPS init flag so it triggers for new users / signups
    gpsInitRef.current = false;
    gpsInProgress.current = false;
    setActiveId(null);
    autoRequestGPS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <LocCtx.Provider value={{ locations, activeId, setActiveId, reload, geoInitializing }}>
      {children}
    </LocCtx.Provider>
  );
}

export function useLoc() {
  return useContext(LocCtx);
}
