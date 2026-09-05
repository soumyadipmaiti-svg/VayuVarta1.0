import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { SplineScene } from '../components/ui/splite';
import { Spotlight } from '../components/ui/spotlight';
import { ArrowRight, Cloud, Sun, Wind, Sparkles, ChevronRight } from 'lucide-react';

// ─── Loading Screen ────────────────────────────────────────────────────
// Takes ~2.5 seconds to complete (progress += 1.0 every 25ms = 100 ticks).
// The 3D scene is now served locally (/scene.splinecode) so it loads in
// milliseconds from our own CDN — the splash is just a quick polish.
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const messages = [
    'Perfection takes a moment',
    'Something special is loading',
    'Brewing your experience',
    'Great things take time',
    'Worth the wait',
  ];

  // Use ref for onComplete so the interval never restarts on re-render.
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 1.0;
        if (next >= 100) {
          clearInterval(interval);
          if (!completedRef.current) {
            completedRef.current = true;
            setTimeout(() => onCompleteRef.current(), 300);
          }
          return 100;
        }
        return next;
      });
    }, 25);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, 700);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#05070B]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            width: 400, height: 400,
            top: '20%', left: '30%',
            background: 'radial-gradient(circle, rgba(61,156,255,0.06), transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-16 h-16 rounded-full overflow-hidden shadow-lg shadow-accent-500/20 mb-8 ring-2 ring-white/10"
      >
        <img src="/logo.png" alt="Vayu Varta" className="w-full h-full object-cover" />
      </motion.div>

      <div className="h-6 mb-6 flex items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-white/40 text-sm"
          >
            {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="w-48 h-[2px] bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

// ─── Hook: detect desktop/tablet ───────────────────────────────────────
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isDesktop;
}

