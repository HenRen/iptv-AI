'use client';

import type { Category } from '@/types';
import { cn } from '@/lib/utils/cn';
import { Focusable, Skeleton } from '@/components/common';

export const ALL_CATEGORY = '__all__';
export const FAVORITES_CATEGORY = '__favorites__';
export const RECENT_CATEGORY = '__recent__';

/**
 * Category navigation for Live TV.
 *
 * Favorites, Recent and All are pinned above the provider's own categories:
 * they are the three a returning user reaches for, and a provider list of 180
 * categories buries anything not at the top.
 */
export function CategoryRail({
  categories,
  loading,
  selected,
  onSelect,
  favoritesCount,
  recentCount,
  totalCount,
}: {
  categories: Category[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
  favoritesCount: number;
  recentCount: number;
  totalCount: number;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <nav aria-label="Channel categories" className="h-full overflow-y-auto py-3">
      <ul className="space-y-0.5 px-2">
        {favoritesCount > 0 ? (
          <CategoryItem
            label="Favorites"
            count={favoritesCount}
            active={selected === FAVORITES_CATEGORY}
            onSelect={() => onSelect(FAVORITES_CATEGORY)}
          />
        ) : null}
        {recentCount > 0 ? (
          <CategoryItem
            label="Recent"
            count={recentCount}
            active={selected === RECENT_CATEGORY}
            onSelect={() => onSelect(RECENT_CATEGORY)}
          />
        ) : null}
        <CategoryItem
          label="All Channels"
          count={totalCount}
          active={selected === ALL_CATEGORY}
          onSelect={() => onSelect(ALL_CATEGORY)}
        />

        {categories.length > 0 ? (
          <li aria-hidden className="my-2 border-t border-line/60" />
        ) : null}

        {categories.map((category) => (
          <CategoryItem
            key={category.id}
            label={category.name}
            count={category.count || undefined}
            active={selected === category.id}
            onSelect={() => onSelect(category.id)}
          />
        ))}
      </ul>
    </nav>
  );
}

function CategoryItem({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <Focusable
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-tile px-3 py-2',
          active ? 'bg-accent/15 text-accent' : 'text-ink-mute hover:bg-surface-3 hover:text-ink',
        )}
      >
        <span className="truncate text-[13px] font-medium uppercase tracking-wide">{label}</span>
        {count != null ? (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
            {count.toLocaleString()}
          </span>
        ) : null}
      </Focusable>
    </li>
  );
}
