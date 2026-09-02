'use client';

import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { attachStream, type AttachedEngine } from '@/lib/player/engine';
import { setActiveEngine } from '@/lib/player/activeEngine';

/**
 * The single <video> element in the application.
 *
 * It is mounted once, in the shell, and never unmounted while navigating —
 * that is what lets a channel keep playing while the user browses the guide,
 * and what makes zapping feel instant instead of re-mounting a player.
 * Screens position it; they never own it.
 */
export function VideoSurface({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<AttachedEngine | null>(null);
  const triedFallback = useRef(false);

  const source = usePlayerStore((s) => s.source);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const playing = usePlayerStore((s) => s.playing);
  const muted = usePlayerStore((s) => s.muted);
  const volume = usePlayerStore((s) => s.volume);
  const resumeAt = usePlayerStore((s) => s.resumeAt);
  const setLoading = usePlayerStore((s) => s.setLoading);
  const setError = usePlayerStore((s) => s.setError);
  const setPlaying = usePlayerStore((s) => s.setPlaying);

  const saveProgress = useUserStore((s) => s.saveProgress);

  // Attach / re-attach whenever the source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    engineRef.current?.destroy();
    engineRef.current = null;
    setActiveEngine(null);
    triedFallback.current = false;

    if (!source) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    let cancelled = false;
    setLoading(true);

    const attach = async (url: string, container: typeof source.container) => {
      const engine = await attachStream(video, {
        url,
        container,
        isLive: source.kind === 'live',
        onReady: () => {
          if (!cancelled) setLoading(false);
        },
        onError: (message, recoverable) => {
          if (cancelled) return;
          // Live streams get one automatic retry on the alternate container
          // before the user is told anything — providers routinely offer
          // .m3u8 that 404s while .ts works, and vice versa.
          if (
            !recoverable &&
            !triedFallback.current &&
            source.fallbackUrl &&
            source.fallbackContainer
          ) {
            triedFallback.current = true;
            engineRef.current?.destroy();
            void attach(source.fallbackUrl, source.fallbackContainer);
            return;
          }
          if (recoverable) return;
          setError(message);
        },
      });
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      // Publish the live engine so the controls can enumerate audio,
      // subtitle and quality tracks without going through React state.
      setActiveEngine(engine);
    };

    void attach(source.url, source.container);

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      setActiveEngine(null);
    };
  }, [source, setLoading, setError]);

  // Play / pause intent from the store.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (playing) {
      video.play().catch(() => {
        // Autoplay with sound is blocked until the user interacts; start
        // muted rather than failing, and let them unmute.
        video.muted = true;
        usePlayerStore.setState({ muted: true });
        video.play().catch(() => setPlaying(false));
      });
    } else {
      video.pause();
    }
  }, [playing, source, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  // Resume position for VOD.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || resumeAt == null || resumeAt <= 0) return;
    const onLoaded = () => {
      if (Number.isFinite(video.duration) && resumeAt < video.duration - 10) {
        video.currentTime = resumeAt;
      }
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [resumeAt, source]);

  // Persist playback progress for VOD every 5 seconds of wall clock.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !nowPlaying || nowPlaying.kind === 'live') return;
    const timer = setInterval(() => {
      if (video.paused || !Number.isFinite(video.duration) || video.duration <= 0) return;
      saveProgress({
        kind: nowPlaying.kind as 'movie' | 'episode',
        contentId: nowPlaying.id,
        seriesId: nowPlaying.seriesId,
        positionSecs: Math.floor(video.currentTime),
        durationSecs: Math.floor(video.duration),
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [nowPlaying, saveProgress]);

  return (
    <video
      ref={videoRef}
      className={className}
      playsInline
      autoPlay
      // Controls are ours: the native chrome is unusable with a remote.
      controls={false}
      onPlaying={() => {
        setLoading(false);
        setPlaying(true);
      }}
      onWaiting={() => setLoading(true)}
      onPause={() => setPlaying(false)}
      onPlay={() => setPlaying(true)}
    />
  );
}
