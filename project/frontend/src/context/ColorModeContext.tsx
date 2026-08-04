import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

/*
 * Light/dark colour mode for the logged-in app.
 *
 * This only holds and persists the preference — the `dark` class is applied by
 * the app shell (MainApp) to its own root, so dark mode is scoped to the
 * authenticated experience and never bleeds onto the marketing or auth screens.
 * The actual dark styling lives in index.css, keyed on that `.dark` ancestor.
 */

type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'colorMode';

interface ColorModeValue {
  mode: ColorMode;
  isDark: boolean;
  toggle: () => void;
  setMode: (mode: ColorMode) => void;
}

const ColorModeContext = createContext<ColorModeValue | undefined>(undefined);

/** Stored preference first, otherwise follow the OS setting. */
function initialMode(): ColorMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function persist(mode: ColorMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode / storage disabled — preference just won't survive a reload.
  }
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(initialMode);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    persist(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  return (
    <ColorModeContext.Provider
      value={{ mode, isDark: mode === 'dark', toggle, setMode }}
    >
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (ctx === undefined) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }
  return ctx;
}
