import { ICON_PATHS, LIVE_PARTS, type IconName } from './paths';
import { cn } from '@/lib/utils/cn';

export { ICON_PATHS, SIGNATURE_ICONS, PRIMITIVES, LIVE_PARTS } from './paths';
export type { IconName } from './paths';

/**
 * The one icon component.
 *
 * Stroke width is 1.6 at the master size and does NOT scale with the icon —
 * that is deliberate: a family whose stroke thickens with size stops looking
 * like one family. Focused states step to 1.8, matching the icon system's
 * `strokeFocus`.
 */
export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Slightly heavier stroke, used when the parent element has focus. */
  emphasis?: boolean;
}

export function Icon({
  name,
  size = 24,
  strokeWidth,
  emphasis,
  className,
  ...rest
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (emphasis ? 1.8 : 1.6)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/**
 * The live icon with its centre dot pulsing — used only where something is
 * genuinely on air, so the motion carries meaning rather than decoration.
 */
export function LiveIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path d={LIVE_PARTS.liveNoDot} />
      <path d={LIVE_PARTS.liveDot} className="animate-signal" />
    </svg>
  );
}
