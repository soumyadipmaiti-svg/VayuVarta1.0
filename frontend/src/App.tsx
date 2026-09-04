import { Component, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocProvider } from './contexts/LocContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Ambient from './components/Ambient';
import AuthPage from './pages/Auth';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AppShell from './components/AppShell';

// ─── Global Error Boundary ─────────────────────────────────────────────
// Catches ANY unhandled error and shows a recovery screen instead of white screen

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-[#05070B] text-white p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-white/50 text-sm mb-6">
              The app encountered an unexpected error. Click below to try again.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-3 rounded-xl bg-accent-500 text-white font-semibold text-sm hover:bg-accent-400 transition-colors"
            >
              Reload App
            </button>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-white/30 cursor-pointer">Error details</summary>
                <pre className="text-[11px] text-red-400/60 mt-2 overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Auth Gate ─────────────────────────────────────────────────────────

function AuthGate() {
  const { user, loading } = useAuth();
  const isExplorer = localStorage.getItem('vayu_explorer') === '1';

  // Route: /forgot-password
  if (window.location.pathname === '/forgot-password') {
    return <ForgotPassword />;
  }

  // Route: /reset-password?token=xxx
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (loading && !isExplorer) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Explorer mode: show app without login
  if (!user && isExplorer) {
    return (
      <LocProvider>
        <AppShell />
      </LocProvider>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <LocProvider>
      <AppShell />
    </LocProvider>
  );
}

// ─── App Root ──────────────────────────────────────────────────────────

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <Ambient />
            <div style={{ position: 'relative', zIndex: 10, height: '100%', width: '100%' }}>
              <AuthGate />
            </div>
          </div>
        </AuthProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
