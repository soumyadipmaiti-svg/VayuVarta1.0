'use client'

import { Suspense, lazy, useRef, useEffect, useCallback, Component, type ReactNode } from 'react'

// Lazy load Spline — only loaded when component mounts
const Spline = lazy(() => import('@splinetool/react-spline'))

// ─── Error Boundary ────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
}

class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('SplineScene failed to load:', error.message);
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
}

// ─── Component ─────────────────────────────────────────────────────────
export function SplineScene({ scene, className }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // RAF-throttled mouse forwarding to Spline
  useSplineMouse(containerRef);

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ''}`}
      style={{ pointerEvents: 'auto' }}
    >
      <SplineErrorBoundary
        fallback={<SplineFallback />}
      >
        <Suspense fallback={<SplineFallback />}>
          <Spline
            scene={scene}
            className="w-full h-full"
          />
        </Suspense>
      </SplineErrorBoundary>
    </div>
  );
}
