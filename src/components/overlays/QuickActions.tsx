'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Channel } from '@/types';
import { api } from '@/lib/api/client';
import { useUiStore, type QuickActionTarget } from '@/stores/uiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { cn } from '@/lib/utils/cn';
import { Artwork, Focusable, Icon } from '@/components/common';
import type { IconName } from '@/components/icons';
import { timeRange } from '@/lib/utils/time';

/**
 * Quick Actions (PROTOTYPE.md §13) — raised by long-pressing OK on a channel
 * or programme, or by the ⋯ button on a row.
 *
 * It exists because a remote has no right-click: everything secondary a user
 * might want to do with the thing under the cursor has to live somewhere, and
 * burying it in a submenu costs more presses than the action is worth.
 */

interface ActionItem {
  label: string;
  icon: IconName;
  run: () => void;
  tone?: 'default' | 'danger';
}

export function QuickActions() {
  const router = useRouter();
  const target = useUiStore((s) => s.quickAction);
  const close = useUiStore((s) => s.closeQuickAction);
  const showError = useUiStore((s) => s.showError);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const toggleFavorite = useUserStore((s) => s.toggleFavorite);
  const isFavorite = useUserStore((s) => s.isFavorite);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close]);

  const watchChannel = async (channelId: string) => {
    const page = await api.channelsByIds([channelId]);
    const channel: Channel | undefined = page.items[0];
    if (!channel) return;
    pushRecentChannel(channel.id);
    await playChannel(channel, { mode: 'fullscreen' });
  };

  const items = useMemo<ActionItem[]>(() => {
    if (!target) return [];

    if (target.kind === 'channel') {
      const favorited = isFavorite('channel', target.id);
      return [
        {
          label: 'Watch',
          icon: 'iptv-play',
          run: () => {
            void watchChannel(target.id);
            close();
          },
        },
        {
          label: 'Guide',
          icon: 'iptv-guide',
          run: () => {
            router.push(`/guide?channel=${encodeURIComponent(target.id)}`);
            close();
          },
        },
        {
          label: favorited ? 'Remove favorite' : 'Favorite',
          icon: 'iptv-favorite',
          run: () => {
            toggleFavorite('channel', target.id);
            close();
          },
        },
        {
          label: 'Channel info',
          icon: 'iptv-info',
          run: () => {
            router.push(`/live?info=${encodeURIComponent(target.id)}`);
            close();
          },
        },
        {
          label: 'Hide channel',
          icon: 'iptv-parental',
          run: () => {
            router.push('/settings/parental');
            close();
          },
        },
        {
          label: 'Report stream issue',
          icon: 'iptv-health',
          tone: 'danger',
          run: () => {
            close();
            showError('stream');
          },
        },
      ];
    }

    const favorited = isFavorite('channel', target.channelId);
    return [
      {
        label: 'Watch',
        icon: 'iptv-play',
        run: () => {
          void watchChannel(target.channelId);
          close();
        },
      },
      {
        label: 'Info',
        icon: 'iptv-info',
        run: () => {
          router.push(`/guide?program=${encodeURIComponent(target.id)}`);
          close();
        },
      },
      {
        label: favorited ? 'Remove favorite' : 'Favorite channel',
        icon: 'iptv-favorite',
        run: () => {
          toggleFavorite('channel', target.channelId);
          close();
        },
      },
      {
        label: 'Remind me',
        icon: 'iptv-reminder',
        run: () => {
          router.push('/settings/ai');
          close();
        },
      },
      {
        label: 'More like this',
        icon: 'iptv-ai-recs',
        run: () => {
          router.push(`/search?q=${encodeURIComponent(target.title)}`);
          close();
        },
      },
      {
        label: 'Hide',
        icon: 'iptv-parental',
        tone: 'danger',
        run: () => {
          router.push('/settings/parental');
          close();
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, isFavorite, close, router, toggleFavorite, showError]);

  if (!target) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick actions"
      onClick={close}
      className="fixed inset-0 z-[70] grid place-items-center bg-ground-deep/85 p-8 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-panel border border-line bg-surface-2 shadow-card animate-zap-in"
      >
        <QuickActionHeader target={target} />

        <ul className="p-2">
          {items.map((item) => (
            <li key={item.label}>
              <Focusable
                onClick={item.run}
                className={cn(
                  'flex w-full items-center gap-4 rounded-tile px-4 py-3',
                  item.tone === 'danger'
                    ? 'text-live hover:bg-live/10'
                    : 'text-ink-soft hover:bg-white/[0.06] hover:text-ink',
                )}
              >
                <Icon name={item.icon} size={20} />
                <span className="text-[15px] font-medium">{item.label}</span>
              </Focusable>
            </li>
          ))}
        </ul>

        <p className="border-t border-line px-5 py-3 text-[11px] uppercase tracking-label text-ink-dim">
          Back to close
        </p>
      </div>
    </div>
  );
}

function QuickActionHeader({ target }: { target: QuickActionTarget }) {
  return (
    <div className="flex items-center gap-4 border-b border-line p-5">
      <span className="grid h-14 w-[74px] shrink-0 place-items-center overflow-hidden rounded-tile bg-surface-1">
        <Artwork
          src={target.kind === 'channel' ? target.logo : null}
          alt={target.title}
          kind="channel"
          className="h-full w-full text-sm"
          imgClassName="object-contain p-1.5"
        />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {target.kind === 'channel' && target.number ? (
            <span className="text-[15px] font-bold tabular-nums text-accent">{target.number}</span>
          ) : null}
          <h2 className="truncate text-[17px] font-semibold text-ink">{target.title}</h2>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-mute">
          {target.kind === 'program' && target.start && target.stop
            ? timeRange(target.start, target.stop)
            : (target.subtitle ?? 'No guide information')}
        </p>
      </div>
    </div>
  );
}
