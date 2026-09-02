import type { Config } from 'tailwindcss';
import {
  borderRadius,
  boxShadow,
  colors,
  duration,
  easing,
  fontFamily,
  letterSpacing,
} from '@streamwise/core';

/**
 * StreamWise design system, as Tailwind sees it.
 *
 * Every value here comes from `@streamwise/core/design`. This file maps them
 * onto Tailwind's theme keys and adds the web-only pieces — keyframes and
 * animations — that have no meaning on a WebGL scene graph or in a React
 * Native StyleSheet. Change a colour in core and all three apps move together.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: { sans: [...fontFamily.sans] },
      borderRadius,
      letterSpacing,
      boxShadow,
      transitionDuration: duration,
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
        'zap-in': `zapIn 240ms ${easing.entrance} both`,
        'panel-in': `panelIn 220ms ${easing.entrance} both`,
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
