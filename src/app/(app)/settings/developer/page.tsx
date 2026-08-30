'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import type { DiagnosticsReport } from '@/types';
import { api } from '@/lib/api/client';
import { TopBar } from '@/components/navigation/TopBar';
import { EmptyState, ErrorNotice, Focusable, ProgressBar, Spinner } from '@/components/common';

/**
 * IPTV Diagnostics.
 *
 * Everything shown here is derived server-side and deliberately excludes the
 * username, the password, and any URL that carries them — the report type
 * itself has no field for them, so a leak cannot happen by accident.
 */
export default function DeveloperPage() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.diagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnostics could not be run.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const pct = (n: number, total: number) => (total > 0 ? n / total : 0);

  return (
    <>
      <TopBar title="IPTV Diagnostics" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-mute">
              {report
                ? `Generated ${new Date(report.generatedAt).toLocaleString()}`
                : 'No report yet'}
            </p>
            <Focusable
              onClick={() => void run()}
              className="inline-flex items-center gap-2 rounded-tile bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-bright"
            >
              <Activity className="h-4 w-4" aria-hidden />
              Run diagnostics
            </Focusable>
          </div>

          {error ? <ErrorNotice message={error} /> : null}

          {loading ? (
            <div className="grid h-40 place-items-center">
              <Spinner />
            </div>
          ) : !report ? (
            <EmptyState title="Connect a playlist first" />
          ) : (
            <>
              <section className="tv-card p-5">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Connection
                </h2>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <Item label="Provider type" value={report.providerKind} />
                  <Item label="Status" value={report.status.replace('-', ' ')} />
                  <Item
                    label="Last refresh"
                    value={
                      report.lastRefreshAt
                        ? new Date(report.lastRefreshAt).toLocaleString()
                        : 'never'
                    }
                  />
                </dl>
              </section>

              <section className="tv-card p-5">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Playlist health
                </h2>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Item label="Channels" value={report.counts.channels.toLocaleString()} />
                  <Item label="Movies" value={report.counts.movies.toLocaleString()} />
                  <Item label="Series" value={report.counts.series.toLocaleString()} />
                  <Item label="Categories" value={report.counts.categories.toLocaleString()} />
                </dl>

                <div className="mt-6 space-y-4">
                  <Meter
                    label="Channels with a logo"
                    value={report.health.channelsWithLogo}
                    total={report.counts.channels}
                    ratio={pct(report.health.channelsWithLogo, report.counts.channels)}
                  />
                  <Meter
                    label="Channels matched to EPG"
                    value={report.health.channelsWithEpg}
                    total={report.counts.channels}
                    ratio={pct(report.health.channelsWithEpg, report.counts.channels)}
                  />
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line/60 pt-4 text-sm sm:grid-cols-4">
                  <Item label="Uncategorized" value={report.health.uncategorized.toLocaleString()} />
                  <Item
                    label="Duplicate groups"
                    value={report.health.duplicateFamilies.toLocaleString()}
                  />
                  <Item label="Adult channels" value={report.health.adultChannels.toLocaleString()} />
                  <Item
                    label="Unplayable container"
                    value={report.health.unsupportedContainers.toLocaleString()}
                  />
                </dl>
              </section>

              {report.notes.length > 0 ? (
                <section className="tv-card p-5">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    Findings
                  </h2>
                  <ul className="space-y-2 text-sm text-ink-mute">
                    {report.notes.map((note) => (
                      <li key={note} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden />
                        {note}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Credentials are never included in diagnostics. Stream and artwork URLs shown
                anywhere in this app point at this server&rsquo;s proxy, not at your provider.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize tabular-nums text-ink-soft">{value}</dd>
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  ratio,
}: {
  label: string;
  value: number;
  total: number;
  ratio: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-ink-mute">{label}</span>
        <span className="tabular-nums text-ink-faint">
          {value.toLocaleString()} / {total.toLocaleString()} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <ProgressBar value={ratio} tone={ratio < 0.5 ? 'live' : 'accent'} />
    </div>
  );
}
