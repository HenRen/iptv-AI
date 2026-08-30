'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Clapperboard,
  Heart,
  Home,
  LayoutGrid,
  ListVideo,
  MonitorPlay,
  Search,
  Settings,
  Tv,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Compact-by-default left navigation that expands on focus or hover.
 *
 * Compact is the resting state because on a 10-foot screen the labels are
 * noise once you know the icons — but they must be there the first time, and
 * for anyone who does not. Expansion is width-only so nothing reflows.
 */

const PRIMARY = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/live', label: 'Live TV', icon: Tv },
  { href: '/guide', label: 'Guide', icon: LayoutGrid },
  { href: '/movies', label: 'Movies', icon: Clapperboard },
  { href: '/series', label: 'Series', icon: MonitorPlay },
  { href: '/favorites', label: 'Favorites', icon: Heart },
  { href: '/search', label: 'Search', icon: Search },
];

const SECONDARY = [
  { href: '/settings/playlists', label: 'Playlists', icon: ListVideo },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

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
        'z-30 hidden h-full shrink-0 flex-col justify-between border-r border-line bg-surface-2/70 py-4 backdrop-blur-xl md:flex',
        'transition-[width] duration-200 ease-out',
        expanded ? 'w-52' : 'w-[68px]',
      )}
    >
      <div>
        <div className="mb-6 flex h-9 items-center gap-3 px-[22px]">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-accent text-[11px] font-bold text-white">
            H
          </span>
          <span
            className={cn(
              'whitespace-nowrap text-sm font-semibold tracking-tight transition-opacity',
              expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            HENREN
          </span>
        </div>
        <ul className="space-y-1 px-3">
          {PRIMARY.map((item) => (
            <NavItem key={item.href} {...item} expanded={expanded} pathname={pathname} />
          ))}
        </ul>
      </div>

      <ul className="space-y-1 px-3">
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
  icon: Icon,
  expanded,
  pathname,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  expanded: boolean;
  pathname: string;
}) {
  const active = pathname === href || (href !== '/settings' && pathname.startsWith(`${href}/`));
  return (
    <li>
      <Link
        href={href}
        data-focusable=""
        aria-current={active ? 'page' : undefined}
        title={expanded ? undefined : label}
        className={cn(
          'tv-focus group flex h-11 items-center gap-3 rounded-tile px-[14px]',
          'focus:shadow-focus',
          active ? 'bg-accent/15 text-accent' : 'text-ink-mute hover:bg-surface-3 hover:text-ink',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span
          className={cn(
            'whitespace-nowrap text-sm transition-opacity duration-150',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

/** Mobile navigation. Deliberately a different component, not a squeezed sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const items = PRIMARY.filter((i) =>
    ['/home', '/live', '/guide', '/movies', '/search'].includes(i.href),
  );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            data-focusable=""
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium',
              active ? 'text-accent' : 'text-ink-mute',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
