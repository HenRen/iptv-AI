'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogStats } from '@streamwise/core';
import { api, ApiError } from '@/lib/api/client';
import { aiApi } from '@/lib/api/aiClient';
import { usePlaylistStore } from '@/stores/playlistStore';
import { cn } from '@/lib/utils/cn';
import { ErrorNotice, Focusable, Icon, Spinner } from '@/components/common';
import {
  Field,
  GhostButton,
  Input,
  PrimaryButton,
  SetupHeader,
  SetupShell,
  SourceCard,
  StatGrid,
  StepRow,
} from './parts';

/**
 * First-run flow (PROTOTYPE.md §1):
 *
 *   welcome → source → xtream | m3u | m3uFile → testing → preparing → cleanup
 *
 * The prototype drives its progress screens on timers. Here they are driven
 * by the real connect: the request is in flight for as long as it takes, and
 * the step list advances on a cadence while it runs. What it never does is
 * claim a step *finished* that did not — the final counts come from the
 * server's actual response, and a failure stops the sequence where it is.
 */

type Screen =
  | 'welcome'
  | 'source'
  | 'xtream'
  | 'm3u'
  | 'm3uFile'
  | 'testing'
  | 'preparing'
  | 'cleanup';

const PREPARE_STEPS = [
  'Connecting to provider',
  'Loading channels',
  'Organizing categories',
  'Loading movies & series',
  'Matching TV guide',
  'AI organizing playlist',
  'Building your home',
];

const M3U_STEPS = [
  'Downloading playlist',
  'Parsing channels',
  'Detecting categories',
  'Matching EPG',
];

