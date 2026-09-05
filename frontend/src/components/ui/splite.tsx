'use client'

import { Suspense, lazy, useRef, useState, useEffect, useCallback, Component, type ReactNode } from 'react'

// Lazy load Spline — only loaded when component mounts
const Spline = lazy(() => import('@splinetool/react-spline'))

// ─── Tuning ────────────────────────────────────────────────────────────
// How long to wait for the 3D scene before giving up and hiding gracefully.
const SCENE_TIMEOUT = 10000
// Total mount attempts (1 original + 1 retry). Transient CDN/network
// hiccups almost always succeed on the retry.
const MAX_ATTEMPTS = 2

// ─── Error Boundary ────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
}

class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('SplineScene failed to load:', error.message);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

// ─── Loading Spinner ───────────────────────────────────────────────────
function SplineFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-white/30">Loading 3D...</span>
      </div>
    </div>
  );
}

// ─── RAF-throttled mouse forwarder ────────────────────────────────────
// Uses requestAnimationFrame to cap at 60fps and avoid layout thrashing.
// Starts on mount (before the lazy Spline chunk resolves) so the head-follow
// is live the instant the canvas appears.
function useSplineMouse(containerRef: React.RefObject<HTMLDivElement | null>) {
  const rafRef = useRef<number>(0);
  const pendingEvent = useRef<{ x: number; y: number } | null>(null);

  const dispatchToCanvas = useCallback(() => {
    if (!pendingEvent.current || !containerRef.current) {
      rafRef.current = 0;
      return;
    }

    const { x, y } = pendingEvent.current;
    pendingEvent.current = null;

    // Find the Spline iframe or canvas inside the container
    const canvas = containerRef.current.querySelector('canvas')
      ?? containerRef.current.querySelector('iframe');

    if (canvas) {
      try {
        // Always forward the pointer so the 3D character can look toward
        // the cursor from ANYWHERE on the page (username, nav, etc.) —
        // no proximity gate. RAF-throttling above keeps this cheap.
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          clientX: x,
          clientY: y,
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
        }));
      } catch {
        // Silently ignore — Spline may not be ready
      }
    }

    rafRef.current = 0;
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (e: MouseEvent) => {
      pendingEvent.current = { x: e.clientX, y: e.clientY };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(dispatchToCanvas);
      }
    };

    // Also handle touch for mobile/tablet interaction
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        pendingEvent.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(dispatchToCanvas);
        }
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    container.addEventListener('touchmove', handleTouch, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMove);
      container.removeEventListener('touchmove', handleTouch);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, dispatchToCanvas]);
}

// ─── Props ─────────────────────────────────────────────────────────────
interface SplineSceneProps {
  scene: string;
  className?: string;
  /** Called once the 3D scene has fully loaded and is rendering. */
  onLoad?: () => void;
  /** Called when the scene can't load (after retries / timeout). */
  onFail?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────
export function SplineScene({ scene, className, onLoad, onFail }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Retry counter — bumping it remounts the boundary + Spline fresh.
  const [attempt, setAttempt] = useState(0);
  // Terminal states: we either gave up after retries, or the scene hung.
  const [gaveUp, setGaveUp] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const loadedRef = useRef(false);

  // RAF-throttled mouse forwarding to Spline — starts immediately on mount
  // so the robot head-follow is live the instant the canvas renders.
  useSplineMouse(containerRef);

  const handleLoad = useCallback(() => {
    loadedRef.current = true;
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    // Transient CDN/network failures often succeed on a fresh mount.
    if (attempt < MAX_ATTEMPTS - 1) {
      setAttempt((a) => a + 1);
    } else {
      setGaveUp(true);
    }
  }, [attempt]);

  // Watchdog — if the scene silently hangs (never loads, never errors),
  // stop showing the spinner so the page never looks broken.
  useEffect(() => {
    if (gaveUp || loadedRef.current) return;
    const t = setTimeout(() => setTimedOut(true), SCENE_TIMEOUT);
    return () => clearTimeout(t);
  }, [attempt, gaveUp]);

  // Tell the parent we're done trying (lets the splash hide early).
  useEffect(() => {
    if (gaveUp || timedOut) onFail?.();
  }, [gaveUp, timedOut, onFail]);

  // Graceful end — the dark page background takes over, no broken UI.
  if (gaveUp || timedOut) return null;

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ''}`}
      style={{ pointerEvents: 'auto' }}
    >
      <SplineErrorBoundary
        key={attempt}
        fallback={<SplineFallback />}
        onError={handleError}
      >
        <Suspense fallback={<SplineFallback />}>
          <Spline
            scene={scene}
            className="w-full h-full"
            onLoad={handleLoad}
          />
        </Suspense>
      </SplineErrorBoundary>
    </div>
  );
}