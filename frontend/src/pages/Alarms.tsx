/**
 * Vayu Alert — AI Weather Alarm System
 *
 * Real-time weather monitoring using Open-Meteo data.
 * Detects: Cyclone, Flash Flood, Heatwave, Cold Wave, Severe Storm,
 *          High Wind, Heavy Rain, UV Danger
 * Shows full-screen alarm for CRITICAL conditions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoc } from '../contexts/LocContext';
import { useTheme } from '../contexts/ThemeContext';
import Glass from '../components/Glass';
import {
  Shield, Clock, CheckCircle,
  MapPin, ChevronDown, ChevronUp, Volume2, VolumeX,
  Zap, Eye, Siren, FlaskConical, X as XIcon,
  RefreshCw, CloudRain, Thermometer, Wind, AlertTriangle,
} from 'lucide-react';
import { useWeatherAlarms, type WeatherAlarm, type WeatherSnapshot } from '../hooks/useWeatherAlarms';

// ─── Severity Config ───────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  WATCH: {
    label: 'Watch',
    icon: '🟡',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
  },
  WARNING: {
    label: 'Warning',
    icon: '🟠',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  CRITICAL: {
    label: 'Critical',
    icon: '🔴',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
};

// ─── Countdown Timer ───────────────────────────────────────────────────────

function CountdownTimer({ minutes, severity }: { minutes: number; severity: string }) {
  const [remaining, setRemaining] = useState(minutes * 60);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.WATCH;

  if (remaining <= 0) {
    return (
      <div className={`flex items-center gap-2 ${config.color} font-bold`}>
        <Siren size={16} className="animate-pulse" />
        <span>IMMINENT</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${config.color}`}>
      <Clock size={16} />
      <div className="font-mono text-lg font-bold tracking-wider">
        {hours > 0 && <span>{String(hours).padStart(2, '0')}:</span>}
        <span>{String(mins).padStart(2, '0')}</span>
        <span className="animate-pulse">:</span>
        <span>{String(secs).padStart(2, '0')}</span>
      </div>
      <span className="text-xs opacity-70">until onset</span>
    </div>
  );
}

// ─── Risk Score Bar ────────────────────────────────────────────────────────

function RiskScoreBar({ score, severity }: { score: number; severity: string }) {
  const color = score >= 60 ? '#EF4444' : score >= 35 ? '#F97316' : '#EAB308';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
      <span className={`text-xs font-bold ${SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG]?.color || 'text-ice-400'}`}>
        {score}/100
      </span>
    </div>
  );
}

// ─── Safety Guidance Panel ─────────────────────────────────────────────────

function SafetyPanel({ guidance, isVisible, onToggle }: {
  guidance: string;
  isVisible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-ice-400 hover:text-accent-400 transition-colors"
      >
        <Shield size={14} />
        <span>Safety Guidance</span>
        {isVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-4 rounded-xl bg-green-500/5 border border-green-500/10">
              {guidance.split('\n').map((line, i) => (
                <p key={i} className="text-xs text-ice-300 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Full-Screen Critical Alarm ────────────────────────────────────────────

function CriticalAlarmOverlay({ alarm, onDismiss }: {
  alarm: WeatherAlarm;
  onDismiss: () => void;
}) {
  const [pulse, setPulse] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const vibIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sirenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setPulse((p) => !p), 1000);
    return () => clearInterval(interval);
  }, []);

  // Nuclear siren — 90 seconds
  useEffect(() => {
    let stopped = false;
    function startSiren() {
      try {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 300;
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.value = 150;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.0;
        masterGainRef.current = masterGain;
        const gain2 = ctx.createGain();
        gain2.gain.value = 0.25;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        filter.Q.value = 2;

        const waveshaper = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1;
          curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
        }
        waveshaper.curve = curve;
        waveshaper.oversample = '4x';

        osc.connect(filter);
        osc2.connect(gain2);
        gain2.connect(filter);
        filter.connect(waveshaper);
        waveshaper.connect(masterGain);
        masterGain.connect(ctx.destination);

        osc.start();
        osc2.start();

        const DURATION = 90;
        const start = ctx.currentTime;
        masterGain.gain.setValueAtTime(0, start);
        masterGain.gain.linearRampToValueAtTime(0.7, start + 0.5);

        const CYCLE = 5.5, UP = 2, HOLD = 1, DOWN = 2, LO = 180, HI = 900;
        for (let t = 0.5; t < DURATION; t += CYCLE) {
          osc.frequency.setValueAtTime(LO, start + t);
          osc.frequency.linearRampToValueAtTime(HI, start + t + UP);
          osc2.frequency.setValueAtTime(LO / 2, start + t);
          osc2.frequency.linearRampToValueAtTime(HI / 2, start + t + UP);
          osc.frequency.setValueAtTime(HI, start + t + UP);
          osc2.frequency.setValueAtTime(HI / 2, start + t + UP);
          osc.frequency.setValueAtTime(HI, start + t + UP + HOLD);
          osc.frequency.linearRampToValueAtTime(LO, start + t + UP + HOLD + DOWN);
          osc2.frequency.setValueAtTime(HI / 2, start + t + UP + HOLD);
          osc2.frequency.linearRampToValueAtTime(LO / 2, start + t + UP + HOLD + DOWN);
        }

        masterGain.gain.setValueAtTime(0.7, start + DURATION - 2);
        masterGain.gain.linearRampToValueAtTime(0, start + DURATION);

        sirenTimeoutRef.current = setTimeout(() => {
          if (stopped) return;
          stopped = true;
          try { osc.stop(); osc2.stop(); ctx.close(); } catch {}
        }, DURATION * 1000 + 500);
      } catch {}
    }
    startSiren();
    return () => {
      stopped = true;
      if (sirenTimeoutRef.current) clearTimeout(sirenTimeoutRef.current);
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  // Vibrate
  useEffect(() => {
    if (!navigator.vibrate) return;
    const pattern = [800, 200, 800, 200, 800, 400];
    navigator.vibrate(pattern);
    vibIntervalRef.current = setInterval(() => navigator.vibrate(pattern), 3000);
    return () => {
      if (vibIntervalRef.current) clearInterval(vibIntervalRef.current);
      navigator.vibrate(0);
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
        masterGainRef.current.gain.setValueAtTime(next ? 0 : 0.7, audioCtxRef.current.currentTime);
      }
      if (next) {
        navigator.vibrate(0);
        if (vibIntervalRef.current) clearInterval(vibIntervalRef.current);
      } else {
        const pattern = [800, 200, 800, 200, 800, 400];
        navigator.vibrate(pattern);
        vibIntervalRef.current = setInterval(() => navigator.vibrate(pattern), 3000);
      }
      return next;
    });
  }, []);

  const config = SEVERITY_CONFIG[alarm.severity];

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: pulse
            ? 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.1) 50%, #05070B 100%)'
            : 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 50%, #05070B 100%)',
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Mute + Close buttons */}
        <div className="absolute -top-2 right-0 sm:right-4 flex items-center gap-2 z-20">
          {muted && (
            <span className="text-xs text-white/50 whitespace-nowrap">Sound muted</span>
          )}
          <motion.button
            onClick={toggleMute}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-colors"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </motion.button>
          <motion.button
            onClick={onDismiss}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-red-500/30 hover:border-red-500/40 transition-colors"
            title="Close alarm"
          >
            <XIcon size={22} />
          </motion.button>
        </div>

        <motion.div
          className="text-7xl mb-6"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          {alarm.patternIcon}
        </motion.div>

        <div className={`inline-flex items-center gap-2 ${config.bg} border ${config.border} rounded-full px-4 py-2 mb-4`}>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className={`${config.color} text-sm font-bold uppercase tracking-wider`}>
            {config.icon} {config.label} Alert
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{alarm.patternName}</h1>
        <p className="text-white/60 text-sm mb-6">{alarm.factors[0] || 'Dangerous conditions detected'}</p>

        {alarm.countdownMinutes > 0 && (
          <div className="mb-6">
            <CountdownTimer minutes={alarm.countdownMinutes} severity={alarm.severity} />
          </div>
        )}

        <div className="mb-6 max-w-xs mx-auto">
          <RiskScoreBar score={alarm.riskScore} severity={alarm.severity} />
        </div>

        <div className="text-left bg-white/5 rounded-xl p-4 mb-6">
          <p className="text-xs text-ice-500 uppercase tracking-wider mb-2">Risk Factors</p>
          {alarm.factors.map((f, i) => (
            <p key={i} className="text-sm text-ice-300 flex items-center gap-2">
              <Zap size={12} className="text-amber-400 flex-shrink-0" />
              {f}
            </p>
          ))}
        </div>

        <motion.button
          onClick={onDismiss}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 rounded-2xl bg-red-500 text-white font-bold text-lg shadow-lg shadow-red-500/30 hover:bg-red-400 transition-colors"
        >
          <div className="flex items-center gap-3">
            <CheckCircle size={20} />
            <span>Acknowledge Alert</span>
          </div>
        </motion.button>

        <p className="text-white/30 text-xs mt-4">
          Tap to dismiss • Stay safe and follow local authority instructions
        </p>
      </div>
    </motion.div>
  );
}