// ─── Main Auth Page ────────────────────────────────────────────────────
export default function Auth() {
  const { login, register } = useAuth();
  const [view, setView] = useState<'welcome' | 'login' | 'register'>('welcome');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const isDesktop = useIsDesktop();

  // ── Splash gating refs ──────────────────────────────────────────────
  // The splash only hides when ALL of these are true:
  //   1. Loading screen finished (minSplashDoneRef)
  //   2. Spline scene loaded OR failed (splineLoadedRef | splineFailedRef)
  // This eliminates every race condition — no empty half, no spinner flash.
  const minSplashDoneRef = useRef(false);
  const splineLoadedRef = useRef(false);
  const splineFailedRef = useRef(false);
  const splashHiddenRef = useRef(false);

  // Single gate — called by every callback. Only proceeds when both the
  // loading screen AND the 3D scene have reached a terminal state.
  const checkAndReveal = useCallback(() => {
    if (splashHiddenRef.current) return;
    if (!minSplashDoneRef.current) return;
    if (!splineLoadedRef.current && !splineFailedRef.current) return;
    splashHiddenRef.current = true;
    setShowLoading(false);
    setTimeout(() => setReady(true), 100);
  }, []);

  // Called by LoadingScreen when its progress bar reaches 100% (~5s).
  const handleLoadingComplete = useCallback(() => {
    minSplashDoneRef.current = true;
    // Mobile has no 3D scene — reveal immediately.
    if (!isDesktop) {
      checkAndReveal();
    }
    // Desktop: wait for checkAndReveal to fire once spline resolves/fails.
  }, [isDesktop, checkAndReveal]);

  // Called by SplineScene once the 3D scene finished loading.
  const handleSplineLoad = useCallback(() => {
    splineLoadedRef.current = true;
    checkAndReveal();
  }, [checkAndReveal]);

  // Called by SplineScene when the 3D scene can't load at all (after
  // retries / timeout). Do NOT reveal immediately — wait for the loading
  // screen to finish so the form is also ready.
  const handleSplineFail = useCallback(() => {
    splineFailedRef.current = true;
    checkAndReveal();
  }, [checkAndReveal]);

  // Safety net — never trap the user on the splash screen.
  // 15s is generous (loading screen = 5s, 3 spline retries ≈ 8-10s max).
  useEffect(() => {
    if (!isDesktop) return;
    const t = setTimeout(() => {
      minSplashDoneRef.current = true;
      splineFailedRef.current = true;
      checkAndReveal();
    }, 15000);
    return () => clearTimeout(t);
  }, [isDesktop, checkAndReveal]);

  // ── Explorer mode (Get Started without signup) ──
  const enterExplorer = () => {
    localStorage.setItem('vayu_explorer', '1');
    window.location.reload();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (view === 'login') {
        await login(email, password);
        localStorage.removeItem('vayu_explorer');
      } else {
        await register(name, email, password);
        await login(email, password);
        localStorage.removeItem('vayu_explorer');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const d = (base: number) => (ready ? base : 999);

  // ── Mouse glow (desktop only) — TRAILING light behind cursor ──
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glowX = useSpring(mouseX, { mass: 1.4, stiffness: 50, damping: 12 });
  const glowY = useSpring(mouseY, { mass: 1.4, stiffness: 50, damping: 12 });
  const [mouseOnPage, setMouseOnPage] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const handleMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      setMouseOnPage(true);
    };
    const handleLeave = () => setMouseOnPage(false);
    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseleave', handleLeave);
    };
  }, [isDesktop, mouseX, mouseY]);

  // ═══════════════════════════════════════════════════════════════════════
  // WELCOME VIEW
  // ═══════════════════════════════════════════════════════════════════════
  const welcomeView = (
    <div className="relative backdrop-blur-2xl bg-white/[0.03] rounded-3xl border border-white/[0.06] shadow-2xl p-6 sm:p-8 md:p-10 overflow-hidden">
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(120% 90% at 12% 0%, rgba(61,156,255,0.1), rgba(255,255,255,0) 55%)',
        }} />
      </div>

      <div className="relative z-10 text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 15 }}
          transition={{ duration: 0.5, delay: d(0.3) }}
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden mx-auto mb-4 shadow-lg shadow-accent-500/20 ring-2 ring-white/10">
            <img src="/logo.png" alt="Vayu Varta" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1.5 sm:mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Vayu Varta
          </h1>
          <p className="text-sm text-white/40 mb-5 sm:mb-8">AI-Powered Weather Intelligence</p>
        </motion.div>

        {/* Features preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
          transition={{ duration: 0.5, delay: d(0.5) }}
          className="grid grid-cols-2 gap-2 sm:gap-3 mb-6 sm:mb-8"
        >
          {[
            { icon: <Cloud size={18} className="text-blue-400" />, text: 'Live Weather' },
            { icon: <Sun size={18} className="text-amber-400" />, text: '7-Day Forecast' },
            { icon: <Sparkles size={18} className="text-purple-400" />, text: 'AI Assistant' },
            { icon: <Wind size={18} className="text-cyan-400" />, text: 'Voice Chat' },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/[0.05]">
              {f.icon}
              <span className="text-xs text-white/60">{f.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Get Started button */}
        <motion.button
          onClick={enterExplorer}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
          transition={{ duration: 0.4, delay: d(0.7) }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm hover:from-accent-400 hover:to-accent-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20 mb-3"
        >
          Get Started Now
          <ArrowRight size={16} />
        </motion.button>

        <p className="text-[11px] text-white/25 mb-5">Explore without account · Sign up for full features</p>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[11px] text-white/20 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* Sign In button */}
        <motion.button
          onClick={() => { setView('login'); setError(''); }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
          transition={{ duration: 0.4, delay: d(0.8) }}
          whileHover={{ scale: 1.01 }}
          className="w-full py-2.5 sm:py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 hover:text-white/80 transition-all flex items-center justify-center gap-2"
        >
          Sign In
          <ChevronRight size={14} />
        </motion.button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // LOGIN / REGISTER FORM
  // ═══════════════════════════════════════════════════════════════════════
  const authForm = (
    <div className="relative backdrop-blur-2xl bg-white/[0.03] rounded-3xl border border-white/[0.06] shadow-2xl p-6 sm:p-8 md:p-10 overflow-hidden">
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(120% 90% at 12% 0%, rgba(61,156,255,0.1), rgba(255,255,255,0) 55%)',
        }} />
      </div>

      <div className="relative z-10">
        {/* Back button */}
        <motion.button
          onClick={() => { setView('welcome'); setError(''); setName(''); setEmail(''); setPassword(''); }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors mb-6"
        >
          ← Back
        </motion.button>

        {/* Logo + Title */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 15 }}
          transition={{ duration: 0.5, delay: d(0.3) }}
          className="text-center mb-8"
        >
          <div className="w-14 h-14 rounded-full overflow-hidden mx-auto mb-4 shadow-lg shadow-accent-500/20 ring-2 ring-white/10">
            <img src="/logo.png" alt="Vayu Varta" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
            {view === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-white/40 mt-1">
            {view === 'login' ? 'Sign in to your weather dashboard' : 'Start your weather journey'}
          </p>
        </motion.div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          {view === 'register' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
                placeholder="Your name"
              />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
            transition={{ duration: 0.4, delay: d(0.5) }}
          >
            <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
              placeholder="you@example.com"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
            transition={{ duration: 0.4, delay: d(0.6) }}
          >
            <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
              placeholder="Min 8 characters"
            />
            {view === 'login' && (
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => window.location.href = '/forgot-password'}
                  className="text-[11px] text-accent-400/70 hover:text-accent-400 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit" disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 10 }}
            transition={{ duration: 0.4, delay: d(0.7) }}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm hover:from-accent-400 hover:to-accent-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {view === 'login' ? 'Sign In' : 'Create Account'}
                <ArrowRight size={16} />
              </>
            )}
          </motion.button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[11px] text-white/20 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        <motion.button
          onClick={() => { setView(view === 'login' ? 'register' : 'login'); setError(''); }}
          className="w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors"
          whileHover={{ scale: 1.01 }}
        >
          {view === 'login' ? (
            <>Don't have an account? <span className="text-accent-400 font-medium">Sign up</span></>
          ) : (
            <>Already have an account? <span className="text-accent-400 font-medium">Sign in</span></>
          )}
        </motion.button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // DESKTOP
  // ═══════════════════════════════════════════════════════════════════════
  if (isDesktop) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-[#05070B]">
        <AnimatePresence>
          {showLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
        </AnimatePresence>

        {/* 3D Spline (left half). Mounted IMMEDIATELY — the loading screen
          (z-[100]) covers it while it warms up. The splash only fades once
          BOTH the loading screen finishes AND the scene is loaded (or gave up
          after 3 retries). No empty half, no flicker, no spinner flash. */}
        <div className="absolute top-0 left-0 z-[1] h-full w-[55%]">
          <SplineScene
            scene="/scene.splinecode"
            className="w-full h-full"
            onLoad={handleSplineLoad}
            onFail={handleSplineFail}
          />
        </div>

        <div className="absolute inset-0 z-[2] pointer-events-none" style={{
          background: 'linear-gradient(to right, transparent 0%, transparent 45%, rgba(5,7,11,0.3) 52%, rgba(5,7,11,0.8) 60%, #05070B 70%)'
        }} />
        <div className="absolute inset-0 z-[2] pointer-events-none" style={{
          background: 'linear-gradient(to bottom, rgba(5,7,11,0.4) 0%, transparent 20%, transparent 80%, rgba(5,7,11,0.4) 100%)'
        }} />

        {mouseOnPage && (
          <motion.div
            className="fixed pointer-events-none z-[4]"
            style={{ left: glowX, top: glowY, x: '-50%', y: '-50%' }}
          >
            <div className="rounded-full" style={{
              width: 700, height: 700,
              background: 'radial-gradient(circle, rgba(61,156,255,0.06) 0%, rgba(79,209,197,0.03) 30%, transparent 65%)',
              filter: 'blur(8px)',
              transform: 'translate(-50%, -50%)', position: 'absolute', left: '50%', top: '50%',
              willChange: 'transform',
            }} />
            <div className="rounded-full" style={{
              width: 350, height: 350,
              background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(79,209,197,0.06) 35%, transparent 70%)',
              filter: 'blur(4px)',
              transform: 'translate(-50%, -50%)', position: 'absolute', left: '50%', top: '50%',
              willChange: 'transform',
            }} />
          </motion.div>
        )}

        <div className="relative z-10 h-full flex items-center justify-end px-8 md:px-16 lg:px-24 pointer-events-auto">
          <motion.div
            className="w-full max-w-md flex-shrink-0 mt-12"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 40, scale: ready ? 1 : 0.95 }}
            transition={{ duration: 0.7, delay: d(0.2), ease: [0.33, 1, 0.68, 1] }}
          >
            <Spotlight className="-top-20 -left-20" size={300} />
            <AnimatePresence mode="wait">
              {view === 'welcome' ? welcomeView : authForm}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOBILE — full screen, no scrolling
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="relative w-full h-full overflow-hidden bg-[#05070B] flex flex-col">
      <AnimatePresence>
        {showLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      </AnimatePresence>

      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        background: 'linear-gradient(135deg, rgba(61,156,255,0.05) 0%, transparent 50%, rgba(125,184,232,0.03) 100%)'
      }} />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 20 }}
          transition={{ duration: 0.5, delay: d(0.2) }}
        >
          <AnimatePresence mode="wait">
            {view === 'welcome' ? welcomeView : authForm}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
