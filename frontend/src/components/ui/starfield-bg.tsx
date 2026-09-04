"use client";

import { useEffect, useRef, useMemo } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  speed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  delay: number;
  angle: number;
}

function genStars(count: number): Star[] {
  const s: Star[] = [];
  for (let i = 0; i < count; i++) {
    s.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      delay: Math.random() * 5,
      speed: Math.random() * 3 + 2,
    });
  }
  return s;
}

function genShooting(count: number): ShootingStar[] {
  const s: ShootingStar[] = [];
  for (let i = 0; i < count; i++) {
    s.push({
      x: Math.random() * 80 + 10,
      y: Math.random() * 40,
      length: Math.random() * 80 + 40,
      delay: Math.random() * 12 + i * 4,
      angle: Math.random() * 20 + 25,
    });
  }
  return s;
}

export default function StarfieldBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars = useMemo(() => genStars(180), []);
  const shooting = useMemo(() => genShooting(5), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const tw = Math.sin(t * (1 / s.speed) + s.delay) * 0.3 + 0.7;
        const a = s.opacity * tw;
        const cx = (s.x / 100) * w;
        const cy = (s.y / 100) * h;
        ctx.beginPath();
        ctx.arc(cx, cy, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fill();
        if (s.size > 1.5) {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.size * 3);
          g.addColorStop(0, `rgba(180,200,255,${a * 0.3})`);
          g.addColorStop(1, "rgba(180,200,255,0)");
          ctx.beginPath();
          ctx.arc(cx, cy, s.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }
      }

      for (const ss of shooting) {
        const cycle = t % (ss.delay + 6);
        if (cycle < ss.delay) continue;
        const p = (cycle - ss.delay) / 3;
        if (p > 1) continue;
        const fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        const fi = p < 0.1 ? p / 0.1 : 1;
        const a = fi * fade * 0.8;
        const sx = (ss.x / 100) * w + p * w * 0.3;
        const sy = (ss.y / 100) * h + p * h * 0.2;
        const rad = (ss.angle * Math.PI) / 180;
        const ex = sx - Math.cos(rad) * ss.length;
        const ey = sy - Math.sin(rad) * ss.length;
        const g = ctx.createLinearGradient(sx, sy, ex, ey);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.3, `rgba(180,210,255,${a * 0.6})`);
        g.addColorStop(1, "rgba(180,210,255,0)");
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [stars, shooting]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, #0a0a1a 0%, #050510 50%, #020208 100%)",
        }}
      />
      {/* Nebula clouds */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full mix-blend-screen animate-pulse"
        style={{
          top: "-10%",
          right: "-10%",
          background:
            "radial-gradient(circle, rgba(99,60,180,0.12) 0%, rgba(60,30,140,0.05) 40%, transparent 70%)",
          filter: "blur(60px)",
          animationDuration: "8s",
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full mix-blend-screen animate-pulse"
        style={{
          bottom: "10%",
          left: "-5%",
          background:
            "radial-gradient(circle, rgba(30,100,180,0.1) 0%, rgba(20,60,140,0.04) 40%, transparent 70%)",
          filter: "blur(50px)",
          animationDuration: "10s",
          animationDelay: "2s",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
        }}
      />
    </div>
  );
}
