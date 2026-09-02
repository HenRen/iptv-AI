'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * AI 8 — voice remote input.
 *
 * Speech-to-text only. The transcript is handed to the intent parser, which
 * maps it onto the closed action allowlist; this hook never causes an effect
 * of its own, and there is no path from audio to an executed command that
 * skips validation.
 *
 * Uses the browser's SpeechRecognition where present (Chrome, Edge, Safari).
 * `supported` is false elsewhere and the UI hides the mic rather than
 * offering a button that does nothing.
 */

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceInput {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useVoiceInput({
  lang = 'en-US',
  onFinal,
}: { lang?: string; onFinal?: (transcript: string) => void } = {}): VoiceInput {
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Keep the callback in a ref so re-renders do not tear down recognition.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const Ctor = getConstructor();
    setSupported(Boolean(Ctor));
    if (!Ctor) return;

    const instance = new Ctor();
    instance.lang = lang;
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      setListening(true);
      setError(null);
    };
    instance.onend = () => {
      setListening(false);
      setInterim('');
    };
    instance.onerror = (event) => {
      setListening(false);
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow it in your browser to use voice.'
          : event.error === 'no-speech'
            ? 'Nothing was heard. Try again.'
            : 'Voice input is unavailable right now.',
      );
    };
    instance.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        const cleaned = finalText.trim();
        setTranscript(cleaned);
        setInterim('');
        onFinalRef.current?.(cleaned);
      }
    };

    recognition.current = instance;
    return () => {
      instance.onresult = null;
      instance.onerror = null;
      instance.onend = null;
      instance.onstart = null;
      try {
        instance.abort();
      } catch {
        // Aborting an instance that never started throws in some browsers.
      }
      recognition.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognition.current || listening) return;
    setTranscript('');
    setInterim('');
    setError(null);
    try {
      recognition.current.start();
    } catch {
      // start() throws if called while already running; ignore.
    }
  }, [listening]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
