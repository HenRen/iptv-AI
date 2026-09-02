'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Send, Sparkles, X } from 'lucide-react';
import type { Channel } from '@/types';
import { aiApi } from '@/lib/api/aiClient';
import { useAiStore } from '@/stores/aiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useVoiceInput } from '@/lib/ai/voice/useVoiceInput';
import { cn } from '@/lib/utils/cn';
import { Spinner } from '@/components/common';

/**
 * AI 1 — Ask TV.
 *
 * Deliberately *not* a chatbot page. It is a command bar that resolves to one
 * application action, tells you which action it took, and gets out of the
 * way. The model's only job is turning a sentence into a label; every label
 * maps to a fixed command, and any channel name is resolved against the real
 * catalogue server-side before anything plays.
 */

const EXAMPLES = [
  "What's on tonight?",
  'Show me live football',
  'Find a comedy under 90 minutes',
  'Play ESPN',
  'Find something for the kids',
  'Open my favorites',
];

interface Reply {
  ok: boolean;
  message: string;
  detail?: string;
}

export function AskTV() {
  const router = useRouter();
  const open = useAiStore((s) => s.assistantOpen);
  const close = useAiStore((s) => s.closeAssistant);
  const prefs = useAiStore((s) => s.prefs);

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const zap = usePlayerStore((s) => s.zap);
  const playing = usePlayerStore((s) => s.playing);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  const submit = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text) return;
      setBusy(true);
      setReply(null);
      try {
        const res = await aiApi.intent(text);

        if (!res.ok) {
          setReply({ ok: false, message: res.message ?? 'That is not something this app can do.' });
          return;
        }

        const command = res.command;
        if (!command) {
          setReply({ ok: false, message: 'No action was resolved.' });
          return;
        }

        switch (command.type) {
          case 'play-channel-resolved': {
            const channel = command.channel as Channel;
            pushRecentChannel(channel.id);
            recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
            await playChannel(channel, { mode: 'fullscreen' });
            setReply({ ok: true, message: res.spoken ?? `Playing ${channel.name}` });
            close();
            break;
          }
          case 'navigate':
            router.push(command.to);
            setReply({ ok: true, message: res.spoken ?? 'Opening' });
            close();
            break;
          case 'search':
            router.push(`/search?q=${encodeURIComponent(command.query)}`);
            setReply({ ok: true, message: res.spoken ?? 'Searching' });
            close();
            break;
          case 'transport':
            if (command.action === 'pause') setPlaying(false);
            else if (command.action === 'play') setPlaying(true);
            else if (command.action === 'next-channel') await zap(1);
            else if (command.action === 'previous-channel') await zap(-1);
            setReply({ ok: true, message: res.spoken ?? 'Done' });
            break;
          case 'open-content':
            router.push(`/movies?id=${encodeURIComponent(command.entityId)}`);
            close();
            break;
          default:
            setReply({ ok: false, message: 'That action is not supported.' });
        }
      } catch (err) {
        setReply({
          ok: false,
          message: err instanceof Error ? err.message : 'Ask TV could not respond.',
        });
      } finally {
        setBusy(false);
        setValue('');
      }
    },
    [close, playChannel, playing, pushRecentChannel, recordWatch, router, setPlaying, zap],
  );

  const voice = useVoiceInput({
    onFinal: (transcript) => {
      setValue(transcript);
      void submit(transcript);
    },
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setReply(null);
      setValue('');
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !prefs.enabled) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask TV"
      onClick={close}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ground/85 p-6 pt-[12vh] backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-card border border-line bg-surface-1 shadow-lift animate-slide-up"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(value);
          }}
          className="flex items-center gap-3 border-b border-line/70 px-4 py-3"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <input
            ref={inputRef}
            data-focusable=""
            value={voice.listening ? voice.interim || value : value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={voice.listening ? 'Listening…' : 'Ask TV anything…'}
            aria-label="Ask TV"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {voice.supported && prefs.voiceCommands ? (
            <button
              type="button"
              data-focusable=""
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              aria-label={voice.listening ? 'Stop listening' : 'Speak a command'}
              className={cn(
                'tv-focus grid h-8 w-8 place-items-center rounded-full focus:shadow-focus',
                voice.listening
                  ? 'bg-live text-white'
                  : 'text-ink-mute hover:bg-surface-3 hover:text-ink',
              )}
            >
              <Mic className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <button
            type="submit"
            data-focusable=""
            aria-label="Send"
            disabled={busy || !value.trim()}
            className="tv-focus grid h-8 w-8 place-items-center rounded-full text-ink-mute hover:bg-surface-3 hover:text-ink focus:shadow-focus disabled:opacity-30"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            data-focusable=""
            onClick={close}
            aria-label="Close Ask TV"
            className="tv-focus grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:text-ink focus:shadow-focus"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </form>

        <div className="px-4 py-4">
          {voice.error ? (
            <p className="mb-3 rounded-tile border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-ink-soft">
              {voice.error}
            </p>
          ) : null}

          {reply ? (
            <p
              className={cn(
                'rounded-tile px-3 py-2 text-sm',
                reply.ok
                  ? 'border border-ok/30 bg-ok/10 text-ink-soft'
                  : 'border border-warn/30 bg-warn/10 text-ink-soft',
              )}
              aria-live="polite"
            >
              {reply.message}
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">Try</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    data-focusable=""
                    onClick={() => void submit(example)}
                    className="tv-focus rounded-full border border-line px-3 py-1.5 text-xs text-ink-mute hover:border-accent/50 hover:text-ink focus:shadow-focus"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
            Ask TV can only do things this app already does, and only ever plays something that is
            actually in your playlist. It never sends your provider credentials anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The affordance that opens Ask TV. Placed in the top bar and on Home. */
export function AskTVButton({ className }: { className?: string }) {
  const open = useAiStore((s) => s.openAssistant);
  const enabled = useAiStore((s) => s.prefs.enabled);
  if (!enabled) return null;

  return (
    <button
      type="button"
      data-focusable=""
      onClick={open}
      aria-label="Ask TV"
      className={cn(
        'tv-focus inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ink-mute hover:border-accent/50 hover:text-ink focus:shadow-focus',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
      Ask TV
    </button>
  );
}
