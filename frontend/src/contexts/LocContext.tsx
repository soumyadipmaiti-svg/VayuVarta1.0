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
  /** True while the app is live-watching GPS and will auto-update on movement */
  isLiveTracking: boolean;
}

const LocCtx = createContext<LocCtx>(null!);

// ─── Reverse geocode via Open-Meteo (free, reliable) ─────────────────────────
async function reverseGeocode(lat: number, lon: number): Promise<string> {
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

// ─── GPS helpers ─────────────────────────────────────────────────────────────────────
function requestGPSPosition(retries = 3, delay = 1000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number, currentDelay: number) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          if (remaining <= 0) { reject(err); return; }
          if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
            setTimeout(() => attempt(remaining - 1, currentDelay * 2), currentDelay);
          } else {
            reject(err);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };
    attempt(retries, delay);
  });
}

/**
 * Distance between two lat/lon points in meters (Haversine formula).
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        await api.addLocation({
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
    gpsInitRef.current = false;
    gpsInProgress.current = false;
    setActiveId(null);
    autoRequestGPS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ═══ LIVE GPS TRACKING ═════════════════════════════════════════════════
  // Watches the device position continuously while a "Current Location"
  // entry exists AND is active. When the user moves more than MIN_MOVE_METERS
  // from the active entry's saved coordinates (debounced), the "Current
  // Location" entry is updated in place — so weather, forecast, VayuGPT and
  // alarms all follow the user automatically, on every page.

  const MIN_MOVE_METERS = 500;   // ignore GPS jitter; real city-level moves only
  const DEBOUNCE_MS = 60_000;    // at most one location update per minute

  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const [isLiveTracking, setIsLiveTracking] = useState(false);

  useEffect(() => {
    // Only track when the ACTIVE location is the GPS one.
    const active = locations.find((l) => (l.location_id || l.id) === activeId);
    const shouldTrack = !!active && active.label === 'Current Location' && !!navigator.geolocation;

    if (!shouldTrack) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveTracking(false);
      return;
    }

    setIsLiveTracking(true);

    const handleMove = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // 1. Distance gate — how far from the active entry's saved coords?
      const moved = haversineMeters(active.latitude, active.longitude, lat, lon);
      if (moved < MIN_MOVE_METERS) return; // jitter / same place

      // 2. Debounce — at most one update per minute.
      if (Date.now() - lastUpdateRef.current < DEBOUNCE_MS) return;
      lastUpdateRef.current = Date.now();

      // 3. Reverse-geocode the new position.
      const city = await reverseGeocode(lat, lon);

      const currentUser = userRef.current;
      try {
        if (!currentUser) {
          // Guest: update the entry in localStorage in place.
          const existing = loadGuestLocations();
          const idx = existing.findIndex((l) => l.label === 'Current Location');
          if (idx >= 0) {
            const updated = [...existing];
            updated[idx] = {
              ...updated[idx],
              name: city,
              latitude: lat,
              longitude: lon,
            };
            saveGuestLocations(updated);
            setLocations(updated);
            // activeId unchanged — the entry identity stays the same.
          }
        } else {
          // Logged in: update the saved "Current Location" via the backend.
          // The locations table de-duplicates by lat/lng, and user_locations
          // rows are keyed by user+location, so we repoint the saved GPS entry
          // by deleting + re-adding with the same label. We then activate the
          // NEW location id — the old one no longer exists after the swap.
          const locs = await api.locations();
          const gpsEntry = locs.find((l: any) => l.label === 'Current Location');
          if (gpsEntry && gpsEntry.user_location_id) {
            await api.deleteLocation(gpsEntry.location_id);
          }
          const added = await api.addLocation({
            name: city,
            latitude: lat,
            longitude: lon,
            label: 'Current Location',
          });
          await reload();
          // Keep the new GPS entry active so tracking + weather follow it.
          if (added?.location_id) {
            activeIdRef.current = added.location_id;
            setActiveId(added.location_id);
          }
        }
        console.log(`📍 Live location updated: ${city} (moved ${Math.round(moved)} m)`);
      } catch (err) {
        console.error('Live location update failed:', err);
        lastUpdateRef.current = 0; // allow retry sooner
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { void handleMove(pos); },
      (err) => {
        // PERMISSION_DENIED kills the watch permanently; others are transient.
        console.warn('Live GPS watch error:', err.message || err.code);
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          setIsLiveTracking(false);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeId, locations, reload]);

  return (
    <LocCtx.Provider value={{ locations, activeId, setActiveId, reload, geoInitializing, isLiveTracking }}>
      {children}
    </LocCtx.Provider>
  );
}

export function useLoc() {
  return useContext(LocCtx);
}
