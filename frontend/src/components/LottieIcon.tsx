import { useEffect, useRef } from 'react';
// lottie_light is ~half the size of lottie-web and fully supports the
// standard SVG renderer used for Meteocons weather animations.
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';

const CDN_BASE = 'https://cdn.meteocons.com/3.0.0-next.10/lottie/fill';

interface LottieIconProps {
  /** Meteocons slug e.g. "clear-day", "rain", "thunderstorms-rain" */
  slug: string;
  size?: number;
  className?: string;
  speed?: number;
  loop?: boolean;
  /** If true, show static SVG fallback instead of Lottie */
  static?: boolean;
}

/**
 * Renders an animated Meteocons weather icon via lottie-web.
 * Falls back to CDN SVG if Lottie fails to load.
 */
export default function LottieIcon({
  slug,
  size = 64,
  className = '',
  speed = 0.6,
  loop = true,
  static: isStatic = false,
}: LottieIconProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (isStatic || !containerRef.current) return;

    const container = containerRef.current;
    let cancelled = false;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    fetch(`${CDN_BASE}/${slug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Lottie ${slug} not found`);
        return res.json();
      })
      .then((data) => {
        if (cancelled || !container) return;
        animRef.current = lottie.loadAnimation({
          container,
          animationData: data,
          renderer: 'svg',
          loop: !prefersReducedMotion,
          autoplay: !prefersReducedMotion,
        });
        animRef.current.setSpeed(speed);
      })
      .catch(() => {
        // Fallback: inject static SVG
        if (cancelled || !container) return;
        fetch(`${CDN_BASE.replace('/lottie/', '/svg/')}/${slug}.svg`)
          .then((r) => r.text())
          .then((svg) => {
            if (!cancelled && container) {
              container.innerHTML = svg;
              const svgEl = container.querySelector('svg');
              if (svgEl) {
                svgEl.setAttribute('width', String(size));
                svgEl.setAttribute('height', String(size));
              }
            }
          })
          .catch(() => {});
      });

    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [slug, speed, loop, isStatic, size]);

  // Static SVG mode — just load the SVG directly
  if (isStatic) {
    const svgUrl = `${CDN_BASE.replace('/lottie/', '/svg/')}/${slug}.svg`;
    return (
      <img
        src={svgUrl}
        alt={slug}
        width={size}
        height={size}
        className={`select-none pointer-events-none ${className}`}
        style={{ width: size, height: size, objectFit: 'contain' }}
        draggable={false}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
