'use client';

import { useCallback, useEffect, useState } from 'react';
import { aiApi } from '@/lib/api/aiClient';
import type { PlaylistHealth } from '@/lib/ai/diagnostics/PlaylistHealthService';
import { parseWatchRule } from '@/lib/ai/assistant/WatchlistService';
import { useAiStore, type AiPreferences } from '@/stores/aiStore';
import { TopBar } from '@/components/navigation/TopBar';
import { Icon, ErrorNotice, Focusable, ProgressBar, Spinner } from '@/components/common';
import { cn } from '@/lib/utils/cn';

type Health = PlaylistHealth & { cleanView: { before: number; after: number; collapsed: number } };

const TOGGLES: Array<{
  key: keyof AiPreferences;
  label: string;
  description: string;
  sendsData?: boolean;
}> = [
  {
    key: 'enabled',
    label: 'Enable AI features',
    description: 'Master switch for Ask TV, smart groups and recommendations.',
  },
  {
    key: 'personalizedRecommendations',
    label: 'Personalized recommendations',
    description: 'Builds Home rails from what you actually watch. Computed on this server.',
  },
  {
    key: 'useWatchHistory',
    label: 'Use watch history',
    description: 'Channel history and favorites feed the ranking. Stored in this browser.',
  },
  {
    key: 'voiceCommands',
    label: 'Voice commands',
    description: 'Adds a microphone to Ask TV. Speech is transcribed by your browser.',
  },
  {
    key: 'playlistOrganization',
    label: 'AI playlist organization',
    description:
      'Sends only ambiguous channel names to an AI provider. Rule-based cleanup runs locally either way.',
    sendsData: true,
  },
  {
    key: 'epgMatching',
    label: 'AI EPG matching',
    description:
      'Proposes guide matches the exact matchers missed. Proposals are never applied without your approval.',
    sendsData: true,
  },
  {
    key: 'diagnostics',
    label: 'AI diagnostics',
    description: 'Playlist health analysis and suggested cleanups. Computed locally.',
  },
];

