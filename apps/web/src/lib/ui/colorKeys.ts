/**
 * Remote colour keys (§5.12 tab 7, §4 of INTEGRATION.md).
 *
 * The mapping is data, not hard-coded handlers, because Settings → Remote &
 * Controls lets the user reassign each key. Everything the keys can be bound
 * to lives in `COLOR_KEY_ACTIONS` — the same closed-allowlist discipline the
 * AI layer uses, for the same reason: a key should never be able to trigger
 * something the app cannot name.
 */

export const COLOR_KEY_ACTIONS = {
  home: { label: 'Home', href: '/home' },
  live: { label: 'Live TV', href: '/live' },
  guide: { label: 'Guide', href: '/guide' },
  movies: { label: 'Movies', href: '/movies' },
  series: { label: 'Series', href: '/series' },
  sports: { label: 'Sports', href: '/sports' },
  favorites: { label: 'Favorites', href: '/favorites' },
  search: { label: 'Search', href: '/search' },
  settings: { label: 'Settings', href: '/settings' },
  /** Not a route — opens the Ask TV panel over whatever is on screen. */
  askTv: { label: 'Ask TV', href: null },
} as const;

export type ColorKeyAction = keyof typeof COLOR_KEY_ACTIONS;

export type ColorKey = 'red' | 'green' | 'yellow' | 'blue';

export const COLOR_KEY_HEX: Record<ColorKey, string> = {
  red: '#FF6B5E',
  green: '#4FD197',
  yellow: '#E8B54F',
  blue: '#5B8CFF',
};

/** Defaults from PROTOTYPE.md §Remote: R → Live, G → Guide, Y → Favorites, B → Ask TV. */
export const DEFAULT_COLOR_KEYS: Record<ColorKey, ColorKeyAction> = {
  red: 'live',
  green: 'guide',
  yellow: 'favorites',
  blue: 'askTv',
};

export const COLOR_KEY_ORDER: ColorKey[] = ['red', 'green', 'yellow', 'blue'];

/** Keyboard letters that stand in for the physical colour buttons. */
export const KEY_LETTER: Record<string, ColorKey> = {
  r: 'red',
  g: 'green',
  y: 'yellow',
  b: 'blue',
};

export function isColorKeyAction(value: unknown): value is ColorKeyAction {
  return typeof value === 'string' && value in COLOR_KEY_ACTIONS;
}
