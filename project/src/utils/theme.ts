/**
 * Brand theming.
 *
 * An admin picks one colour. Every shade the UI needs, and the text colour that
 * sits on top of it, is *derived* from that — not configured. That is a
 * deliberate constraint: it means an admin can change the hue of the product
 * but cannot accidentally produce unreadable white-on-yellow buttons.
 *
 * The derived ramp is written to CSS custom properties, which Tailwind's
 * `brand-*` classes read (see tailwind.config.js). Changing the colour
 * re-themes every component at once, with no re-render.
 */

export const DEFAULT_BRAND = '#2563eb';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  let value = hex.trim().replace('#', '');
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Blend two colours. `amount` 0 returns `a`, 1 returns `b`. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Relative luminance, per WCAG. Used to decide whether text on the brand
 * colour should be white or near-black.
 */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** White or near-black — whichever is more readable on `background`. */
export function readableTextOn(background: Rgb): string {
  const onWhite = contrastRatio(background, WHITE);
  const onBlack = contrastRatio(background, { r: 17, g: 24, b: 39 });
  return onWhite >= onBlack ? '#ffffff' : '#111827';
}

/**
 * Build a Tailwind-style 50–950 ramp from a single mid-tone colour.
 *
 * The input is treated as the 600 step, which is where Tailwind's own default
 * blue sits — so an admin who never touches this gets exactly the original
 * look.
 */
export function buildRamp(hex: string): Record<string, string> {
  const base = hexToRgb(hex) ?? hexToRgb(DEFAULT_BRAND)!;

  const tints: Record<string, number> = {
    50: 0.95, 100: 0.9, 200: 0.75, 300: 0.6, 400: 0.35, 500: 0.15,
  };
  const shades: Record<string, number> = {
    700: 0.15, 800: 0.3, 900: 0.45, 950: 0.65,
  };

  const ramp: Record<string, string> = { 600: rgbToHex(base) };
  for (const [step, amount] of Object.entries(tints)) {
    ramp[step] = rgbToHex(mix(base, WHITE, amount));
  }
  for (const [step, amount] of Object.entries(shades)) {
    ramp[step] = rgbToHex(mix(base, BLACK, amount));
  }
  return ramp;
}

/** Write the ramp to CSS custom properties on :root. */
export function applyBrandColor(hex: string | null | undefined) {
  const colour = hex && hexToRgb(hex) ? hex : DEFAULT_BRAND;
  const ramp = buildRamp(colour);
  const root = document.documentElement;

  for (const [step, value] of Object.entries(ramp)) {
    const rgb = hexToRgb(value)!;
    // Space-separated channels so Tailwind can apply opacity modifiers,
    // e.g. bg-brand-600/50.
    root.style.setProperty(`--brand-${step}`, `${rgb.r} ${rgb.g} ${rgb.b}`);
  }

  const contrast = hexToRgb(readableTextOn(hexToRgb(colour)!))!;
  root.style.setProperty(
    '--brand-contrast', `${contrast.r} ${contrast.g} ${contrast.b}`,
  );
}