export default function AiSettingsPage() {
  const prefs = useAiStore((s) => s.prefs);
  const setPref = useAiStore((s) => s.setPref);
  const watchlist = useAiStore((s) => s.watchlist);
  const addRule = useAiStore((s) => s.addRule);
  const removeRule = useAiStore((s) => s.removeRule);
  const toggleRule = useAiStore((s) => s.toggleRule);

  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleText, setRuleText] = useState('');

  const runHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth((await aiApi.health()) as Health | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnostics could not run.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (prefs.diagnostics) void runHealth();
  }, [prefs.diagnostics, runHealth]);

  return (
    <>
      <TopBar title="AI & Privacy" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
          <section>
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink-mute">
              <Icon name="iptv-shield-check" size={14} className="mt-0.5 shrink-0 text-ok" />
              Your IPTV username, password and any URL containing them are never sent to an AI
              provider. Only channel names and catalogue titles can be, and only for the two options
              marked below.
            </p>

            <div className="sw-card divide-y divide-line">
              {TOGGLES.map((toggle) => (
                <Toggle
                  key={toggle.key}
                  label={toggle.label}
                  description={toggle.description}
                  sendsData={toggle.sendsData}
                  checked={prefs[toggle.key]}
                  disabled={toggle.key !== 'enabled' && !prefs.enabled}
                  onChange={(value) => setPref(toggle.key, value)}
                />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>Watchlist</SectionTitle>
            <div className="sw-card space-y-3 p-5">
              <p className="text-xs leading-relaxed text-ink-mute">
                Describe what to keep an eye on. Rules are matched against your real TV guide and
                catalogue — nothing is invented, and a rule with no matches simply shows nothing.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const rule = parseWatchRule(ruleText);
                  if (rule) {
                    addRule(rule);
                    setRuleText('');
                  }
                }}
              >
                <input
                  data-focusable=""
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="Keep track of Formula One"
                  aria-label="New watchlist rule"
                  className="flex-1 rounded-tile border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
                />
                <button
                  type="submit"
                  data-focusable=""
                  disabled={!ruleText.trim()}
                  className="tv-focus rounded-tile bg-accent px-4 py-2 text-sm font-semibold text-ground hover:brightness-110 focus:shadow-focus disabled:bg-surface-3 disabled:text-ink-faint"
                >
                  Add
                </button>
              </form>

              {watchlist.length > 0 ? (
                <ul className="space-y-1.5 pt-1">
                  {watchlist.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center gap-3 rounded-tile border border-line bg-surface-2/50 px-3 py-2"
                    >
                      <button
                        type="button"
                        data-focusable=""
                        role="switch"
                        aria-checked={rule.enabled}
                        onClick={() => toggleRule(rule.id)}
                        className={cn(
                          'tv-focus h-4 w-7 shrink-0 rounded-full transition-colors focus:shadow-focus',
                          rule.enabled ? 'bg-accent' : 'bg-surface-4',
                        )}
                      >
                        <span
                          className={cn(
                            'block h-3 w-3 rounded-full bg-white transition-transform',
                            rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{rule.label}</span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {rule.type.replace('_', ' ').toLowerCase()} · {rule.keywords.join(', ')}
                        </span>
                      </span>
                      <Focusable
                        onClick={() => removeRule(rule.id)}
                        aria-label={`Remove ${rule.label}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-tile text-ink-faint hover:text-live"
                      >
                        <Icon name="iptv-trash" size={14} />
                      </Focusable>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-faint">No rules yet.</p>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Playlist health</SectionTitle>
              <Focusable
                onClick={() => void runHealth()}
                className="inline-flex items-center gap-2 rounded-tile border border-line px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
              >
                <Icon name="iptv-health" size={14} />
                Analyze
              </Focusable>
            </div>

            {error ? <ErrorNotice message={error} /> : null}

            {loading ? (
              <div className="sw-card grid h-32 place-items-center">
                <Spinner />
              </div>
            ) : health ? (
              <div className="space-y-3">
                <div className="sw-card p-5">
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-baseline justify-between text-xs">
                      <span className="text-ink-mute">Healthy metadata</span>
                      <span className="tabular-nums text-ink-faint">
                        {Math.round(health.metrics.healthyMetadata * 100)}%
                      </span>
                    </div>
                    <ProgressBar
                      value={health.metrics.healthyMetadata}
                      tone={health.metrics.healthyMetadata < 0.6 ? 'live' : 'accent'}
                    />
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Metric label="Channels" value={health.totals.channels} />
                    <Metric label="Missing logos" value={health.metrics.missingLogos} />
                    <Metric label="Missing EPG" value={health.metrics.missingEpg} />
                    <Metric label="Duplicates" value={health.metrics.possibleDuplicates} />
                  </dl>

                  <div className="mt-5 flex items-start gap-2 rounded-tile border border-line bg-surface-2/50 p-3">
                    <Icon name="iptv-categories" size={14} className="mt-0.5 shrink-0 text-accent" />
                    <p className="text-xs leading-relaxed text-ink-mute">
                      <span className="font-medium text-ink">Clean view</span> would show{' '}
                      <span className="tabular-nums text-ink">{health.cleanView.after.toLocaleString()}</span>{' '}
                      channels instead of{' '}
                      <span className="tabular-nums text-ink">{health.cleanView.before.toLocaleString()}</span>,
                      collapsing {health.cleanView.collapsed.toLocaleString()} quality and backup
                      variants behind a selector. Your provider playlist is never modified.
                    </p>
                  </div>
                </div>

                {health.issues.map((issue) => (
                  <div key={issue.id} className="sw-card p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          issue.severity === 'error'
                            ? 'bg-live'
                            : issue.severity === 'warn'
                              ? 'bg-warn'
                              : 'bg-ink-faint',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{issue.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">{issue.detail}</p>
                        {issue.consequence ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                            <span className="font-medium">If applied:</span> {issue.consequence}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {health.issues.length === 0 ? (
                  <p className="sw-card p-5 text-sm text-ink-mute">
                    No issues found in this playlist.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="sw-card p-5 text-sm text-ink-faint">
                Run an analysis to see playlist health.
              </p>
            )}
          </section>

          <p className="flex items-start gap-2 pb-4 text-[11px] leading-relaxed text-ink-faint">
            <Icon name="iptv-ai" size={12} className="mt-0.5 shrink-0" />
            AI may organize, classify, recommend, search, summarize, match, explain and diagnose. It
            may not invent a channel, movie, series, programme, sporting event or stream. Everything
            playable resolves to a real entry in your playlist.
          </p>
        </div>
      </div>
    </>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  sendsData,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  sendsData?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={cn('flex items-start gap-4 p-4', disabled && 'opacity-45')}>
      <button
        type="button"
        data-focusable=""
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'tv-focus mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus:shadow-focus',
          checked ? 'bg-accent' : 'bg-surface-4',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {label}
          {sendsData ? (
            <span className="rounded border border-warn/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">
              sends names
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">{description}</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{children}</h2>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-ink-soft">{value.toLocaleString()}</dd>
    </div>
  );
}
