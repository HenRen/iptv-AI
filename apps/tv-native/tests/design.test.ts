import { describe, expect, it } from 'vitest';
import { ICON_PATHS, borderRadius, colors, duration, icon } from '@streamwise/core';
import { theme, toNumber, tracking } from '../src/theme';
import { iconNames, iconProps, liveIconParts } from '../src/icons';

/**
 * The theme and the icon adapter are translations of core, and these keep
 * them translations.
 *
 * The failure guarded against is drift: a colour nudged here because it looks
 * better on a television, the web app left on the old one, and two visibly
 * different products a year later. Every expected value below is derived from
 * `@streamwise/core`, so a token changed on main either flows through or
 * fails here.
 */

describe('the theme does not drift from core', () => {
  it('passes colours through verbatim — React Native parses them as-is', () => {
    expect(theme.colors).toBe(colors);
    expect(theme.colors.accent.DEFAULT).toBe('#5B8CFF');
  });

  it('keeps the single accent rule: interaction and AI are one colour', () => {
    // The identity, not decoration. A second "AI colour" in one app and not
    // the other is exactly the drift this guards.
    expect(theme.colors.accent.DEFAULT).toBe(colors.accent.DEFAULT);
  });

  it('converts every dimension to a unitless number', () => {
    expect(theme.radius.card).toBe(toNumber(borderRadius.card));
    expect(theme.radius.pill).toBe(toNumber(borderRadius.pill));
    expect(theme.duration.focus).toBe(toNumber(duration.focus));
    for (const value of Object.values(theme.radius)) expect(Number.isFinite(value)).toBe(true);
    for (const value of Object.values(theme.duration)) expect(Number.isFinite(value)).toBe(true);
  });

  it('keeps focus a white border rather than a shadow', () => {
    // boxShadow.focus is `0 0 0 3px rgba(255,255,255,0.9)` — no blur, so it
    // is a border everywhere except CSS. Imitating it with iOS shadows and
    // Android elevation gives a grey haze on one and a drop shadow on the
    // other, and neither is the design.
    expect(theme.focus.borderColor).toBe('rgba(255,255,255,0.9)');
    expect(theme.focus.borderWidth).toBe(3);
    expect(theme.focus.borderColor).not.toBe(theme.colors.accent.DEFAULT);
  });

  it('does not hand over tracking as a constant', () => {
    // React Native's letterSpacing is absolute, so an em token converted once
    // would only be right at one font size.
    expect(theme.tracking.label).toBe(0.14);
    expect(tracking(theme.tracking.label, 13)).toBeCloseTo(1.82);
    expect(tracking(theme.tracking.label, 26)).toBeCloseTo(3.64);
  });
});

describe('iconProps', () => {
  it('renders the same path string the web app does', () => {
    // The whole reason the icon family ports for free.
    expect(iconProps('iptv-home').d).toBe(ICON_PATHS['iptv-home']);
  });

  it('covers the entire family', () => {
    expect(iconNames.length).toBe(Object.keys(ICON_PATHS).length);
    for (const name of iconNames) {
      const props = iconProps(name);
      expect(props.d.length).toBeGreaterThan(0);
      expect(props.d.startsWith('M')).toBe(true);
    }
  });

  it('holds the rendered stroke at 1.6 whatever the size', () => {
    // The rule that makes a generated family read as one family. The viewBox
    // scales by size/24, so the strokeWidth has to be divided by the same
    // factor — passing the raw token is the bug.
    for (const size of [16, 24, 48, 96]) {
      const props = iconProps('iptv-live', { size });
      const rendered = (props.strokeWidth * size) / icon.grid;
      expect(rendered).toBeCloseTo(icon.stroke);
    }
  });

  it('steps to 1.8 on focus, and only then', () => {
    for (const size of [24, 96]) {
      const focused = iconProps('iptv-live', { size, emphasis: true });
      expect((focused.strokeWidth * size) / icon.grid).toBeCloseTo(icon.strokeFocus);
      const resting = iconProps('iptv-live', { size });
      expect((resting.strokeWidth * size) / icon.grid).toBeCloseTo(icon.stroke);
    }
  });

  it('uses round caps and joins, and never fills', () => {
    const props = iconProps('iptv-search');
    expect(props.strokeLinecap).toBe('round');
    expect(props.strokeLinejoin).toBe('round');
    expect(props.fill).toBe('none');
  });

  it('keeps the 24-unit master grid in the viewBox', () => {
    expect(iconProps('iptv-home', { size: 96 }).viewBox).toBe(`0 0 ${icon.grid} ${icon.grid}`);
  });

  it('refuses an unknown icon rather than rendering nothing', () => {
    expect(() => iconProps('iptv-not-a-real-icon' as never)).toThrow(/No such icon/);
  });
});

describe('liveIconParts', () => {
  it('splits the on-air dot from the frame so only the dot can pulse', () => {
    // Animating the whole glyph's opacity fades the frame too, which reads as
    // the icon vanishing rather than as an on-air indicator.
    const { frame, dot } = liveIconParts();
    expect(frame.d).not.toContain(dot);
    expect(frame.d + dot).toBe(ICON_PATHS['iptv-live']);
  });
});
