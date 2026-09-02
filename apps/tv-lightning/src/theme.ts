import { borderRadius, colors, duration, icon, letterSpacing } from '@streamwise/core';

/**
 * The StreamWise tokens, in the units Lightning actually wants.
 *
 * L2. Nothing here invents a value — every number is derived from
 * `@streamwise/core/design`, so a colour changed on main moves the web app
 * and this one together. What it does is translate, and the translation is
 * not cosmetic:
 *
 *   - Lightning colours are 0xAARRGGBB integers, alpha *first*. The tokens
 *     are CSS: `#5B8CFF` and `rgba(255,255,255,0.08)`.
 *   - There is no CSS engine, so `'18px'` and `'140ms'` have to become 18
 *     and 140.
 *   - `boxShadow` has no equivalent at all. A WebGL scene graph does not
 *     blur a rectangle for free, so the focus treatment is rebuilt from its
 *     parts rather than translated, and that is recorded here rather than
 *     silently dropped.
 */

/** `#RGB`, `#RRGGBB`, `#RRGGBBAA` or `rgba(r,g,b,a)` -> 0xAARRGGBB. */
export function toLightningColor(css: string): number {
  const value = css.trim();

  // Signs allowed: CSS treats out-of-range channels and alpha as valid and
  // clamps them, and a converter that threw where a browser clamps would
  // disagree with the web app about the same token.
  const rgba =
    /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i.exec(
      value,
    );
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return pack(Number(r), Number(g), Number(b), a === undefined ? 1 : Number(a));
  }

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('');
    }
    if (digits.length !== 6 && digits.length !== 8) {
      throw new Error(`Not a colour this understands: ${css}`);
    }
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return pack(r, g, b, a);
  }

  throw new Error(`Not a colour this understands: ${css}`);
}

const clamp = (value: number, max: number) => Math.round(Math.max(0, Math.min(max, value)));

function pack(r: number, g: number, b: number, a: number): number {
  const alpha = clamp(Math.max(0, Math.min(1, a)) * 255, 255);
  const [red, green, blue] = [clamp(r, 255), clamp(g, 255), clamp(b, 255)];
  // `>>> 0` because the top bit of a full-alpha colour makes a signed 32-bit
  // integer negative, and Lightning wants the unsigned value.
  return ((alpha << 24) | (red << 16) | (green << 8) | blue) >>> 0;
}

/** `'18px'`, `'140ms'`, `'0.14em'` -> the bare number. */
export function toNumber(value: string): number {
  const match = /^(-?[\d.]+)/.exec(value.trim());
  if (!match) throw new Error(`No number in ${value}`);
  return Number(match[1]);
}

type Leaves<T> = { [K in keyof T]: T[K] extends string ? number : Leaves<T[K]> };

function mapColors<T extends Record<string, unknown>>(source: T): Leaves<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] =
      typeof value === 'string'
        ? toLightningColor(value)
        : mapColors(value as Record<string, unknown>);
  }
  return out as Leaves<T>;
}

export const theme = {
  colors: mapColors(colors),

  radius: {
    pill: toNumber(borderRadius.pill),
    card: toNumber(borderRadius.card),
    tile: toNumber(borderRadius.tile),
    hero: toNumber(borderRadius.hero),
    panel: toNumber(borderRadius.panel),
  },

  /** Milliseconds, which is what Lightning transitions take. */
  duration: {
    focus: toNumber(duration.focus),
    nav: toNumber(duration.nav),
    panel: toNumber(duration.panel),
  },

  /**
   * An em multiplier, not pixels: Lightning wants absolute letter spacing,
   * so a caller multiplies by its own font size rather than being handed a
   * value that is only correct at one size.
   */
  tracking: {
    label: toNumber(letterSpacing.label),
    kicker: toNumber(letterSpacing.kicker),
    wide: toNumber(letterSpacing.wide),
  },

  icon: {
    grid: icon.grid,
    stroke: icon.stroke,
    strokeFocus: icon.strokeFocus,
  },

  /**
   * The focus treatment, rebuilt rather than translated.
   *
   * `boxShadow.focus` is `0 0 0 3px rgba(255,255,255,0.9)` — a ring, which in
   * a scene graph is a rectangle with a border, not a shadow. The glow in
   * `focus-strong` has no cheap equivalent at all and is dropped on purpose:
   * a blurred sprite per focusable is exactly the kind of thing that costs
   * frames on a 2019 set. White ring plus scale is the identity anyway.
   */
  focus: {
    ringWidth: 3,
    ringWidthStrong: 4,
    ringColor: toLightningColor('rgba(255,255,255,0.9)'),
    ringColorSoft: toLightningColor('rgba(255,255,255,0.4)'),
    scale: 1.04,
    durationMs: toNumber(duration.focus),
  },
} as const;

export type Theme = typeof theme;
