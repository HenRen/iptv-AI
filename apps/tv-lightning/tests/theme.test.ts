import { describe, expect, it } from 'vitest';
import { borderRadius, colors, duration, icon } from '@streamwise/core';
import { theme, toLightningColor, toNumber } from '../src/theme';

/**
 * The theme is a translation of core's tokens, and these tests exist to keep
 * it one.
 *
 * The failure this guards against is drift: someone tweaks a cobalt here
 * because it looks better on a television, the web app keeps the old one,
 * and six months later the two apps are visibly different products. Every
 * assertion below derives its expected value from `@streamwise/core` rather
 * than restating a literal, so a token changed on main either flows through
 * or fails here.
 */

describe('toLightningColor', () => {
  it('packs to 0xAARRGGBB, alpha first', () => {
    expect(toLightningColor('#5B8CFF')).toBe(0xff5b8cff);
    expect(toLightningColor('#000000')).toBe(0xff000000);
    expect(toLightningColor('#FFFFFF')).toBe(0xffffffff);
  });

  it('never returns a negative number', () => {
    // (0xff << 24) is negative in signed 32-bit arithmetic, and Lightning
    // wants the unsigned value. This is the bug the `>>> 0` prevents.
    for (const css of Object.values(colors.ink)) {
      expect(toLightningColor(css)).toBeGreaterThan(0);
    }
    expect(toLightningColor('#FFFFFF')).toBeGreaterThan(0);
  });

  it('converts rgba(), which is how the line colours are written', () => {
    expect(toLightningColor('rgba(255,255,255,0.08)')).toBe(0x14ffffff);
    expect(toLightningColor('rgba(255,255,255,0.18)')).toBe(0x2effffff);
    expect(toLightningColor('rgba(0,0,0,1)')).toBe(0xff000000);
    expect(toLightningColor('rgb(91,140,255)')).toBe(0xff5b8cff);
  });

  it('expands shorthand hex', () => {
    expect(toLightningColor('#fff')).toBe(toLightningColor('#ffffff'));
    expect(toLightningColor('#f00')).toBe(0xffff0000);
  });

  it('reads an 8-digit hex alpha', () => {
    expect(toLightningColor('#5B8CFF80')).toBe(0x805b8cff);
  });

  it('clamps rather than wrapping, as a browser does', () => {
    expect(toLightningColor('rgba(0,0,0,5)')).toBe(0xff000000);
    expect(toLightningColor('rgba(0,0,0,-1)')).toBe(0x00000000);
    expect(toLightningColor('rgba(300,-20,0,1)')).toBe(0xffff0000);
  });

  it('refuses anything it does not understand instead of guessing', () => {
    for (const bad of ['cobalt', '', '#12345', 'rgb()', 'hsl(200,50%,50%)']) {
      expect(() => toLightningColor(bad)).toThrow();
    }
  });
});

describe('toNumber', () => {
  it('strips the unit', () => {
    expect(toNumber('18px')).toBe(18);
    expect(toNumber('999px')).toBe(999);
    expect(toNumber('140ms')).toBe(140);
    expect(toNumber('0.14em')).toBe(0.14);
  });

  it('throws rather than returning NaN', () => {
    expect(() => toNumber('auto')).toThrow();
  });
});

describe('the theme does not drift from core', () => {
  it('carries every colour, converted', () => {
    expect(theme.colors.accent.DEFAULT).toBe(toLightningColor(colors.accent.DEFAULT));
    expect(theme.colors.ground.deep).toBe(toLightningColor(colors.ground.deep));
    expect(theme.colors.surface[1]).toBe(toLightningColor(colors.surface[1]));
    expect(theme.colors.line.DEFAULT).toBe(toLightningColor(colors.line.DEFAULT));
    expect(theme.colors.warn).toBe(toLightningColor(colors.warn));
  });

  it('has a converted entry for every colour token, with none left behind', () => {
    const countLeaves = (value: unknown): number =>
      typeof value === 'object' && value !== null
        ? Object.values(value).reduce<number>((n, v) => n + countLeaves(v), 0)
        : 1;
    expect(countLeaves(theme.colors)).toBe(countLeaves(colors));
  });

  it('keeps the single accent rule: interaction and AI are the same colour', () => {
    // Not decoration — it is the identity. A second "AI colour" appearing in
    // one app and not the other is exactly the drift this guards.
    expect(theme.colors.accent.DEFAULT).toBe(0xff5b8cff);
  });

  it('carries radius and duration as numbers', () => {
    expect(theme.radius.card).toBe(toNumber(borderRadius.card));
    expect(theme.radius.pill).toBe(toNumber(borderRadius.pill));
    expect(theme.duration.focus).toBe(toNumber(duration.focus));
    expect(theme.focus.durationMs).toBe(toNumber(duration.focus));
  });

  it('does not scale the icon stroke with size', () => {
    // The one rule that makes a generated icon family read as one family.
    expect(theme.icon.stroke).toBe(icon.stroke);
    expect(theme.icon.strokeFocus).toBe(icon.strokeFocus);
    expect(theme.icon.stroke).toBe(1.6);
    expect(theme.icon.strokeFocus).toBe(1.8);
  });

  it('keeps focus white, not coloured', () => {
    // At three metres a white ring reads and a tinted glow does not.
    expect(theme.focus.ringColor).toBe(toLightningColor('rgba(255,255,255,0.9)'));
    expect(theme.focus.ringColor).not.toBe(theme.colors.accent.DEFAULT);
  });
});
