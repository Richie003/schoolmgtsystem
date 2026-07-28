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
    },
  },
  plugins: [],
};
