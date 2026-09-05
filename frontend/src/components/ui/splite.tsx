'use client'

import { Suspense, lazy, useRef, useState, useEffect, useCallback, Component, type ReactNode } from 'react'

// Lazy load Spline — only loaded when component mounts
const Spline = lazy(() => import('@splinetool/react-spline'))

// ─── Tuning ────────────────────────────────────────────────────────────
// Global timeout — if the scene hasn't loaded after this many ms from
// mount, we retry (the scene is served locally now, so a hang is a
// one-off network blip, not a permanent condition).
const SCENE_TIMEOUT = 8000
// Total mount attempts (1 original + 9 retries).  The scene is self-hosted
// so failures are extremely rare — retry generously.
const MAX_ATTEMPTS = 10
// Delay between retry attempts so the network has time to recover.
const RETRY_DELAY_MS = 1500

// ─── Error Boundary ────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean
}

class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode; onError?: () => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('SplineScene failed to load:', error.message)
    this.props.onError?.()
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

// ─── Dark ambient fallback (replaces spinner on failure) ───────────────
// When the Spline can't load we never show a broken spinner — instead a
// subtle animated gradient keeps the left half looking intentional.
function SplineFallback() {
  return (
    <div className="w-full h-full bg-[#05070B] relative overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            width: 500, height: 500,
            top: '15%', left: '10%',
            background: 'radial-gradient(circle, rgba(61,156,255,0.08), transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            width: 400, height: 400,
            bottom: '10%', left: '30%',
            background: 'radial-gradient(circle, rgba(125,184,232,0.06), transparent 70%)',
            filter: 'blur(80px)',
            animationDelay: '1s',
          }}
        />
      </div>
    </div>
  )
}

// ─── RAF-throttled mouse forwarder ────────────────────────────────────
// Uses requestAnimationFrame to cap at 60fps and avoid layout thrashing.
// Starts on mount (before the lazy Spline chunk resolves) so the head-follow
// is live the instant the canvas appears.
function useSplineMouse(containerRef: React.RefObject<HTMLDivElement | null>) {
  const rafRef = useRef<number>(0)
  const pendingEvent = useRef<{ x: number; y: number } | null>(null)

  const dispatchToCanvas = useCallback(() => {
    if (!pendingEvent.current || !containerRef.current) {
      rafRef.current = 0
      return
    }

    const { x, y } = pendingEvent.current
    pendingEvent.current = null

    // Find the Spline iframe or canvas inside the container
    const canvas = containerRef.current.querySelector('canvas')
      ?? containerRef.current.querySelector('iframe')

    if (canvas) {
      try {
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          clientX: x,
          clientY: y,
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
        }))
      } catch {
        // Silently ignore — Spline may not be ready
      }
    }

    rafRef.current = 0
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMove = (e: MouseEvent) => {
      pendingEvent.current = { x: e.clientX, y: e.clientY }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(dispatchToCanvas)
      }
    }

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        pendingEvent.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(dispatchToCanvas)
        }
      }
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    container.addEventListener('touchmove', handleTouch, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMove)
      container.removeEventListener('touchmove', handleTouch)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, dispatchToCanvas])
}

// ─── Props ─────────────────────────────────────────────────────────────
interface SplineSceneProps {
  scene: string
  className?: string
  /** Called once the 3D scene has fully loaded and is rendering. */
  onLoad?: () => void
  /** Called when the scene can't load (after all retries / timeout). */
  onFail?: () => void
}

// ─── Component ─────────────────────────────────────────────────────────
export function SplineScene({ scene, className, onLoad, onFail }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Retry counter — bumping it remounts the boundary + Spline fresh.
  const [attempt, setAttempt] = useState(0)
  const attemptRef = useRef(0)
  // Terminal state: we gave up only after every retry was exhausted.
  const [gaveUp, setGaveUp] = useState(false)
  const loadedRef = useRef(false)
  const failedRef = useRef(false)

  // Preload the Spline JS chunk immediately on mount — by the time the
  // lazy import resolves inside the Suspense boundary the chunk is already
  // in the browser cache, cutting load time dramatically on repeat visits.
  useEffect(() => {
    import('@splinetool/react-spline').catch(() => {})
  }, [])

  // RAF-throttled mouse forwarding to Spline — starts immediately on mount
  // so the robot head-follow is live the instant the canvas renders.
  useSplineMouse(containerRef)

  const handleLoad = useCallback(() => {
    loadedRef.current = true
    onLoad?.()
  }, [onLoad])

  // Retry helper — shared by error and hang paths.
  const scheduleRetry = useCallback(() => {
    if (attemptRef.current < MAX_ATTEMPTS - 1) {
      setTimeout(() => {
        attemptRef.current += 1
        failedRef.current = false
        setAttempt(attemptRef.current)
      }, RETRY_DELAY_MS)
    } else {
      setGaveUp(true)
    }
  }, [])

  const handleError = useCallback(() => {
    // Prevent multiple error handlers from stacking (error boundary can
    // fire onError more than once during rapid remounts).
    if (failedRef.current) return
    failedRef.current = true
    scheduleRetry()
  }, [scheduleRetry])

  // Global watchdog — if the scene silently hangs (never loads, never
  // errors), treat it as a failure and retry, same as an error.
  useEffect(() => {
    if (gaveUp || loadedRef.current) return
    const t = setTimeout(() => {
      if (failedRef.current) return // an error retry is already pending
      failedRef.current = true
      scheduleRetry()
    }, SCENE_TIMEOUT)
    return () => clearTimeout(t)
  }, [attempt, gaveUp, scheduleRetry])

  // Tell the parent only when we've exhausted every retry — by then the
  // Auth page's own 25s absolute cap will have revealed anyway.
  useEffect(() => {
    if (gaveUp) onFail?.()
  }, [gaveUp, onFail])

  // If we gave up, show a polished dark gradient fallback — never null,
  // so the left half of the page never looks broken or empty.
  if (gaveUp) return <SplineFallback />

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
  )
}
