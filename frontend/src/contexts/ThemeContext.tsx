/**
 * ThemeContext — Dark/Light Mode Provider
 *
 * Features:
 *  1. Detects system preference (prefers-color-scheme) on first load
 *  2. Saves user choice to localStorage
 *  3. Applies theme to <html> data-theme attribute
 *  4. Smooth CSS transition between themes
 *
 * Usage:
 *  const { theme, toggle } = useTheme();
 *  // theme === 'dark' | 'light'
 *  // toggle() — switches between dark and light
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

// ── Types ──────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  /** Current theme — 'dark' or 'light' */
  theme: Theme;
  /** Toggle between dark and light */
  toggle: () => void;
  /** Set a specific theme */
  setTheme: (theme: Theme) => void;
}

// ── Storage key ────────────────────────────────────────────────────────

const STORAGE_KEY = 'vv_theme';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Get the user's system color scheme preference.
 * Returns 'dark' if prefers-color-scheme is dark, 'light' otherwise.
 */
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Read saved theme from localStorage.
 * Returns null if no choice has been saved yet.
 */
function getSavedTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return null;
}

/**
 * Determine the initial theme:
 *  1. Use saved choice from localStorage (if any)
 *  2. Otherwise, follow the system preference
 */
function getInitialTheme(): Theme {
  return getSavedTheme() ?? getSystemTheme();
}

// ── Context ────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize theme from localStorage or system preference
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply theme to <html> element and save to localStorage
  useEffect(() => {
    // Set data-theme attribute on <html>
    document.documentElement.setAttribute('data-theme', theme);

    // Set body background and text color
    if (theme === 'dark') {
      document.body.style.background = '#05070B';
      document.body.style.color = '#EAF2F8';
    } else {
      document.body.style.background = '#F0F4F8';
      document.body.style.color = '#1A202C';
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system theme changes (when user has not set a manual choice)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(event: MediaQueryListEvent) {
      // Only auto-switch if user has NOT made a manual choice
      const saved = getSavedTheme();
      if (!saved) {
        setThemeState(event.matches ? 'dark' : 'light');
      }
    }

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Toggle between dark and light
  const toggle = useCallback(function toggleTheme() {
    setThemeState(function (current) {
      return current === 'dark' ? 'light' : 'dark';
    });
  }, []);

  // Set a specific theme
  const setTheme = useCallback(function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
  }, []);

  // Build context value
  const value: ThemeContextValue = {
    theme,
    toggle,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────

/**
 * Access the current theme and toggle function.
 * Must be used inside <ThemeProvider>.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }

  return context;
}
