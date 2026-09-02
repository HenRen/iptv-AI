import { borderRadius, colors, duration, icon, letterSpacing } from '@streamwise/core';

/**
 * The StreamWise tokens as React Native styles.
 *
 * N2. An easier translation than Lightning's, and in a revealing way:
 * React Native takes `'#5B8CFF'` and `'rgba(255,255,255,0.08)'` verbatim, so
 * the colours pass straight through. What does not survive is anything with
 * a CSS unit or a CSS-only concept:
 *
 *   - every dimension is a unitless number, so `'18px'` becomes 18;
 *   - `letterSpacing` is absolute points, not `em`, so tracking has to be
 *     applied against a font size rather than handed over as a constant;
 *   - `boxShadow` does not exist. iOS takes shadowColor/Offset/Opacity/Radius
 *     and Android takes a single `elevation`, and neither can draw the ring
 *     the focus treatment is actually made of. So the ring is a border, which
 *     is what it always was.
 */

/** `'18px'`, `'140ms'`, `'0.14em'` -> the bare number. */
export function toNumber(value: string): number {
  const match = /^(-?[\d.]+)/.exec(value.trim());
  if (!match) throw new Error(`No number in ${value}`);
  return Number(match[1]);
}

/**
 * Tracking as absolute points for a given font size.
 *
 * The tokens are in `em` because that is what CSS wants and what keeps
 * tracking proportional. React Native's `letterSpacing` is absolute, so
 * handing over a converted constant would only be correct at one size —
 * hence a function, not a value.
 */
export function tracking(em: number, fontSize: number): number {
  return em * fontSize;
}

export const theme = {
  /** Verbatim: React Native parses both hex and rgba() strings. */
  colors,

  radius: {
    pill: toNumber(borderRadius.pill),
    card: toNumber(borderRadius.card),
    tile: toNumber(borderRadius.tile),
    hero: toNumber(borderRadius.hero),
    panel: toNumber(borderRadius.panel),
  },

  /** Milliseconds, for Animated and for react-native-reanimated alike. */
  duration: {
    focus: toNumber(duration.focus),
    nav: toNumber(duration.nav),
    panel: toNumber(duration.panel),
  },

  /** `em` multipliers. Pass through `tracking()` with a font size. */
  tracking: {
    label: toNumber(letterSpacing.label),
    kicker: toNumber(letterSpacing.kicker),
    wide: toNumber(letterSpacing.wide),
  },

  icon: {
    grid: icon.grid,
    stroke: icon.stroke,
    strokeFocus: icon.strokeFocus,
    linecap: icon.linecap,
    linejoin: icon.linejoin,
  },

  /**
   * The focus treatment as a border, not a shadow.
   *
   * `boxShadow.focus` is `0 0 0 3px rgba(255,255,255,0.9)` — a ring with no
   * blur, which is a border everywhere except CSS. Reaching for iOS shadows
   * and Android elevation to imitate it would produce a soft grey haze on one
   * platform and a hard drop shadow on the other, and neither is the design.
   *
   * White, not cobalt: at three metres a white ring reads instantly and a
   * tinted glow does not.
   */
  focus: {
    borderWidth: 3,
    borderWidthStrong: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    borderColorSoft: 'rgba(255,255,255,0.4)',
    scale: 1.04,
    durationMs: toNumber(duration.focus),
  },
} as const;

export type Theme = typeof theme;
