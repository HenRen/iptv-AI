import type { Config } from 'tailwindcss';

/**
 * HENREN IPTV design system.
 *
 * A television interface, not a SaaS dashboard: near-black navy ground,
 * slightly lifted surfaces, one electric-blue accent used sparingly and
 * almost exclusively to communicate *focus*.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: {
          DEFAULT: '#05070d', // page background
          deep: '#020307', // player letterbox / fullscreen
        },
        surface: {
          1: '#0b0f1a', // cards at rest
          2: '#121826', // raised cards, sidebar
          3: '#1a2233', // hover
          4: '#232d42', // pressed / selected row
        },
        line: {
          DEFAULT: '#1e2739',
          strong: '#2c3850',
        },
        accent: {
          DEFAULT: '#2f7dff', // electric blue
          bright: '#5c9dff',
          dim: '#1b4fa8',
          glow: '#2f7dff',
        },
        live: '#ff3b52',
        ok: '#2fd07f',
        warn: '#ffb02e',
        ink: {
          DEFAULT: '#ffffff',
          soft: '#c3cbdb',
          mute: '#8792a8',
          faint: '#5a6478',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-app)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '0.875rem',
        tile: '0.625rem',
      },
      boxShadow: {
        card: '0 8px 24px -12px rgba(0,0,0,0.9)',
        lift: '0 18px 48px -18px rgba(0,0,0,0.95)',
        focus: '0 0 0 2px #2f7dff, 0 0 28px -4px rgba(47,125,255,0.55)',
      },
      transitionDuration: {
        // TV interaction budget: fast enough that a remote press feels direct.
        DEFAULT: '180ms',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
