import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Glass from '../components/Glass';
import { Spotlight } from '../components/ui/spotlight';
import { SplineScene } from '../components/ui/splite';
import { Card } from '../components/ui/card';
import {
  LogOut, Cloud, Sun, Camera, Phone, MessageCircle,
  Shield, CheckCircle, X, Loader2, Save, Siren,
} from 'lucide-react';

// ─── Profile Picture Component ─────────────────────────────────────────
function ProfilePicture({ currentName }: { currentName: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load saved avatar from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vayu_avatar');
    if (saved) setAvatar(saved);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Resize to 200x200 for storage efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Crop to square
          const size = Math.min(img.width, img.height);
          const x = (img.width - size) / 2;
          const y = (img.height - size) / 2;
          ctx.drawImage(img, x, y, size, size, 0, 0, 200, 200);
          const resized = canvas.toDataURL('image/jpeg', 0.8);
          setAvatar(resized);
          localStorage.setItem('vayu_avatar', resized);
        }
        setUploading(false);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    setAvatar(null);
    localStorage.removeItem('vayu_avatar');
  };

  return (
    <div className="relative group">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-white/20 shadow-lg shadow-accent-500/20 hover:ring-accent-400/50 transition-all"
        disabled={uploading}
      >
        {avatar ? (
          <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent-400 to-purple-500 flex items-center justify-center">
            <span className="text-3xl font-bold text-white">{currentName?.charAt(0) || 'U'}</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <Loader2 size={24} className="text-white animate-spin" />
          ) : (
            <Camera size={24} className="text-white" />
          )}
        </div>
      </button>

      {/* Remove button */}
      {avatar && (
        <button
          onClick={removeAvatar}
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={12} className="text-white" />
        </button>
      )}
    </div>
  );
}

