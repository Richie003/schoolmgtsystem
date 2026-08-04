/** @type {import('tailwindcss').Config} */

/*
 * `brand-*` reads CSS custom properties that src/utils/theme.ts writes at
 * runtime from the school's chosen colour. The <alpha-value> placeholder keeps
 * opacity modifiers working, e.g. bg-brand-600/40.
 *
 * Defaults in src/index.css match Tailwind's blue-600 ramp, so a school that
 * never sets a colour looks exactly as it did before theming existed.
 */
const brand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
    step,
    `rgb(var(--brand-${step}) / <alpha-value>)`,
  ]),
);

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Dark mode is toggled by a `.dark` class the app shell puts on its own root,
  // so it only affects the logged-in experience (see src/index.css).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          ...brand,
          DEFAULT: 'rgb(var(--brand-600) / <alpha-value>)',
          // Readable text colour for use on a brand-coloured surface.
          contrast: 'rgb(var(--brand-contrast) / <alpha-value>)',
        },
      },
      // Motion for the public marketing pages. Decorative loops (float, blob,
      // gradient) are switched off under prefers-reduced-motion in index.css.
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(24px, -32px) scale(1.1)' },
          '66%': { transform: 'translate(-18px, 18px) scale(0.94)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s ease-out both',
        'fade-in': 'fade-in 0.9s ease-out both',
        float: 'float 6s ease-in-out infinite',
        blob: 'blob 20s ease-in-out infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
      },
    },
  },
  plugins: [],
};
