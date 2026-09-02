'use client';

import { useEffect, useState } from 'react';
import type { ConnectionStatus, Playlist } from '@/types';
import { usePlaylistStore } from '@/stores/playlistStore';
import { api } from '@/lib/api/client';
import { TopBar } from '@/components/navigation/TopBar';
import { SetupFlow } from '@/components/setup/SetupFlow';
import { Icon, EmptyState, ErrorNotice, Focusable, Spinner } from '@/components/common';
import { cn } from '@/lib/utils/cn';

const KIND_LABEL: Record<Playlist['kind'], string> = {
  xtream: 'Xtream Codes',
  'm3u-url': 'M3U URL',
  'm3u-file': 'Uploaded file',
  mock: 'Mock provider',
};

const STATUS_TONE: Record<ConnectionStatus, string> = {
  connected: 'text-ok',
  connecting: 'text-warn',
  offline: 'text-live',
  'auth-failed': 'text-live',
  'playlist-error': 'text-live',
  'stream-error': 'text-warn',
};

export default function PlaylistsPage() {
  const playlists = usePlaylistStore((s) => s.playlists);
  const activeId = usePlaylistStore((s) => s.activePlaylistId);
  const load = usePlaylistStore((s) => s.load);
  const setActive = usePlaylistStore((s) => s.setActive);
  const remove = usePlaylistStore((s) => s.remove);

  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.refresh(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The playlist could not be refreshed.');
    } finally {
      setBusyId(null);
    }
  };

  if (adding) {
    return (
      <>
        <TopBar title="Add Playlist" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SetupFlow mode="add" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Playlists" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-ink-mute">
              {playlists.length} playlist{playlists.length === 1 ? '' : 's'} configured
            </p>
            <Focusable
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-tile bg-accent px-4 py-2 text-sm font-semibold text-ground hover:brightness-110"
            >
              <Icon name="iptv-plus" size={16} />
              Add playlist
            </Focusable>
          </div>

          {error ? (
            <div className="mb-4">
              <ErrorNotice message={error} />
            </div>
          ) : null}

          {playlists.length === 0 ? (
            <EmptyState
              title="No playlists configured"
              description="Add an Xtream Codes account, an M3U URL, or upload a playlist file."
            />
          ) : (
            <ul className="space-y-3">
              {playlists.map((playlist) => (
                <li key={playlist.id} className="sw-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h3 className="truncate text-base font-semibold text-ink">{playlist.name}</h3>
                        {playlist.id === activeId ? (
                          <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-mute">
                        {KIND_LABEL[playlist.kind]}
                        {playlist.host ? ` · ${playlist.host}` : ''}
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-xs capitalize',
                          STATUS_TONE[playlist.status] ?? 'text-ink-mute',
                        )}
                      >
                        {playlist.status.replace('-', ' ')}
                        <span className="ml-2 text-ink-faint">
                          updated {new Date(playlist.updatedAt).toLocaleString()}
                        </span>
                      </p>
                      {playlist.lastError ? (
                        <p className="mt-2 max-w-lg text-xs leading-relaxed text-live/90">
                          {playlist.lastError}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {playlist.id !== activeId ? (
                        <Focusable
                          onClick={() => void setActive(playlist.id)}
                          className="rounded-tile border border-line px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
                        >
                          Use this
                        </Focusable>
                      ) : null}
                      <Focusable
                        onClick={() => void refresh(playlist.id)}
                        aria-label={`Refresh ${playlist.name}`}
                        className="grid h-8 w-8 place-items-center rounded-tile border border-line text-ink-mute hover:text-ink"
                      >
                        {busyId === playlist.id ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Icon name="iptv-refresh" size={14} />
                        )}
                      </Focusable>
                      <Focusable
                        onClick={() => {
                          if (confirm(`Remove "${playlist.name}"? Its stored credentials are deleted too.`)) {
                            void remove(playlist.id);
                          }
                        }}
                        aria-label={`Delete ${playlist.name}`}
                        className="grid h-8 w-8 place-items-center rounded-tile border border-line text-ink-mute hover:border-live/50 hover:text-live"
                      >
                        <Icon name="iptv-trash" size={14} />
                      </Focusable>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-5">
                    <Stat label="Channels" value={playlist.stats.channels} />
                    <Stat label="Movies" value={playlist.stats.movies} />
                    <Stat label="Series" value={playlist.stats.series} />
                    <Stat label="Categories" value={playlist.stats.categories} />
                    <Stat label="EPG entries" value={playlist.stats.epgPrograms} />
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-soft">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
