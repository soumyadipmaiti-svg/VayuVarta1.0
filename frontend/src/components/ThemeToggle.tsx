/**
 * ThemeToggle — Professional Dark/Light Mode Switch
 *
 * A clean toggle button with:
 *  - Sun icon for light mode
 *  - Moon icon for dark mode
 *  - Smooth spring animation on the knob
 *  - Color transition (blue for dark, amber for light)
 *  - Accessible: aria-label, keyboard support
 */

import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  // Access current theme and toggle function
  const { theme, toggle } = useTheme();

  // Determine which icon to show (opposite of current theme)
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Animated knob */}
      <div className="theme-toggle-knob">
        {isDark ? (
          <Moon size={12} className="text-white" />
        ) : (
          <Sun size={12} className="text-white" />
        )}
      </div>
    </button>
  );
}
