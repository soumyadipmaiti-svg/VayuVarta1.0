import { useState, useEffect, lazy, Suspense } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import LocationSwitcher from './LocationSwitcher';
import ThemeToggle from './ThemeToggle';
import { SignupGate } from './SignupGate';
import { Dock, DockItem, DockLabel, DockIcon } from './ui/dock';
import {
  Sun, Cloud, Bot, MapPin, Settings, User, Siren,
} from 'lucide-react';

// Lazy-load all pages — only loaded when user navigates to them
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Forecast = lazy(() => import('../pages/Forecast'));
const Assistant = lazy(() => import('../pages/Assistant'));
const Locations = lazy(() => import('../pages/Locations'));
const Notifications = lazy(() => import('../pages/Notifications'));
const Profile = lazy(() => import('../pages/Profile'));
const Alarms = lazy(() => import('../pages/Alarms'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const PAGES: Record<string, React.FC> = {
  '/': Dashboard,
  '/forecast': Forecast,
  '/assistant': Assistant,
  '/alarms': Alarms,
  '/locations': Locations,
  '/notifications': Notifications,
  '/profile': Profile,
};

// Features that require signup
const GATED_ROUTES = ['/assistant', '/alarms', '/profile'];

const DOCK_ITEMS = [
  { path: '/', icon: Sun, label: 'Dashboard' },
  { path: '/forecast', icon: Cloud, label: 'Forecast' },
  { path: '/assistant', icon: Bot, label: 'VayuGPT' },
  { path: '/alarms', icon: Siren, label: 'Vayu Alert' },
  { path: '/locations', icon: MapPin, label: 'Locations' },
  { path: '/notifications', icon: Settings, label: 'Settings' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function AppShell() {
  const [page, setPage] = useState('/');
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const Page = PAGES[page] || Dashboard;

  // Explorer mode
  const [isExplorer, setIsExplorer] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    setIsExplorer(localStorage.getItem('vayu_explorer') === '1');
  }, []);

  const handleNav = (path: string) => {
    if (isExplorer && GATED_ROUTES.includes(path)) {
      setPendingRoute(path);
      setShowGate(true);
      return;
    }
    setPage(path);
  };

  const handleSignup = () => {
    localStorage.removeItem('vayu_explorer');
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary-solid)' }}>
      {/* Explorer mode banner */}
      {isExplorer && (
        <div className="bg-accent-500/10 border-b border-accent-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-accent-400 flex-shrink-0">
          <span>You're exploring as a guest</span>
          <button onClick={handleSignup} className="font-semibold underline hover:text-accent-300">
            Sign up free
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Bar */}
          <div className={`flex items-center justify-between px-6 py-3 flex-shrink-0 transition-colors ${page === '/assistant' ? 'bg-[#020208]' : ''}`}>
            <LocationSwitcher />
            <ThemeToggle />
          </div>

          {/* Page Content */}
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<PageLoader />}>
              <Page key={page} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Dock */}
      <div className={`flex-shrink-0 z-50 pb-2 md:pb-3 transition-colors ${page === '/assistant' ? 'bg-[#020208]' : ''}`}>
        <Dock
          panelHeight={56}
          magnification={80}
          distance={180}
          spring={{ mass: 0.1, stiffness: 150, damping: 12 }}
        >
          {DOCK_ITEMS.map(({ path, icon: Icon, label }) => (
            <DockItem
              key={path}
              onClick={() => handleNav(path)}
              className={page === path ? 'text-accent-400' : 'text-ice-500'}
            >
              <DockLabel>{label}</DockLabel>
              <DockIcon>
                <Icon
                  size={22}
                  className={page === path ? 'text-accent-400' : 'text-ice-500'}
                />
              </DockIcon>
            </DockItem>
          ))}
        </Dock>
      </div>

      {/* Signup gate modal */}
      <SignupGate
        show={showGate}
        onClose={() => { setShowGate(false); setPendingRoute(null); }}
        onSignup={handleSignup}
      />
    </div>
  );
}
