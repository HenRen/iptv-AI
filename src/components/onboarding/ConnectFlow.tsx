'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Link2,
  Upload,
} from 'lucide-react';
import type { CatalogStats } from '@/types';
import { api, ApiError } from '@/lib/api/client';
import { usePlaylistStore } from '@/stores/playlistStore';
import { cn } from '@/lib/utils/cn';
import { ErrorNotice, Focusable, Spinner } from '@/components/common';

/**
 * First-launch experience and the "Add Playlist" flow.
 *
 * The three connection methods are peers, not a primary plus two fallbacks —
 * users arrive already knowing which one their provider gave them.
 *
 * Credentials typed here are POSTed once and never stored in client state.
 */

type Method = 'xtream' | 'm3u-url' | 'm3u-file';
type Phase = 'choose' | 'form' | 'connecting' | 'done';

const CONNECT_STEPS = [
  'Connecting to provider…',
  'Loading channels…',
  'Loading movies…',
  'Loading series…',
  'Preparing TV Guide…',
];

export function ConnectFlow({ mode = 'onboarding' }: { mode?: 'onboarding' | 'add' }) {
  const router = useRouter();
  const load = usePlaylistStore((s) => s.load);

  const [phase, setPhase] = useState<Phase>('choose');
  const [method, setMethod] = useState<Method>('xtream');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Fields
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [file, setFile] = useState<{ name: string; size: number; content: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The connect call is one request; the step list is a progress *indication*,
  // advanced on a timer, and it never claims a step finished that did not.
  useEffect(() => {
    if (phase !== 'connecting') return;
    setStepIndex(0);
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, CONNECT_STEPS.length - 1));
    }, 2200);
    return () => clearInterval(timer);
  }, [phase]);

  const finish = useCallback(
    async (playlistStats: CatalogStats) => {
      setStats(playlistStats);
      setPhase('done');
      await load();
    },
    [load],
  );

  const connect = async () => {
    setError(null);
    setPhase('connecting');
    try {
      if (method === 'xtream') {
        const res = await api.connectXtream({
          name: name || 'My Playlist',
          host: host.trim(),
          username: username.trim(),
          password,
        });
        // Clear the password from component state the moment it is sent.
        setPassword('');
        await finish(res.playlist.stats);
      } else if (method === 'm3u-url') {
        const res = await api.connectM3UUrl({
          name: name || 'My Playlist',
          url: url.trim(),
          epgUrl: epgUrl.trim() || undefined,
        });
        await finish(res.playlist.stats);
      } else {
        if (!file) throw new Error('Choose an M3U file first.');
        const res = await api.connectM3UFile({ name: name || file.name, content: file.content });
        await finish(res.playlist.stats);
      }
    } catch (err) {
      setPhase('form');
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'The playlist could not be connected.',
      );
    }
  };

  const useMock = async () => {
    setError(null);
    setPhase('connecting');
    try {
      const res = await api.connectMock();
      await finish(res.playlist.stats);
    } catch (err) {
      setPhase('choose');
      setError(err instanceof Error ? err.message : 'The mock provider could not be started.');
    }
  };

  if (phase === 'connecting') return <ConnectingScreen step={CONNECT_STEPS[stepIndex]} />;
  if (phase === 'done' && stats) {
    return (
      <SuccessScreen
        stats={stats}
        onContinue={() => router.push(mode === 'add' ? '/settings/playlists' : '/home')}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-6 py-14">
      {phase === 'choose' ? (
        <>
          <header className="mb-10 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              WATCH TV YOUR WAY
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-ink-soft text-balance sm:text-base">
              Connect your IPTV provider to access Live TV, Movies and Series.
            </p>
          </header>

          {error ? (
            <div className="mb-6">
              <ErrorNotice message={error} />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <MethodCard
              icon={<KeyRound className="h-6 w-6" aria-hidden />}
              title="Xtream Codes"
              description="Server URL, username and password from your provider."
              onSelect={() => {
                setMethod('xtream');
                setPhase('form');
              }}
            />
            <MethodCard
              icon={<Link2 className="h-6 w-6" aria-hidden />}
              title="M3U URL"
              description="A playlist link, usually ending in get.php or .m3u."
              onSelect={() => {
                setMethod('m3u-url');
                setPhase('form');
              }}
            />
            <MethodCard
              icon={<Upload className="h-6 w-6" aria-hidden />}
              title="Upload Playlist"
              description="An .m3u or .m3u8 file already saved on this device."
              onSelect={() => {
                setMethod('m3u-file');
                setPhase('form');
              }}
            />
          </div>

          <div className="mt-8 text-center">
            <Focusable
              onClick={useMock}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs text-ink-mute hover:text-ink-soft"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden />
              Explore with sample data instead
            </Focusable>
          </div>
        </>
      ) : (
        <div className="mx-auto w-full max-w-lg">
          <Focusable
            onClick={() => {
              setPhase('choose');
              setError(null);
            }}
            className="mb-6 inline-flex items-center gap-2 px-2 py-1 text-sm text-ink-mute hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Focusable>

          <h2 className="text-2xl font-semibold tracking-tight">
            {method === 'xtream'
              ? 'Xtream Codes'
              : method === 'm3u-url'
                ? 'M3U URL'
                : 'Upload Playlist'}
          </h2>
          <p className="mt-1 text-sm text-ink-mute">
            {method === 'xtream'
              ? 'These details are stored encrypted on the server and are never sent to the browser again.'
              : method === 'm3u-url'
                ? 'The URL is fetched by the server, so plain HTTP providers work over HTTPS.'
                : 'The file is parsed on the server. Nothing is uploaded to any third party.'}
          </p>

          {error ? (
            <div className="mt-5">
              <ErrorNotice message={error} />
            </div>
          ) : null}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Field label="Playlist Name">
              <Input value={name} onChange={setName} placeholder="Living Room" autoFocus />
            </Field>

            {method === 'xtream' ? (
              <>
                <Field label="Server / Host URL">
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
              </>
            ) : null}

            {method === 'm3u-url' ? (
              <>
                <Field label="M3U URL">
                  <Input
                    value={url}
                    onChange={setUrl}
                    placeholder="http://example.provider.tv/get.php?…"
                    inputMode="url"
                    autoComplete="off"
                  />
                </Field>
                <Field label="XMLTV Guide URL" hint="Optional — many playlists advertise their own.">
                  <Input value={epgUrl} onChange={setEpgUrl} placeholder="http://…/xmltv.php" />
                </Field>
              </>
            ) : null}

            {method === 'm3u-file' ? (
              <FileDrop
                file={file}
                dragging={dragging}
                setDragging={setDragging}
                onFile={(f) => {
                  setFile(f);
                  if (!name) setName(f.name.replace(/\.(m3u8?|txt)$/i, ''));
                }}
                onError={setError}
              />
            ) : null}

            <button
              type="submit"
              data-focusable=""
              disabled={
                (method === 'xtream' && (!host || !username || !password)) ||
                (method === 'm3u-url' && !url) ||
                (method === 'm3u-file' && !file)
              }
              className={cn(
                'tv-focus mt-2 w-full rounded-tile bg-accent px-4 py-3 text-sm font-semibold text-white',
                'hover:bg-accent-bright focus:shadow-focus disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-faint',
              )}
            >
              Connect
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MethodCard({
  icon,
  title,
  description,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <Focusable
      onClick={onSelect}
      className={cn(
        'tv-card group flex h-full flex-col gap-3 p-6 text-left',
        'hover:border-accent/50 hover:bg-surface-2',
        'data-[focused=true]:border-accent data-[focused=true]:bg-surface-2',
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-tile bg-accent/15 text-accent">
        {icon}
      </span>
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-sm leading-relaxed text-ink-mute">{description}</span>
    </Focusable>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-mute">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      data-focusable=""
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-tile border border-line bg-surface-1 px-3 py-2.5 text-sm text-ink',
        'placeholder:text-ink-faint focus:border-accent focus:shadow-focus',
      )}
      {...rest}
    />
  );
}

function FileDrop({
  file,
  dragging,
  setDragging,
  onFile,
  onError,
}: {
  file: { name: string; size: number; content: string } | null;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFile: (f: { name: string; size: number; content: string }) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const accept = async (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.(m3u8?|txt)$/i.test(picked.name)) {
      onError('Choose an .m3u or .m3u8 file.');
      return;
    }
    setReading(true);
    try {
      const content = await picked.text();
      onFile({ name: picked.name, size: picked.size, content });
      onError('');
    } catch {
      onError('That file could not be read.');
    } finally {
      setReading(false);
    }
  };

  const channelCount = file ? (file.content.match(/#EXTINF/g)?.length ?? 0) : 0;
  const groupCount = file ? new Set(file.content.match(/group-title="([^"]*)"/g) ?? []).size : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void accept(e.dataTransfer.files[0]);
      }}
      className={cn(
        'rounded-card border border-dashed p-6 text-center transition-colors',
        dragging ? 'border-accent bg-accent/5' : 'border-line bg-surface-1',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".m3u,.m3u8,text/plain"
        className="sr-only"
        onChange={(e) => void accept(e.target.files?.[0])}
      />
      {reading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner className="h-4 w-4" /> Reading file…
        </div>
      ) : file ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">{file.name}</p>
          <p className="text-xs text-ink-mute">
            {(file.size / 1024 / 1024).toFixed(2)} MB · {channelCount.toLocaleString()} entries ·{' '}
            {groupCount.toLocaleString()} groups
          </p>
          <Focusable
            onClick={() => inputRef.current?.click()}
            className="mt-2 px-2 py-1 text-xs text-accent hover:text-accent-bright"
          >
            Choose a different file
          </Focusable>
        </div>
      ) : (
        <>
          <Upload className="mx-auto mb-2 h-6 w-6 text-ink-faint" aria-hidden />
          <p className="text-sm text-ink-soft">Drag an .m3u file here</p>
          <Focusable
            onClick={() => inputRef.current?.click()}
            className="mt-2 rounded-tile border border-line px-3 py-1.5 text-xs text-ink hover:border-accent/50"
          >
            Browse files
          </Focusable>
        </>
      )}
    </div>
  );
}

function ConnectingScreen({ step }: { step: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-8">
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-ink-soft" aria-live="polite">
        {step}
      </p>
      <p className="max-w-sm text-center text-xs text-ink-faint text-balance">
        Large playlists can take a minute. Channels, movies, series and the TV guide are all
        indexed once so the app stays fast afterwards.
      </p>
    </div>
  );
}

function SuccessScreen({ stats, onContinue }: { stats: CatalogStats; onContinue: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
  }, []);

  const cards: Array<[string, number]> = [
    ['Live Channels', stats.channels],
    ['Movies', stats.movies],
    ['Series', stats.series],
    ['Categories', stats.categories],
  ];

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8">
      <CheckCircle2 className="mb-4 h-10 w-10 text-ok" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-tight">Playlist connected successfully</h2>

      <div className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="tv-card px-4 py-5 text-center">
            <div className="text-2xl font-semibold tabular-nums text-ink">
              {value.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
          </div>
        ))}
      </div>

      {stats.epgPrograms === 0 ? (
        <p className="mt-6 max-w-md text-center text-xs text-warn text-balance">
          No TV guide data was found for this playlist. You can add an XMLTV source later in
          Settings — everything else works without it.
        </p>
      ) : null}

      <button
        ref={button}
        type="button"
        data-focusable=""
        onClick={onContinue}
        className="tv-focus mt-9 rounded-tile bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent-bright focus:shadow-focus"
      >
        CONTINUE TO TV
      </button>
    </div>
  );
}
