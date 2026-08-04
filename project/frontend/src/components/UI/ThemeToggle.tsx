import { Moon, Sun } from 'lucide-react';
import { useColorMode } from '../../context/ColorModeContext';

/**
 * Light/dark toggle for screens that aren't inside the app shell (sign in,
 * register, account setup). Its own colours use grey utilities, so it adapts
 * automatically when its `.dark` ancestor is present.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggle } = useColorMode();
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${className}`}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
