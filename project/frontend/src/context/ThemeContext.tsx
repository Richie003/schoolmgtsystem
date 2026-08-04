import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { applyBrandColor, DEFAULT_BRAND } from '../utils/theme';

interface ThemeContextValue {
  brandColor: string;
  logo: string | null;
  schoolName: string;
  /** Re-theme immediately after an admin saves, without a page reload. */
  setBranding: (branding: { brand_color?: string; logo?: string | null;
    display_name?: string; name?: string }) => void;
  /** Preview a colour without persisting it — used by the settings picker. */
  previewBrandColor: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND);
  const [logo, setLogo] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');

  // Branding rides along on the user payload, so there is no extra request and
  // no flash of the default colour after login.
  useEffect(() => {
    const school = user?.school;
    if (!school) {
      setBrandColor(DEFAULT_BRAND);
      setLogo(null);
      setSchoolName('');
      applyBrandColor(DEFAULT_BRAND);
      return;
    }

    const colour = school.brand_color || DEFAULT_BRAND;
    setBrandColor(colour);
    setLogo(school.logo ?? null);
    setSchoolName(school.display_name || school.name);
    applyBrandColor(colour);
  }, [user]);

  const setBranding = useCallback(
    (branding: { brand_color?: string; logo?: string | null;
      display_name?: string; name?: string }) => {
      if (branding.brand_color) {
        setBrandColor(branding.brand_color);
        applyBrandColor(branding.brand_color);
      }
      if (branding.logo !== undefined) setLogo(branding.logo);
      if (branding.display_name !== undefined || branding.name !== undefined) {
        setSchoolName(branding.display_name || branding.name || '');
      }
    },
    [],
  );

  const previewBrandColor = useCallback(
    (hex: string | null) => applyBrandColor(hex ?? brandColor),
    [brandColor],
  );

  return (
    <ThemeContext.Provider
      value={{ brandColor, logo, schoolName, setBranding, previewBrandColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
