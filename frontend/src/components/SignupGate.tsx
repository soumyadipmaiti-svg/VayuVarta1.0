"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Sparkles } from "lucide-react";

interface SignupGateProps {
  show: boolean;
  onClose: () => void;
  onSignup: () => void;
}

export function SignupGate({ show, onClose, onSignup }: SignupGateProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-sm bg-[#0B1119] rounded-2xl border border-white/[0.08] shadow-2xl p-6 text-center"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 text-white/30 hover:text-white/60 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={24} className="text-accent-400" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">Sign up to continue</h3>
            <p className="text-sm text-white/40 mb-6">
              Create a free account to unlock VayuGPT, weather alarms, voice chat, and more!
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {[
                { icon: '🤖', text: 'VayuGPT AI' },
                { icon: '🚨', text: 'Weather Alarms' },
                { icon: '🎤', text: 'Voice Chat' },
                { icon: '📊', text: 'Full Forecast' },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2 text-xs text-white/50">
                  <span>{f.icon}</span> {f.text}
                </div>
              ))}
            </div>

            {/* Buttons */}
            <button
              onClick={onSignup}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20 mb-2"
            >
              <Sparkles size={14} />
              Sign Up Free
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm text-white/30 hover:text-white/50 transition-colors"
            >
              Maybe later
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