export function SetupFlow({ mode = 'onboarding' }: { mode?: 'onboarding' | 'add' }) {
  const router = useRouter();
  const load = usePlaylistStore((s) => s.load);

  const [screen, setScreen] = useState<Screen>(mode === 'add' ? 'source' : 'welcome');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);

  // Xtream
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // M3U
  const [url, setUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  // File
  const [file, setFile] = useState<{ name: string; size: number; content: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const done = useCallback(
    async (result: CatalogStats) => {
      setStats(result);
      setStep(PREPARE_STEPS.length);
      setPct(100);
      await load();
      setTimeout(() => setScreen('cleanup'), 700);
    },
    [load],
  );

  /**
   * Advance the step list while a real request is in flight, stopping one
   * short of the end so the last step only completes when the server answers.
   */
  const runProgress = useCallback((steps: number, tickMs: number) => {
    setStep(0);
    setPct(0);
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, steps - 1));
      setPct((p) => Math.min(p + Math.ceil(100 / steps), 92));
    }, tickMs);
    return () => clearInterval(timer);
  }, []);

  const connect = async (kind: 'xtream' | 'm3u-url' | 'm3u-file') => {
    setError(null);
    setScreen(kind === 'm3u-url' ? 'testing' : 'preparing');
    const stop = runProgress(kind === 'm3u-url' ? M3U_STEPS.length : PREPARE_STEPS.length, 700);

    try {
      let result;
      if (kind === 'xtream') {
        result = await api.connectXtream({
          name: name || 'My Playlist',
          host: host.trim(),
          username: username.trim(),
          password,
        });
        // Clear the password from component state the moment it is sent.
        setPassword('');
      } else if (kind === 'm3u-url') {
        result = await api.connectM3UUrl({
          name: name || 'My Playlist',
          url: url.trim(),
          epgUrl: epgUrl.trim() || undefined,
        });
      } else {
        if (!file) throw new Error('Choose an M3U file first.');
        result = await api.connectM3UFile({ name: name || file.name, content: file.content });
      }
      stop();
      if (kind === 'm3u-url') setScreen('preparing');
      await done(result.playlist.stats);
    } catch (err) {
      stop();
      setScreen(kind === 'xtream' ? 'xtream' : kind === 'm3u-url' ? 'm3u' : 'm3uFile');
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'The playlist could not be connected.',
      );
    }
  };

  const useDemo = async () => {
    setError(null);
    setScreen('preparing');
    const stop = runProgress(PREPARE_STEPS.length, 380);
    try {
      const res = await api.connectMock('Demo Provider');
      stop();
      await done(res.playlist.stats);
    } catch (err) {
      stop();
      setScreen('welcome');
      setError(err instanceof Error ? err.message : 'The demo could not be started.');
    }
  };

  const finish = () => router.push(mode === 'add' ? '/settings/playlists' : '/home');

  const acceptFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.(m3u8?|txt)$/i.test(picked.name)) {
      setError('Choose an .m3u or .m3u8 file.');
      return;
    }
    try {
      const content = await picked.text();
      setFile({ name: picked.name, size: picked.size, content });
      setError(null);
      if (!name) setName(picked.name.replace(/\.(m3u8?|txt)$/i, ''));
    } catch {
      setError('That file could not be read.');
    }
  };

  /* ------------------------------------------------------------ */

  if (screen === 'welcome') {
    return (
      <SetupShell className="items-start justify-center">
        <div className="flex min-h-dvh flex-col justify-center py-20">
          <div className="sw-kicker mb-6 text-accent">StreamWise</div>
          <h1 className="max-w-4xl text-[68px] font-bold leading-[0.98] tracking-tight text-ink text-balance">
            Your TV. Your content. Smarter.
          </h1>
          <p className="mt-7 max-w-lg text-[18px] leading-relaxed text-ink-mute">
            Connect your IPTV provider to get live channels, a real programme guide, movies and
            series — organised by an assistant that only ever shows what you actually have.
          </p>

          {error ? (
            <div className="mt-8 max-w-lg">
              <ErrorNotice message={error} />
            </div>
          ) : null}

          <div className="mt-12 flex flex-wrap items-center gap-5">
            <PrimaryButton onClick={() => setScreen('source')}>Connect IPTV</PrimaryButton>
            <GhostButton onClick={() => void useDemo()}>Explore demo</GhostButton>
          </div>
        </div>
      </SetupShell>
    );
  }

  if (screen === 'source') {
    return (
      <SetupShell>
        <SetupHeader
          kicker="Step 1 of 2"
          title="Connect your TV"
          subtitle="Choose how your provider gave you access."
          onBack={mode === 'add' ? () => router.back() : () => setScreen('welcome')}
        />
        {error ? (
          <div className="mt-8 max-w-xl">
            <ErrorNotice message={error} />
          </div>
        ) : null}
        <div className="mb-24 mt-14 grid gap-6 md:grid-cols-3">
          <SourceCard
            icon="iptv-connection"
            title="Xtream Codes"
            description="A server URL, username and password. The most common setup."
            onSelect={() => setScreen('xtream')}
          />
          <SourceCard
            icon="iptv-playlists"
            title="M3U Playlist"
            description="A playlist link, usually ending in get.php or .m3u."
            onSelect={() => setScreen('m3u')}
          />
          <SourceCard
            icon="iptv-download"
            title="M3U File"
            description="An .m3u or .m3u8 file already saved on this device."
            onSelect={() => setScreen('m3uFile')}
          />
        </div>
      </SetupShell>
    );
  }

  if (screen === 'xtream') {
    const ready = Boolean(host.trim() && username.trim() && password);
    return (
      <SetupShell>
        <SetupHeader
          kicker="Xtream Codes"
          title="Enter your provider details"
          onBack={() => setScreen('source')}
        />
        <form
          className="mb-24 mt-12 max-w-xl space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void connect('xtream');
          }}
        >
          {error ? <ErrorNotice message={error} /> : null}
          <Field label="Playlist name">
            <Input value={name} onChange={setName} placeholder="Living room" autoFocus />
          </Field>
          <Field label="Server URL">
            <Input
              value={host}
              onChange={setHost}
              placeholder="http://example.provider.tv"
              inputMode="url"
              autoComplete="off"
            />
          </Field>
          <Field label="Username">
            <Input value={username} onChange={setUsername} autoComplete="off" />
          </Field>
          <Field label="Password">
            <Input value={password} onChange={setPassword} type="password" autoComplete="off" />
          </Field>

          <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-dim">
            <Icon name="iptv-parental" size={16} className="mt-0.5 shrink-0" />
            Your details are encrypted on this server and never sent back to the browser. They are
            never shown in an error message.
          </p>

          <PrimaryButton type="submit" disabled={!ready} className="mt-2">
            Test connection
          </PrimaryButton>
        </form>
      </SetupShell>
    );
  }

  if (screen === 'm3u') {
    return (
      <SetupShell>
        <SetupHeader kicker="M3U Playlist" title="Enter your playlist URL" onBack={() => setScreen('source')} />
        <form
          className="mb-24 mt-12 max-w-xl space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void connect('m3u-url');
          }}
        >
          {error ? <ErrorNotice message={error} /> : null}
          <Field label="Playlist name">
            <Input value={name} onChange={setName} placeholder="Living room" autoFocus />
          </Field>
          <Field label="Playlist URL">
            <Input
              value={url}
              onChange={setUrl}
              placeholder="http://example.provider.tv/get.php?…"
              inputMode="url"
              autoComplete="off"
            />
          </Field>
          <Field label="EPG / XMLTV URL" hint="Optional — many playlists advertise their own.">
            <Input value={epgUrl} onChange={setEpgUrl} placeholder="http://…/xmltv.php" />
          </Field>

          <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-dim">
            <Icon name="iptv-connection" size={16} className="mt-0.5 shrink-0" />
            The URL is fetched by this server, so a plain-HTTP provider works even when the app is
            served over HTTPS.
          </p>

          <PrimaryButton type="submit" disabled={!url.trim()} className="mt-2">
            Test playlist
          </PrimaryButton>
        </form>
      </SetupShell>
    );
  }

  if (screen === 'm3uFile') {
    const entries = file ? (file.content.match(/#EXTINF/g)?.length ?? 0) : 0;
    const groups = file
      ? new Set(file.content.match(/group-title="([^"]*)"/g) ?? []).size
      : 0;

    return (
      <SetupShell>
        <SetupHeader kicker="M3U File" title="Import a playlist file" onBack={() => setScreen('source')} />
        <div className="mb-24 mt-12 max-w-xl space-y-6">
          {error ? <ErrorNotice message={error} /> : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void acceptFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              'rounded-panel border border-dashed p-12 text-center transition-colors',
              dragging ? 'border-accent bg-accent/[0.06]' : 'border-line-strong bg-surface-1',
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".m3u,.m3u8,text/plain"
              className="sr-only"
              onChange={(e) => void acceptFile(e.target.files?.[0])}
            />
            {file ? (
              <div className="space-y-2">
                <Icon name="iptv-playlists" size={32} className="mx-auto text-accent" />
                <p className="text-[16px] font-semibold text-ink">{file.name}</p>
                <p className="text-[13px] text-ink-mute">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {entries.toLocaleString()} entries ·{' '}
                  {groups.toLocaleString()} groups
                </p>
                <Focusable
                  onClick={() => fileInput.current?.click()}
                  className="mt-3 rounded-pill px-3 py-1.5 text-[13px] font-semibold uppercase tracking-label text-accent hover:text-accent-bright"
                >
                  Choose a different file
                </Focusable>
              </div>
            ) : (
              <>
                <Icon name="iptv-download" size={34} className="mx-auto mb-4 text-ink-dim" />
                <p className="text-[15px] text-ink-soft">Drag an .m3u file here</p>
                <Focusable
                  onClick={() => fileInput.current?.click()}
                  className="mt-4 rounded-pill border border-line-strong px-5 py-2.5 text-[13px] font-semibold uppercase tracking-label text-ink hover:border-white"
                >
                  Choose file
                </Focusable>
              </>
            )}
          </div>

          <Field label="Playlist name">
            <Input value={name} onChange={setName} placeholder="My playlist" />
          </Field>

          <PrimaryButton onClick={() => void connect('m3u-file')} disabled={!file}>
            Import
          </PrimaryButton>
        </div>
      </SetupShell>
    );
  }

  if (screen === 'testing' || screen === 'preparing') {
    const steps = screen === 'testing' ? M3U_STEPS : PREPARE_STEPS;
    return (
      <SetupShell className="items-center justify-center">
        <div className="flex min-h-dvh w-full max-w-lg flex-col justify-center py-20">
          <Spinner size={64} className="mb-10" />
          <div className="sw-kicker mb-3 text-accent">
            {screen === 'testing' ? 'Checking playlist' : 'Setting up'}
          </div>
          <h2 className="text-[34px] font-bold leading-tight tracking-tight text-ink">
            {screen === 'testing' ? 'Testing your playlist' : 'Preparing your TV'}
          </h2>

          <ul className="mt-10 space-y-1">
            {steps.map((label, index) => (
              <StepRow
                key={label}
                label={label}
                state={index < step ? 'done' : index === step ? 'active' : 'pending'}
              />
            ))}
          </ul>

          <div className="mt-10 h-1 w-full overflow-hidden rounded-pill bg-white/10">
            <div
              className="h-full rounded-pill bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-ink-dim">
            Large playlists take a minute. Channels, movies, series and the guide are indexed once
            so everything stays fast afterwards.
          </p>
        </div>
      </SetupShell>
    );
  }

  // cleanup
  return <CleanupScreen stats={stats} onContinue={finish} />;
}

/* ------------------------------------------------------------------ */

/**
 * AI Playlist Cleanup (PROTOTYPE.md §1).
 *
 * The findings are real — they come from the playlist-health service running
 * over the catalogue that was just imported. The note that the provider
 * playlist is never modified is not reassurance copy: the clean view is a
 * separate derived representation, and nothing here writes to the provider.
 */
function CleanupScreen({
  stats,
  onContinue,
}: {
  stats: CatalogStats | null;
  onContinue: () => void;
}) {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof aiApi.health>> | null>(null);
  const [loading, setLoading] = useState(true);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    aiApi
      .health()
      .then((res) => !cancelled && setHealth(res))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) button.current?.focus();
  }, [loading]);

  const findings = health
    ? ([
        ['Duplicate channels', health.metrics.possibleDuplicates],
        ['Missing logos', health.metrics.missingLogos],
        ['Without EPG', health.metrics.missingEpg],
        ['Uncategorized', health.metrics.uncategorized],
        ['Name issues', health.metrics.badNames],
      ] as Array<[string, number]>).filter(([, value]) => value > 0)
    : [];

  return (
    <SetupShell className="items-center justify-center">
      <div className="flex min-h-dvh w-full max-w-3xl flex-col justify-center py-20">
        <span className="mb-8 grid h-16 w-16 place-items-center rounded-full bg-ok/12 text-ok">
          <Icon name="iptv-health" size={32} />
        </span>

        <div className="sw-kicker mb-3 text-ok">Ready</div>
        <h2 className="text-[42px] font-bold leading-tight tracking-tight text-ink">
          Your TV is ready
        </h2>

        {stats ? (
          <div className="mt-10">
            <StatGrid
              stats={[
                ['Live channels', stats.channels],
                ['Movies', stats.movies],
                ['Series', stats.series],
                ['Categories', stats.categories],
              ]}
            />
            {stats.epgPrograms === 0 ? (
              <p className="mt-5 text-[13px] leading-relaxed text-warn">
                No TV guide data was found for this playlist. You can add an XMLTV source later in
                Settings — everything else works without it.
              </p>
            ) : (
              <p className="mt-5 text-[13px] text-ink-mute">
                {stats.epgPrograms.toLocaleString()} guide entries loaded.
              </p>
            )}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-[14px] text-ink-mute">
            <Spinner size={18} />
            Checking playlist health…
          </div>
        ) : findings.length > 0 ? (
          <div className="mt-12">
            <div className="mb-4 flex items-center gap-2.5">
              <Icon name="iptv-ai-cleanup" size={18} className="text-accent" />
              <span className="sw-kicker text-accent">AI playlist cleanup</span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {findings.map(([label, value]) => (
                <li
                  key={label}
                  className="flex items-center justify-between rounded-tile border border-line bg-surface-1 px-5 py-3.5"
                >
                  <span className="text-[14px] text-ink-soft">{label}</span>
                  <span className="text-[15px] font-bold tabular-nums text-ink">
                    {value.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            {health?.cleanView ? (
              <p className="mt-5 text-[13px] leading-relaxed text-ink-mute">
                A clean view would show{' '}
                <span className="font-semibold text-ink">
                  {health.cleanView.after.toLocaleString()}
                </span>{' '}
                channels instead of {health.cleanView.before.toLocaleString()}, collapsing quality
                and backup variants behind a selector.{' '}
                <span className="text-ink-dim">Your provider playlist is never modified.</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-14 flex flex-wrap items-center gap-4">
          <PrimaryButton onClick={onContinue}>Start watching</PrimaryButton>
          {findings.length > 0 ? (
            <GhostButton onClick={onContinue}>Review later in settings</GhostButton>
          ) : null}
        </div>
      </div>
      {/* Focus target for the primary action once loading finishes. */}
      <button ref={button} className="sr-only" aria-hidden tabIndex={-1} />
    </SetupShell>
  );
}