// ─── Alarm Card ─────────────────────────────────────────────────────────────

function AlarmCard({ alarm, onDismiss }: { alarm: WeatherAlarm; onDismiss: () => void }) {
  const [showSafety, setShowSafety] = useState(false);
  const config = SEVERITY_CONFIG[alarm.severity] || SEVERITY_CONFIG.WATCH;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border ${config.border} ${config.bg} p-5`}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${config.color.replace('text-', 'bg-')}`} />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{alarm.patternIcon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>
                {config.icon} {config.label}
              </span>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            </div>
            <h3 className="text-base font-semibold text-ice-50 mt-0.5">{alarm.patternName}</h3>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-ice-400 hover:text-accent-400 transition-all"
          title="Dismiss"
        >
          <CheckCircle size={16} />
        </button>
      </div>

      <div className="mb-3">
        <RiskScoreBar score={alarm.riskScore} severity={alarm.severity} />
      </div>

      {alarm.countdownMinutes > 0 && (
        <div className="mb-3 p-3 rounded-xl bg-black/20">
          <CountdownTimer minutes={alarm.countdownMinutes} severity={alarm.severity} />
        </div>
      )}

      <div className="space-y-1 mb-3">
        {alarm.factors.map((f, i) => (
          <p key={i} className="text-xs text-ice-400 flex items-center gap-1.5">
            <Zap size={10} className="text-amber-400/60 flex-shrink-0" />
            {f}
          </p>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-ice-500 mb-3">
        <Eye size={11} />
        <span>AI Confidence: {alarm.confidence}%</span>
      </div>

      <SafetyPanel
        guidance={alarm.safetyGuidance}
        isVisible={showSafety}
        onToggle={() => setShowSafety(!showSafety)}
      />

      <div className="text-[10px] text-ice-600 mt-3">
        Detected: {new Date(alarm.detectedAt).toLocaleString()}
      </div>
    </motion.div>
  );
}

// ─── Weather Status Card ───────────────────────────────────────────────────

function WeatherStatusCard({ weather, locationName }: { weather: WeatherSnapshot; locationName: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ice-50 flex items-center gap-2">
          <CloudRain size={14} className="text-accent-400" />
          Current Weather — {locationName}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-2 rounded-lg bg-white/5">
          <Thermometer size={16} className="mx-auto mb-1 text-orange-400" />
          <div className="text-lg font-bold text-ice-50">{weather.tempC.toFixed(1)}°C</div>
          <div className="text-[10px] text-ice-500">Feels {weather.feelsLikeC.toFixed(1)}°C</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <Wind size={16} className="mx-auto mb-1 text-blue-400" />
          <div className="text-lg font-bold text-ice-50">{weather.windKph.toFixed(0)}</div>
          <div className="text-[10px] text-ice-500">km/h wind</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <CloudRain size={16} className="mx-auto mb-1 text-cyan-400" />
          <div className="text-lg font-bold text-ice-50">{weather.rainMm.toFixed(1)}</div>
          <div className="text-[10px] text-ice-500">mm rain</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <AlertTriangle size={16} className="mx-auto mb-1 text-yellow-400" />
          <div className="text-lg font-bold text-ice-50">{weather.uvIndex.toFixed(0)}</div>
          <div className="text-[10px] text-ice-500">UV index</div>
        </div>
      </div>
      <p className="text-xs text-ice-500 text-center mt-2">{weather.description}</p>
    </Glass>
  );
}

// ─── Main Alarms Page ──────────────────────────────────────────────────────

export default function Alarms() {
  const { activeId, locations } = useLoc();
  const { theme } = useTheme();

  const activeLoc = locations.find((l: any) => l.location_id === activeId || l.id === activeId);
  const lat = activeLoc?.latitude ?? null;
  const lon = activeLoc?.longitude ?? null;
  const locName = activeLoc?.name || 'Select a location';

  const {
    alarms, weather, loading, lastChecked,
    criticalAlarm, dismissCritical, acknowledgeAlarm, recheck,
  } = useWeatherAlarms(lat, lon, locName);

  const [testMode, setTestMode] = useState(false);

  // Test alarm (fake, frontend only)
  const handleTestAlarm = () => {
    setTestMode(true);
    const testPatterns = [
      { key: 'cyclone', name: 'Cyclone / Tropical Storm', icon: '🌀', score: 85, factors: ['Extreme wind: 130 km/h', 'Very low pressure: 975 hPa', 'Active thunderstorm conditions'], countdown: 30, safety: '1. Stay indoors away from windows\n2. Stock emergency supplies\n3. Follow local disaster authority\n4. Avoid coastal areas\n5. Keep phone charged' },
      { key: 'flash_flood', name: 'Flash Flood Risk', icon: '🌊', score: 72, factors: ['Extreme rainfall: 55.2mm', 'Heavy rain code active', 'Forecast: 80mm in 24h'], countdown: 20, safety: '1. Move to higher ground\n2. Do NOT walk through flood water\n3. Disconnect electrical appliances\n4. Keep emergency kit ready\n5. Monitor local flood warnings' },
      { key: 'severe_storm', name: 'Severe Thunderstorm', icon: '⛈️', score: 68, factors: ['Extreme thunderstorm with hail', 'Dangerous wind: 95 km/h', 'Lightning strike risk very high'], countdown: 15, safety: '1. Stay indoors away from windows\n2. Unplug electronics\n3. Avoid landline phones during lightning\n4. Do NOT shelter under trees\n5. Move vehicles away from trees' },
      { key: 'heatwave', name: 'Extreme Heat / Heatwave', icon: '🔥', score: 75, factors: ['Extreme heat index: 52°C', 'Extreme temperature: 44°C', 'UV index: 11 (extreme)'], countdown: 0, safety: '1. Stay hydrated\n2. Avoid outdoor activity 11am–4pm\n3. Use sunscreen, wear light clothing\n4. Check on elderly neighbors\n5. Know heatstroke signs: dizziness, nausea' },
    ];
    const p = testPatterns[Math.floor(Math.random() * testPatterns.length)];
    const now = new Date();
    const alarm: WeatherAlarm = {
      id: 'test-' + Date.now(),
      patternKey: p.key,
      patternName: p.name,
      patternIcon: p.icon,
      severity: 'CRITICAL',
      riskScore: p.score,
      confidence: 94,
      factors: p.factors,
      countdownMinutes: p.countdown,
      onsetTime: p.countdown > 0 ? new Date(now.getTime() + p.countdown * 60000).toISOString() : null,
      safetyGuidance: p.safety,
      detectedAt: now.toISOString(),
    };
    dismissCritical();
    // Short delay so the dismiss clears, then set new alarm
    setTimeout(() => {
      // We inject it by temporarily overriding
      const event = new CustomEvent('test-alarm', { detail: alarm });
      window.dispatchEvent(event);
    }, 100);
    setTestMode(false);
  };

  // Listen for test alarm events
  const [injectedAlarm, setInjectedAlarm] = useState<WeatherAlarm | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const alarm = (e as CustomEvent).detail as WeatherAlarm;
      setInjectedAlarm(alarm);
    };
    window.addEventListener('test-alarm', handler);
    return () => window.removeEventListener('test-alarm', handler);
  }, []);

  const displayCritical = criticalAlarm || injectedAlarm;
  const displayAlarms = injectedAlarm
    ? [injectedAlarm, ...alarms]
    : alarms;

  const activeAlarms = displayAlarms;
  const criticalCount = activeAlarms.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = activeAlarms.filter((a) => a.severity === 'WARNING').length;

  const handleDismiss = useCallback(() => {
    dismissCritical();
    setInjectedAlarm(null);
  }, [dismissCritical]);

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-6">
      {/* Full-screen critical alarm */}
      <AnimatePresence>
        {displayCritical && (
          <CriticalAlarmOverlay alarm={displayCritical} onDismiss={handleDismiss} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ice-50 flex items-center gap-2">
            <Siren size={24} className="text-red-400" />
            Vayu Alert
          </h1>
          <p className="text-sm text-ice-400 mt-1">
            Real-Time Weather Monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleTestAlarm}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors text-xs font-medium"
          >
            <FlaskConical size={14} />
            Test Alarm
          </motion.button>
          <button
            onClick={() => recheck()}
            className="p-2 rounded-lg bg-white/5 text-ice-400 hover:text-accent-400 transition-colors"
            title="Check now"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <Glass className="p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
          <div className="text-[10px] text-ice-500 uppercase tracking-wider">Critical</div>
        </Glass>
        <Glass className="p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">{warningCount}</div>
          <div className="text-[10px] text-ice-500 uppercase tracking-wider">Warnings</div>
        </Glass>
        <Glass className="p-3 text-center">
          <div className="text-2xl font-bold text-ice-200">{activeAlarms.length}</div>
          <div className="text-[10px] text-ice-500 uppercase tracking-wider">Active</div>
        </Glass>
      </div>

      {/* Current weather */}
      {weather && (
        <WeatherStatusCard weather={weather} locationName={locName} />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Active alarms */}
      {!loading && activeAlarms.length === 0 && (
        <Glass className="p-8 text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h3 className="text-lg font-semibold text-ice-50 mb-1">All Clear</h3>
          <p className="text-sm text-ice-400">
            No dangerous weather conditions detected. AI monitors your location every 5 minutes.
          </p>
          {lastChecked && (
            <p className="text-xs text-ice-600 mt-2">
              Last checked: {lastChecked.toLocaleTimeString()}
            </p>
          )}
        </Glass>
      )}

      {!loading && activeAlarms.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-ice-400 uppercase tracking-wider">
            Detected Risks ({activeAlarms.length})
          </h3>
          {activeAlarms.map((alarm) => (
            <AlarmCard
              key={alarm.id}
              alarm={alarm}
              onDismiss={() => {
                if (alarm.id.startsWith('test-')) {
                  setInjectedAlarm(null);
                } else {
                  acknowledgeAlarm(alarm.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-[11px] text-ice-600 pb-4">
        {lastChecked && <span>Last scan: {lastChecked.toLocaleTimeString()} • </span>}
        Checks every 5 min • Data from Open-Meteo
      </div>
    </div>
  );
}
