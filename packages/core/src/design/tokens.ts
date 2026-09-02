/**
 * StreamWise design tokens — the single source of truth.
 *
 * Plain data, no Tailwind and no CSS, because three renderers have to agree
 * on it: Tailwind in the web app, a Lightning theme in the WebGL build, and
 * a React Native `StyleSheet` on the TV build. Whatever reads these numbers,
 * the three apps cannot drift apart visually.
 *
 * Two rules carry most of the identity:
 *
 *  - One accent. Cobalt #5B8CFF is used for interaction *and* for AI. There
 *    is no separate "AI colour" and no rainbow gradient — intelligence is
 *    signalled by the Intelligence Node in the icon, not by hue.
 *  - Focus is a white ring, not a coloured one. On a television, viewed from
 *    three metres, a white ring plus a small scale reads instantly where a
 *    tinted glow does not.
 */

export const colors = {
  ground: {
    DEFAULT: '#0A0F1E', // page ground
    deep: '#070B16', // body / player letterbox
    lift: '#0C1226', // gradient mid-stop
  },
  surface: {
    1: '#0D1424', // cards at rest
    2: '#111A31', // raised cards, sidebar
    3: '#101729', // panels
    4: '#173066', // pressed / selected
  },
  line: {
    DEFAULT: 'rgba(255,255,255,0.08)',
    strong: 'rgba(255,255,255,0.18)',
    solid: '#1B2540',
  },
  accent: {
    DEFAULT: '#5B8CFF', // cobalt — interaction and AI alike
    bright: '#8FB0FF',
    dim: '#3A5DB8',
    deep: '#173066',
  },
  live: {
    DEFAULT: '#FF6B5E',
    deep: '#8A1E1E',
  },
  ok: {
    DEFAULT: '#4FD197',
    soft: '#7FD6B8',
  },
  warn: '#E8B54F',
  ink: {
    DEFAULT: '#E8ECF6', // primary
    soft: '#B8C1D6',
    mute: '#8A94AC', // secondary
    faint: '#69748E', // tertiary
    dim: '#526180',
  },
} as const;

export const fontFamily = {
  sans: [
    'Space Grotesk',
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
} as const;

/** The prototype is pill-heavy: chips, buttons and badges are all 999px. */
export const borderRadius = {
  pill: '999px',
  card: '18px',
  tile: '14px',
  hero: '24px',
  panel: '22px',
} as const;

/** Uppercase section labels carry wide tracking throughout. */
export const letterSpacing = {
  label: '0.14em',
  kicker: '0.28em',
  wide: '0.32em',
} as const;

/** The focus treatment, in three weights. */
export const boxShadow = {
  focus: '0 0 0 3px rgba(255,255,255,0.9)',
  'focus-strong': '0 0 0 4px rgba(255,255,255,0.9), 0 12px 48px rgba(91,140,255,0.5)',
  'focus-soft': '0 0 0 2px rgba(255,255,255,0.4)',
  'focus-accent': '0 0 0 3px rgba(91,140,255,0.4)',
  card: '0 14px 44px rgba(0,0,0,0.5)',
  lift: '0 18px 60px rgba(91,140,255,0.22)',
  hero: '0 24px 80px rgba(0,0,0,0.6)',
} as const;

/** Prototype timings, §8 of INTEGRATION.md. */
export const duration = {
  focus: '140ms',
  nav: '200ms',
  panel: '220ms',
} as const;

export const easing = {
  /** The overshoot used by every entrance. */
  entrance: 'cubic-bezier(0.22,1,0.36,1)',
} as const;

/**
 * Icon geometry. The stroke does NOT scale with the icon: 1.6 at 16px and at
 * 96px alike, 1.8 when focused. Scaling it is the single most common way to
 * make a generated icon family stop reading as one system.
 */
export const icon = {
  grid: 24,
  stroke: 1.6,
  strokeFocus: 1.8,
  linecap: 'round',
  linejoin: 'round',
} as const;

export const tokens = {
  colors,
  fontFamily,
  borderRadius,
  letterSpacing,
  boxShadow,
  duration,
  easing,
  icon,
} as const;

export type Tokens = typeof tokens;
