import {
  Sun, Cloud, Bot, Bell, TrendingUp, MapPin, Settings, User,
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { path: '/', icon: Sun, label: 'Dashboard' },
  { path: '/forecast', icon: Cloud, label: 'Forecast' },
  { path: '/assistant', icon: Bot, label: 'VayuGPT' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/climate', icon: TrendingUp, label: 'Climate' },
  { path: '/locations', icon: MapPin, label: 'Locations' },
  { path: '/notifications', icon: Settings, label: 'Settings' },
  { path: '/profile', icon: User, label: 'Profile' },
];

interface Props {
  current: string;
  onNav: (path: string) => void;
}

export default function Sidebar({ current, onNav }: Props) {
  return (
    <aside className="h-full flex flex-col py-4 w-[240px] px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 mb-8">          <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-accent-500/20 flex-shrink-0">
          <img
            src="/logo.png"
            alt="Vayu Varta Logo"
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <div className="text-base font-bold text-ice-50 leading-tight tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>Vayu Varta</div>
          <div className="text-[10px] text-accent-400 font-medium tracking-widest uppercase">
            AI Weather Intelligence
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1">
        {NAV.map(({ path, icon: Icon, label }) => {
          const active = current === path;
          return (
            <button
              key={path}
              onClick={() => onNav(path)}
              className={twMerge(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-white/10 text-accent-400 shadow-lg shadow-accent-500/10'
                  : 'text-ice-400 hover:bg-white/5 hover:text-ice-200',
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle + Footer */}
      <div className="px-3 mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ice-600">Theme</span>
          <ThemeToggle />
        </div>
        <div className="text-[10px] text-ice-600">Vayu Varta v1.0</div>
      </div>
    </aside>
  );
}
