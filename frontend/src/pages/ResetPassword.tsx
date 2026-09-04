'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Lock, CheckCircle, ArrowLeft, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';

export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenValid, setTokenValid] = useState(true);

  // Extract token from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setTokenValid(false);
    }
  }, []);

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;

    if (score <= 2) return { label: 'Weak', color: 'text-red-400', bg: 'bg-red-500', width: '33%' };
    if (score <= 3) return { label: 'Fair', color: 'text-amber-400', bg: 'bg-amber-500', width: '66%' };
    return { label: 'Strong', color: 'text-green-400', bg: 'bg-green-500', width: '100%' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  // Invalid token view
  if (!tokenValid) {
    return (
      <div className="relative w-full min-h-full overflow-auto bg-[#05070B]">
        <div className="absolute inset-0 z-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(61,156,255,0.05) 0%, transparent 50%, rgba(125,184,232,0.03) 100%)'
        }} />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 py-12">
          <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="backdrop-blur-2xl bg-white/[0.03] rounded-3xl border border-white/[0.06] shadow-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Invalid Reset Link</h2>
              <p className="text-sm text-white/50 mb-6">
                This password reset link is invalid or missing a token.
              </p>
              <motion.button
                onClick={() => window.location.href = '/forgot-password'}
                whileHover={{ scale: 1.01 }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm"
              >
                Request New Link
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-full overflow-auto bg-[#05070B]">
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        background: 'linear-gradient(135deg, rgba(61,156,255,0.05) 0%, transparent 50%, rgba(125,184,232,0.03) 100%)'
      }} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 py-12">
        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="relative backdrop-blur-2xl bg-white/[0.03] rounded-3xl border border-white/[0.06] shadow-2xl p-8 md:p-10 overflow-hidden">
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
              <div className="absolute inset-0 opacity-30" style={{
                background: 'radial-gradient(120% 90% at 12% 0%, rgba(61,156,255,0.1), rgba(255,255,255,0) 55%)',
              }} />
            </div>

            <div className="relative z-10">
              {/* Back button */}
              <motion.button
                onClick={() => window.location.href = '/'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors mb-6"
              >
                <ArrowLeft size={14} />
                Back to login
              </motion.button>

              <AnimatePresence mode="wait">
                {!success ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {/* Logo + Title */}
                    <div className="text-center mb-8">                          <div className="w-14 h-14 rounded-full overflow-hidden mx-auto mb-4 shadow-lg shadow-accent-500/20 ring-2 ring-white/10">
                        <img src="/logo.png" alt="Vayu Varta" className="w-full h-full object-cover" />
                      </div>
                      <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                        Set New Password
                      </h2>
                      <p className="text-sm text-white/40 mt-2">
                        Choose a strong password for your account
                      </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">
                          New Password
                        </label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={8}
                            className="w-full pl-11 pr-11 py-3 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
                            placeholder="Min 8 characters"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {/* Strength indicator */}
                        {newPassword && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${strength.bg} rounded-full transition-all duration-300`} style={{ width: strength.width }} />
                              </div>
                              <span className={`text-[10px] font-medium ${strength.color}`}>{strength.label}</span>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border text-white text-sm placeholder-white/20 transition-all focus:bg-white/[0.07] ${
                              confirmPassword && newPassword !== confirmPassword
                                ? 'border-red-500/50 focus:border-red-500/70'
                                : 'border-white/[0.08] focus:border-accent-500/50'
                            }`}
                            placeholder="Repeat your password"
                          />
                        </div>
                        {confirmPassword && newPassword !== confirmPassword && (
                          <p className="text-[11px] text-red-400 mt-1">Passwords do not match</p>
                        )}
                      </div>

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
                        type="submit"
                        disabled={loading || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm hover:from-accent-400 hover:to-accent-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20"
                      >
                        {loading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <>
                            Reset Password
                            <ArrowRight size={16} />
                          </>
                        )}
                      </motion.button>
                    </form>

                    <p className="text-[11px] text-white/25 text-center mt-6">
                      Password must be 8+ chars with uppercase, lowercase & number
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6"
                    >
                      <CheckCircle size={32} className="text-green-400" />
                    </motion.div>

                    <h2 className="text-xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                      Password Reset!
                    </h2>
                    <p className="text-sm text-white/50 mb-6 leading-relaxed">
                      Your password has been updated successfully.
                    </p>

                    <motion.button
                      onClick={() => window.location.href = '/'}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      Sign In with New Password
                      <ArrowRight size={16} />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
