import { ICON_PATHS, LIVE_PARTS, icon, type IconName } from '@streamwise/core';

/**
 * N3. The icon family, for `react-native-svg`.
 *
 * This is the cheapest task on the branch and the reason is worth stating:
 * the icon system is a *generator*, not sixty-nine drawn files. It composes
 * SVG path strings from three primitives, and a path string is not a web
 * format — `react-native-svg` renders exactly the same `d` attribute that
 * the browser does. So the design language ports without being redrawn, and
 * without a single asset in the repository.
 *
 * What this module adds is only the props around the path, and the one rule
 * that is easy to get wrong:
 *
 *   **the stroke does not scale with the icon.** 1.6 at 24px and at 96px
 *   alike, 1.8 on focus. A family whose stroke thickens with size stops
 *   reading as one family, and `react-native-svg` will happily scale it if
 *   the viewBox is left to do the work.
 */

export interface SvgIconProps {
  /** Straight onto `<Svg>`. */
  width: number;
  height: number;
  viewBox: string;
  /** Straight onto `<Path>`. */
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
}

export interface IconOptions {
  size?: number;
  color?: string;
  /** Slightly heavier stroke, for when the parent has focus. */
  emphasis?: boolean;
}

export function iconProps(name: IconName, options: IconOptions = {}): SvgIconProps {
  const { size = icon.grid, color = 'currentColor', emphasis = false } = options;
  const d = ICON_PATHS[name];
  if (d === undefined) throw new Error(`No such icon: ${String(name)}`);

  return {
    width: size,
    height: size,
    viewBox: `0 0 ${icon.grid} ${icon.grid}`,
    d,
    stroke: color,
    // Compensated for the viewBox scale, so the rendered stroke is 1.6 device
    // units at every size. Passing the raw token here is the bug: the SVG
    // transform would multiply it by size/24 and the family would drift apart
    // between the 24px sidebar and the 96px reference screen.
    strokeWidth: ((emphasis ? icon.strokeFocus : icon.stroke) * icon.grid) / size,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };
}

/**
 * The live icon in two pieces, so the dot can pulse on its own.
 *
 * Animating the whole glyph's opacity would fade the frame too, which reads
 * as the icon disappearing rather than as an on-air indicator.
 */
export function liveIconParts(options: IconOptions = {}): {
  frame: SvgIconProps;
  dot: string;
} {
  const base = iconProps('iptv-live', options);
  return { frame: { ...base, d: LIVE_PARTS.liveNoDot }, dot: LIVE_PARTS.liveDot };
}

export const iconNames = Object.keys(ICON_PATHS) as IconName[];
