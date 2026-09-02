'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/icons';
import { useAiStore } from '@/stores/aiStore';

/**
 * Left navigation: 72px collapsed, 244px expanded on hover or focus, 200ms.
 *
 * Collapsed is the resting state because on a 10-foot screen the labels are
 * noise once the icons are learned — but they must be there the first time,
 * and for anyone who does not learn them. Expansion is width-only, so nothing
 * in the content area reflows when it happens.
 */

interface NavEntry {
  href: string;
  label: string;
  icon: IconName;
}

const PRIMARY: NavEntry[] = [
  { href: '/home', label: 'Home', icon: 'iptv-home' },
  { href: '/live', label: 'Live TV', icon: 'iptv-live' },
  { href: '/guide', label: 'Guide', icon: 'iptv-guide' },
  { href: '/movies', label: 'Movies', icon: 'iptv-movies' },
  { href: '/series', label: 'Series', icon: 'iptv-series' },
  { href: '/sports', label: 'Sports', icon: 'iptv-sports' },
];

const SECONDARY: NavEntry[] = [
  { href: '/search', label: 'Search', icon: 'iptv-search' },
  { href: '/favorites', label: 'Favorites', icon: 'iptv-favorites' },
  { href: '/settings', label: 'Settings', icon: 'iptv-settings' },
];

export const SIDEBAR_COLLAPSED = 72;
export const SIDEBAR_EXPANDED = 244;

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const openAssistant = useAiStore((s) => s.openAssistant);
  const aiEnabled = useAiStore((s) => s.prefs.enabled);

  return (
    <nav
      aria-label="Main"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false);
      }}
      className={cn(
        'z-40 hidden h-full shrink-0 flex-col justify-between border-r border-line bg-surface-2/70 py-5 backdrop-blur-xl md:flex',
        'transition-[width] duration-nav ease-out',
      )}
      style={{ width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED }}
    >
      <div>
        <div className="mb-8 flex h-10 items-center gap-4 px-6">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent text-[13px] font-bold text-ground">
            S
          </span>
          <span
            className={cn(
              'whitespace-nowrap text-[16px] font-bold tracking-[0.12em] transition-opacity duration-nav',
              expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            STREAMWISE
          </span>
        </div>

        <ul className="space-y-1 px-3">
          {PRIMARY.map((item) => (
            <NavItem key={item.href} {...item} expanded={expanded} pathname={pathname} />
          ))}

          {aiEnabled ? (
            <li>
              <button
                type="button"
                data-focusable=""
                onClick={openAssistant}
                title={expanded ? undefined : 'Ask AI'}
                className={cn(
                  'tv-focus flex h-12 w-full items-center gap-4 rounded-tile px-[15px] text-accent',
                  'hover:bg-accent/10 focus:shadow-focus',
                )}
              >
                <Icon name="iptv-ask-tv" size={22} />
                <span
                  className={cn(
                    'whitespace-nowrap text-[15px] font-semibold uppercase tracking-label transition-opacity duration-nav',
                    expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
                  )}
                >
                  Ask AI
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      </div>

      <ul className="space-y-1 border-t border-line px-3 pt-4">
        {SECONDARY.map((item) => (
          <NavItem key={item.href} {...item} expanded={expanded} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon,
  expanded,
  pathname,
}: NavEntry & { expanded: boolean; pathname: string }) {
  const active = pathname === href || (href !== '/settings' && pathname.startsWith(`${href}/`));

  return (
    <li>
      <Link
        href={href}
        data-focusable=""
        aria-current={active ? 'page' : undefined}
        title={expanded ? undefined : label}
        className={cn(
          'tv-focus group relative flex h-12 items-center gap-4 rounded-tile px-[15px] focus:shadow-focus',
          active ? 'bg-accent/12 text-accent' : 'text-ink-mute hover:bg-white/[0.05] hover:text-ink',
        )}
      >
        {/* Active rail marker — reads at distance where a tint alone would not. */}
        {active ? (
          <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-pill bg-accent" />
        ) : null}
        <Icon name={icon} size={22} emphasis={active} />
        <span
          className={cn(
            'whitespace-nowrap text-[15px] font-semibold uppercase tracking-label transition-opacity duration-nav',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

/** Mobile navigation — a different component, not a squeezed sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const items: NavEntry[] = [
    PRIMARY[0],
    PRIMARY[1],
    PRIMARY[2],
    PRIMARY[5],
    SECONDARY[0],
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {items.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            data-focusable=""
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-label',
              active ? 'text-accent' : 'text-ink-mute',
            )}
          >
            <Icon name={icon} size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
