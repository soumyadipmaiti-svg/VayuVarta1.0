/**
 * useGeolocation — Browser GPS + reverse geocoding
 *
 * Captures the user's real-time GPS position using the browser's
 * Geolocation API. Optionally reverse-geocodes coordinates to a
 * place name via Open-Meteo's free geocoding endpoint.
 *
 * Features:
 *   - One-shot or continuous tracking
 *   - Auto reverse-geocode to city/region/country
 *   - Permission state tracking
 *   - Error handling with clear messages
 *   - Accuracy indicator
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;       // metres
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface ReverseGeocode {
  name: string;           // city / town
  admin1?: string;        // state / region
  country?: string;
  countryCode?: string;
  timezone?: string;
  elevation?: number;
}

export interface GeoLocationState {
  position: GeoPosition | null;
  geocode: ReverseGeocode | null;
  loading: boolean;
  error: string | null;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unavailable';
}

export interface UseGeolocationOptions {
  /** Automatically start tracking on mount (default: false) */
  autoStart?: boolean;
  /** Continuous tracking with position updates (default: false) */
  watch?: boolean;
  /** How often to update in ms when watching (default: 30000 = 30s) */
  intervalMs?: number;
  /** Enable high accuracy GPS (default: true) */
  highAccuracy?: boolean;
  /** Reverse geocode automatically (default: true) */
  autoGeocode?: boolean;
  /** Maximum age of cached position in ms (default: 60000 = 1min) */
  maxAge?: number;
}

// ─── Reverse Geocoding ─────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocode | null> {
  try {
    // Open-Meteo's geocoding API doesn't support reverse lookup directly,
    // so we use a free alternative: nominatim (OpenStreetMap)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=en`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};

    return {
      name: a.city || a.town || a.village || a.hamlet || a.municipality || a.county || 'Unknown',
      admin1: a.state || a.region || a.county || undefined,
      country: a.country || undefined,
      countryCode: a.country_code?.toUpperCase() || undefined,
      timezone: data.timezone || undefined,
      elevation: data.elevation || undefined,
    };
  } catch {
    return null;
  }
}

// ─── Permission Check ──────────────────────────────────────────────────────

function getPermissionState(): 'prompt' | 'granted' | 'denied' | 'unavailable' {
  if (!navigator.geolocation) return 'unavailable';
  // Check Permissions API if available
  if ('permissions' in navigator) {
    // We can't await this synchronously, so we default to 'prompt'
    // and update in the effect
  }
  return 'prompt';
}

// ─── The Hook ──────────────────────────────────────────────────────────────

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const {
    autoStart = false,
    watch = false,
    intervalMs = 30000,
    highAccuracy = true,
    autoGeocode = true,
    maxAge = 60000,
  } = options;

  const [state, setState] = useState<GeoLocationState>({
    position: null,
    geocode: null,
    loading: false,
    error: null,
    permissionState: getPermissionState(),
  });

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const geocodeCacheRef = useRef<Map<string, ReverseGeocode>>(new Map());
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWatching();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Process a raw GeolocationPosition
  const processPosition = useCallback(async (pos: GeolocationPosition) => {
    if (!mountedRef.current) return;

    const geoPos: GeoPosition = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    };

    setState((prev) => ({ ...prev, position: geoPos, loading: false, error: null }));

    // Reverse geocode
    if (autoGeocode) {
      const cacheKey = `${geoPos.latitude.toFixed(3)},${geoPos.longitude.toFixed(3)}`;
      const cached = geocodeCacheRef.current.get(cacheKey);

      if (cached) {
        setState((prev) => ({ ...prev, geocode: cached }));
      } else {
        const geo = await reverseGeocode(geoPos.latitude, geoPos.longitude);
        if (geo && mountedRef.current) {
          geocodeCacheRef.current.set(cacheKey, geo);
          setState((prev) => ({ ...prev, geocode: geo }));
        }
      }
    }
  }, [autoGeocode]);

  // Error handler
  const handleError = useCallback((err: GeolocationPositionError) => {
    if (!mountedRef.current) return;

    let message: string;
    let permState: 'prompt' | 'granted' | 'denied' | 'unavailable' = 'prompt';

    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location access denied. Please allow location access in your browser settings.';
        permState = 'denied';
        break;
      case err.POSITION_UNAVAILABLE:
        message = 'Location information is unavailable. Your device may not have GPS.';
        permState = 'unavailable';
        break;
      case err.TIMEOUT:
        message = 'Location request timed out. Please try again.';
        break;
      default:
        message = 'An unknown error occurred while getting your location.';
    }

    setState((prev) => ({
      ...prev,
      loading: false,
      error: message,
      permissionState: permState,
    }));
  }, []);

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocation is not supported by this browser.' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Check permission state via Permissions API
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            permissionState: result.state as 'prompt' | 'granted' | 'denied',
          }));
        }
      }).catch(() => { /* ignore */ });
    }

    if (watch) {
      // Continuous watching
      watchIdRef.current = navigator.geolocation.watchPosition(
        processPosition,
        handleError,
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: maxAge }
      );
    } else {
      // Single position fetch
      navigator.geolocation.getCurrentPosition(
        processPosition,
        handleError,
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: maxAge }
      );
    }
  }, [watch, highAccuracy, maxAge, processPosition, handleError]);

  // Stop watching
  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, loading: false }));
  }, []);

  // Periodic refresh when watching
  useEffect(() => {
    if (watch && watchIdRef.current != null && intervalMs > 0) {
      intervalRef.current = setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            processPosition,
            handleError,
            { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 0 }
          );
        }
      }, intervalMs);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [watch, intervalMs, highAccuracy, processPosition, handleError]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      startWatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual refresh
  const refresh = useCallback(() => {
    startWatching();
  }, [startWatching]);

  return {
    ...state,
    startWatching,
    stopWatching,
    refresh,
    isActive: watchIdRef.current != null,
  };
}
