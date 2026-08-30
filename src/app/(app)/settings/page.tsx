'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, ListVideo, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { TopBar } from '@/components/navigation/TopBar';
import { ErrorNotice, Focusable, Spinner } from '@/components/common';
import { cn } from '@/lib/utils/cn';

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
          <section>
            <SectionTitle>General</SectionTitle>
            <div className="tv-card divide-y divide-line/60">
              <LinkRow
                href="/settings/playlists"
                icon={<ListVideo className="h-4 w-4" aria-hidden />}
                title="Playlists"
                description="Connect, refresh, reconnect or remove providers."
              />
              <LinkRow
                href="/settings/developer"
                icon={<Wrench className="h-4 w-4" aria-hidden />}
                title="Developer · IPTV Diagnostics"
                description="Playlist health, EPG coverage and connection status."
              />
            </div>
          </section>

          <EpgSection />

          <section>
            <SectionTitle>AI &amp; Privacy</SectionTitle>
            <div className="tv-card p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium text-ink">AI features are not configured</p>
                  <p className="mt-1 leading-relaxed text-ink-mute">
                    The AI layer ships as interfaces plus a mock provider. Deterministic playlist
                    normalization, category classification and EPG matching already run without any
                    AI provider — they are rules, not a model.
                  </p>
                  <p className="mt-3 leading-relaxed text-ink-faint">
                    IPTV credentials and credential-bearing URLs are never sent to an AI provider,
                    whichever one is configured.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle>Parental control</SectionTitle>
            <div className="tv-card p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium text-ink">Adult content is hidden by default</p>
                  <p className="mt-1 leading-relaxed text-ink-mute">
                    Categories and channels the classifier flags as adult are filtered out of Home,
                    Live TV, the guide and search. PIN-protected access and per-category hiding are
                    wired through the same filter and are not yet exposed here.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function EpgSection() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const loadUrl = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.loadEpgUrl(url.trim());
      setResult(
        `${res.programs.toLocaleString()} programmes loaded · ${res.matched} channels matched · ${res.unmatched} unmatched.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The guide could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.loadEpgFile(await file.text());
      setResult(
        `${res.programs.toLocaleString()} programmes loaded · ${res.matched} channels matched · ${res.unmatched} unmatched.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be parsed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionTitle>TV Guide source</SectionTitle>
      <div className="tv-card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-mute">
            The provider&rsquo;s own XMLTV feed is used automatically when it exposes one. Override it
            with a custom source if the guide is missing or badly matched.
          </p>
        </div>

        {error ? <ErrorNotice message={error} /> : null}
        {result ? (
          <p className="rounded-tile border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ink-soft">
            {result}
          </p>
        ) : null}

        <div className="flex gap-2">
          <input
            data-focusable=""
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/xmltv.xml"
            aria-label="XMLTV URL"
            className="flex-1 rounded-tile border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
          />
          <button
            type="button"
            data-focusable=""
            onClick={() => void loadUrl()}
            disabled={busy || !url.trim()}
            className="tv-focus rounded-tile bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-bright focus:shadow-focus disabled:bg-surface-3 disabled:text-ink-faint"
          >
            {busy ? <Spinner className="h-4 w-4" /> : 'Load'}
          </button>
        </div>

        <label className="block">
          <span className="text-xs text-ink-faint">or upload an XMLTV file</span>
          <input
            type="file"
            accept=".xml,.xmltv,text/xml"
            onChange={(e) => void loadFile(e.target.files?.[0])}
            className="mt-1.5 block w-full text-xs text-ink-mute file:mr-3 file:rounded-tile file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink-soft"
          />
        </label>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">{children}</h2>
  );
}

function LinkRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      data-focusable=""
      className={cn(
        'tv-focus flex items-center gap-4 p-5 focus:shadow-focus hover:bg-surface-2',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-surface-3 text-ink-mute">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-mute">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  );
}