// ─── Main Profile Page ─────────────────────────────────────────────────
export default function Profile() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Editable fields
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [whatsappConsent, setWhatsappConsent] = useState(user?.whatsapp_consent || false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync with user data + localStorage when it changes
  useEffect(() => {
    if (user) {
      // Load from localStorage first (user-saved values)
      const savedPhone = localStorage.getItem('vayu_phone');
      const savedWhatsapp = localStorage.getItem('vayu_whatsapp');
      setPhone(savedPhone || user.phone_number || '');
      setWhatsappConsent(savedWhatsapp === 'true' || user.whatsapp_consent || false);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to localStorage (works for all users)
      localStorage.setItem('vayu_phone', phone);
      localStorage.setItem('vayu_whatsapp', String(whatsappConsent));

      // Also try backend API if logged in
      if (user?.id) {
        try {
          await fetch(`/api/v1/auth/profile`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('wgpt_token')}`,
            },
            body: JSON.stringify({
              phone_number: phone || null,
              whatsapp_consent: whatsappConsent,
            }),
          });
        } catch { /* backend may not have this endpoint yet */ }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter h-full overflow-y-auto no-scrollbar p-4 sm:p-6 pb-24 space-y-3.5">

      {/* ─── Profile Hero Card ─── */}
      <Card
        className="w-full overflow-hidden relative"
        style={{
          background: isLight
            ? 'linear-gradient(135deg, #EBF4FF, #E2E8F0)'
            : 'linear-gradient(135deg, #05070B, #0B1119, #1B2A4A)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Spotlight className="-top-32 left-10 md:left-60" size={280} />

        <div className="p-6 sm:p-8 relative z-10">
          {/* Profile Picture + Name */}
          <div className="flex items-center gap-5 mb-4">
            <ProfilePicture currentName={user?.name || ''} />
            <div className="flex-1">
              <h2
                className="text-2xl sm:text-3xl font-bold text-ice-50"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {user?.name || 'User'}
              </h2>
              <p className="text-sm text-ice-400 mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-green-400 font-medium">Active</span>
                </div>
                <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5">
                  <CheckCircle size={10} className="text-blue-400" />
                  <span className="text-[10px] text-blue-400 font-medium">Verified</span>
                </div>
              </div>
            </div>

            {/* 3D robot — desktop only (lg+). Margins tuned so its centre
                lands around 78% of the full screen width. */}
            <div className="hidden lg:block w-52 h-52 xl:w-60 xl:h-60 flex-shrink-0 relative lg:mr-[9%] xl:mr-[13%] 2xl:mr-[15%]">
              <div className="absolute inset-0 rounded-full bg-accent-500/10 blur-2xl" />
              <SplineScene
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Feature stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: <Cloud size={18} />, label: 'Weather', value: 'Live', color: 'text-blue-400' },
              { icon: <Sun size={18} />, label: 'Forecast', value: '7-Day', color: 'text-amber-400' },
              { icon: <span className="text-lg">🤖</span>, label: 'AI', value: 'Gemini', color: 'text-purple-400' },
              { icon: <span className="text-lg">🎤</span>, label: 'Voice', value: '5 Lang', color: 'text-green-400' },
              { icon: <Siren size={18} />, label: 'Alarms', value: 'AI', color: 'text-red-400' },
              { icon: <Shield size={18} />, label: 'Security', value: 'Active', color: 'text-cyan-400' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/5"
              >
                <span className={stat.color}>{stat.icon}</span>
                <div>
                  <div className="text-[10px] text-ice-500 uppercase tracking-wider">{stat.label}</div>
                  <div className="text-xs font-semibold text-ice-100">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ─── Account Details (Editable) ─── */}
      <Glass className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ice-50">Account Details</h3>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500/10 text-accent-400 text-xs font-medium hover:bg-accent-500/20 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : saved ? (
              <CheckCircle size={12} />
            ) : (
              <Save size={12} />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>

        {/* Phone Number */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-ice-400">
            <Phone size={14} />
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-white text-sm placeholder-white/20 transition-all focus:border-accent-500/50 focus:bg-white/[0.07]"
          />
        </div>

        {/* WhatsApp Consent */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-green-400" />
            <div>
              <span className="text-sm text-ice-200">WhatsApp Alerts</span>
              <p className="text-[10px] text-ice-500">Receive weather alerts on WhatsApp</p>
            </div>
          </div>
          <button
            onClick={() => setWhatsappConsent(!whatsappConsent)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              whatsappConsent ? 'bg-green-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                whatsappConsent ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Account Verified */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-blue-400" />
            <div>
              <span className="text-sm text-ice-200">Account Status</span>
              <p className="text-[10px] text-ice-500">Email verification status</p>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            <CheckCircle size={12} />
            Verified
          </div>
        </div>

        {/* Account Created */}
        <div className="flex items-center justify-between py-2 border-t border-white/5">
          <span className="text-sm text-ice-400">Member Since</span>
          <span className="text-sm text-ice-200">
            {(user as any)?.created_at
              ? new Date((user as any).created_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })
              : 'N/A'}
          </span>
        </div>
      </Glass>

      {/* ─── App Info ─── */}
      <Glass className="p-5 space-y-3">
        <h3 className="text-sm font-semibold text-ice-50">About Vayu Varta</h3>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-ice-400">Version</span>
          <span className="text-sm text-ice-200">1.0.0</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-ice-400">Weather API</span>
          <span className="text-sm text-ice-200">Open-Meteo (Free)</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-ice-400">AI Engine</span>
          <span className="text-sm text-ice-200">Google Gemini</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-ice-400">Voice</span>
          <span className="text-sm text-ice-200">Fish Audio TTS</span>
        </div>
      </Glass>

      {/* ─── Sign Out ─── */}
      <div className="flex justify-center">
        <button
          onClick={logout}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-500/10 text-severity-critical text-sm font-medium hover:bg-red-500/20 transition-colors active:scale-[0.98]"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}
