'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Mail, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      // Even on error, show success to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full min-h-full overflow-auto bg-[#05070B]">
      {/* Background gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        background: 'linear-gradient(135deg, rgba(61,156,255,0.05) 0%, transparent 50%, rgba(125,184,232,0.03) 100%)'
      }} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 py-12">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative backdrop-blur-2xl bg-white/[0.03] rounded-3xl border border-white/[0.06] shadow-2xl p-8 md:p-10 overflow-hidden">
            {/* Background glow */}
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
                {!sent ? (
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
                        Forgot Password?
                      </h2>
                      <p className="text-sm text-white/40 mt-2">
                        Enter your email and we'll send you a reset link
                      </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5 block">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
                            placeholder="you@example.com"
                            autoFocus
                          />
                        </div>
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
                        disabled={loading || !email}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-sm hover:from-accent-400 hover:to-accent-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20"
                      >
                        {loading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <>
                            Send Reset Link
                            <ArrowRight size={16} />
                          </>
                        )}
                      </motion.button>
                    </form>

                    <p className="text-[11px] text-white/25 text-center mt-6">
                      The link will expire in 5 minutes
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
                      Check Your Email
                    </h2>
                    <p className="text-sm text-white/50 mb-6 leading-relaxed">
                      We've sent a password reset link to<br />
                      <span className="text-white/80 font-medium">{email}</span>
                    </p>
                    <p className="text-xs text-white/30 mb-6">
                      The link expires in <span className="text-amber-400">5 minutes</span>.<br />
                      Check your spam folder if you don't see it.
                    </p>

                    <motion.button
                      onClick={() => { setSent(false); setEmail(''); }}
                      whileHover={{ scale: 1.01 }}
                      className="w-full py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 hover:text-white/80 transition-all"
                    >
                      Try a different email
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
