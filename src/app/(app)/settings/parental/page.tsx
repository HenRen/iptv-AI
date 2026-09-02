'use client';

import { useEffect, useState } from 'react';
import type { Category } from '@/types';
import { api } from '@/lib/api/client';
import { useParentalStore } from '@/stores/parentalStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { TopBar } from '@/components/navigation/TopBar';
import { Icon, ErrorNotice, Focusable, Skeleton } from '@/components/common';
import { cn } from '@/lib/utils/cn';

/**
 * §18 — Parental control.
 *
 * Honest about what it is: a local convenience lock. It is stated in the UI
 * rather than implied away, because a parent who believes this is tamper-proof
 * is worse off than one who knows it is not.
 */
export default function ParentalPage() {
  const playlist = usePlaylistStore((s) => s.active());
  const playlistId = playlist?.id ?? '';

  const pinHash = useParentalStore((s) => s.pinHash);
  const unlocked = useParentalStore((s) => s.unlocked);
  const allowAdult = useParentalStore((s) => s.allowAdult);
  const setPin = useParentalStore((s) => s.setPin);
  const clearPin = useParentalStore((s) => s.clearPin);
  const verify = useParentalStore((s) => s.verify);
  const lock = useParentalStore((s) => s.lock);
  const setAllowAdult = useParentalStore((s) => s.setAllowAdult);
  const toggleCategory = useParentalStore((s) => s.toggleCategory);
  const hiddenFor = useParentalStore((s) => s.hiddenFor);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.categories('live'), api.categories('movie')])
      .then(([live, movie]) => {
        if (!cancelled) setCategories([...live.categories, ...movie.categories]);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const hidden = hiddenFor(playlistId);
  const locked = Boolean(pinHash) && !unlocked;

  const submitPin = async () => {
    setMessage(null);
    if (!/^\d{4,8}$/.test(pinInput)) {
      setMessage('Use 4 to 8 digits.');
      return;
    }
    if (!pinHash) {
      await setPin(pinInput);
      setMessage('PIN set. Adult content stays hidden until you allow it below.');
    } else if (unlocked) {
      const ok = await clearPin(pinInput);
      setMessage(ok ? 'PIN removed.' : 'That PIN is not correct.');
    } else {
      const ok = await verify(pinInput);
      setMessage(ok ? 'Unlocked for this session.' : 'That PIN is not correct.');
    }
    setPinInput('');
  };

  return (
    <>
      <TopBar title="Parental control" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
          <p className="flex items-start gap-2 rounded-card border border-warn/25 bg-warn/5 p-4 text-xs leading-relaxed text-ink-mute">
            <Icon name="iptv-parental" size={16} className="mt-0.5 shrink-0 text-warn" />
            <span>
              This is a convenience lock for a shared living room, not a security boundary. The PIN
              is stored as a hash in this browser and anyone with developer tools can bypass it.
              Adult-classified content is filtered on the server by default, before it is sent here.
            </span>
          </p>

          <section>
            <SectionTitle>PIN</SectionTitle>
            <div className="sw-card space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm">
                {locked ? (
                  <Icon name="iptv-parental" size={16} className="text-warn" />
                ) : (
                  <Icon name="iptv-parental" size={16} className="text-ok" />
                )}
                <span className="text-ink">
                  {!pinHash
                    ? 'No PIN set'
                    : locked
                      ? 'Locked'
                      : 'Unlocked for this session'}
                </span>
                {pinHash && unlocked ? (
                  <Focusable
                    onClick={lock}
                    className="ml-auto rounded-tile border border-line px-3 py-1 text-xs text-ink-mute hover:text-ink"
                  >
                    Lock now
                  </Focusable>
                ) : null}
              </div>

              <div className="flex gap-2">
                <input
                  data-focusable=""
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={!pinHash ? 'Choose a PIN' : locked ? 'Enter PIN to unlock' : 'Enter PIN to remove'}
                  aria-label="Parental control PIN"
                  className="flex-1 rounded-tile border border-line bg-surface-1 px-3 py-2 text-sm tracking-[0.4em] text-ink placeholder:tracking-normal placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
                />
                <button
                  type="button"
                  data-focusable=""
                  onClick={() => void submitPin()}
                  disabled={pinInput.length < 4}
                  className="tv-focus rounded-tile bg-accent px-4 py-2 text-sm font-semibold text-ground hover:brightness-110 focus:shadow-focus disabled:bg-surface-3 disabled:text-ink-faint"
                >
                  {!pinHash ? 'Set PIN' : locked ? 'Unlock' : 'Remove PIN'}
                </button>
              </div>

              {message ? <p className="text-xs text-ink-mute">{message}</p> : null}
            </div>
          </section>

          <section>
            <SectionTitle>Adult content</SectionTitle>
            <div className="sw-card p-5">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  data-focusable=""
                  role="switch"
                  aria-checked={allowAdult}
                  aria-label="Show adult content"
                  disabled={locked}
                  onClick={() => setAllowAdult(!allowAdult)}
                  className={cn(
                    'tv-focus mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus:shadow-focus',
                    allowAdult ? 'bg-live' : 'bg-surface-4',
                    locked && 'opacity-40',
                  )}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-white transition-transform',
                      allowAdult ? 'translate-x-[18px]' : 'translate-x-0.5',
                    )}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium text-ink">Show adult-classified content</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">
                    Off by default. Adult categories and channels are filtered out of Home, Live TV,
                    the guide and search entirely — they are not sent to the browser at all.
                    {locked ? ' Unlock with your PIN to change this.' : ''}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle>Hidden categories</SectionTitle>
            <p className="mb-3 text-xs text-ink-mute">
              Hidden categories disappear from browsing. {hidden.length} hidden.
            </p>

            {error ? <ErrorNotice message={error} /> : null}

            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="sw-card p-5 text-sm text-ink-faint">
                Connect a playlist to manage its categories.
              </p>
            ) : (
              <ul className="sw-card max-h-[420px] divide-y divide-line overflow-y-auto">
                {categories.map((category) => {
                  const isHidden = hidden.includes(category.id);
                  return (
                    <li key={`${category.kind}-${category.id}`}>
                      <Focusable
                        onClick={() => toggleCategory(playlistId, category.id)}
                        aria-pressed={isHidden}
                        className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                      >
                        <Icon name="iptv-eye-off" size={16} />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            isHidden ? 'text-ink-faint line-through' : 'text-ink-soft',
                          )}
                        >
                          {category.name}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-faint">
                          {category.kind}
                        </span>
                      </Focusable>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">{children}</h2>
  );
}
