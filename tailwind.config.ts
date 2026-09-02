import type { Config } from 'tailwindcss';

/**
 * StreamWise design system.
 *
 * Taken from `IPTV AI Prototype.dc.html` and `PROTOTYPE.md` §16. Two rules
 * carry most of the identity:
 *
 *  - One accent. Cobalt #5B8CFF is used for interaction *and* for AI. There
 *    is no separate "AI colour" and no rainbow gradient — intelligence is
 *    signalled by the Intelligence Node in the icon, not by hue.
 *  - Focus is a white ring, not a coloured one. On a television, viewed from
 *    three metres, a white ring plus a small scale reads instantly where a
 *    tinted glow does not.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: [
          'Space Grotesk',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        // The prototype is pill-heavy: chips, buttons and badges are all 999px.
        pill: '999px',
        card: '18px',
        tile: '14px',
        hero: '24px',
        panel: '22px',
      },
      letterSpacing: {
        // Uppercase section labels carry wide tracking throughout.
        label: '0.14em',
        kicker: '0.28em',
        wide: '0.32em',
      },
      boxShadow: {
        // The focus treatment, in three weights.
        focus: '0 0 0 3px rgba(255,255,255,0.9)',
        'focus-strong': '0 0 0 4px rgba(255,255,255,0.9), 0 12px 48px rgba(91,140,255,0.5)',
        'focus-soft': '0 0 0 2px rgba(255,255,255,0.4)',
        'focus-accent': '0 0 0 3px rgba(91,140,255,0.4)',
        card: '0 14px 44px rgba(0,0,0,0.5)',
        lift: '0 18px 60px rgba(91,140,255,0.22)',
        hero: '0 24px 80px rgba(0,0,0,0.6)',
      },
      transitionDuration: {
        // Prototype timings, §8 of INTEGRATION.md.
        focus: '140ms',
        nav: '200ms',
        panel: '220ms',
      },
      keyframes: {
        zapIn: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        panelIn: {
          from: { opacity: '0', transform: 'translateX(40px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        signal: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        spinX: { to: { transform: 'rotate(360deg)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'zap-in': 'zapIn 240ms cubic-bezier(0.22,1,0.36,1) both',
        'panel-in': 'panelIn 220ms cubic-bezier(0.22,1,0.36,1) both',
        signal: 'signal 1.6s ease-in-out infinite',
        'spin-x': 'spinX 0.9s linear infinite',
        'fade-in': 'fadeIn 180ms ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
