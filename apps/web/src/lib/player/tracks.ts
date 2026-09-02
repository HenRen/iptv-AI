import type { EngineKind } from './engine';

/**
 * §12 — audio track, subtitle and quality selection.
 *
 * Each engine exposes tracks differently, and none of them the same way as
 * the DOM. This normalizes all three into one shape so the controls do not
 * have to know which engine is running:
 *
 *   hls.js    audioTracks / subtitleTracks / levels
 *   mpegts.js single programme; subtitles surface as DOM text tracks
 *   native    video.audioTracks / video.textTracks, patchy across browsers
 *
 * Where an engine genuinely cannot switch something, the list comes back
 * empty and the control hides itself — rather than offering a menu that
 * silently does nothing.
 */

export interface TrackOption {
  id: string;
  label: string;
  language?: string | null;
  active: boolean;
}

export interface TrackState {
  audio: TrackOption[];
  subtitles: TrackOption[];
  quality: TrackOption[];
}

export const EMPTY_TRACKS: TrackState = { audio: [], subtitles: [], quality: [] };

/** Minimal structural types — we never import hls.js/mpegts.js types here. */
interface HlsLike {
  audioTracks?: Array<{ id?: number; name?: string; lang?: string }>;
  audioTrack?: number;
  subtitleTracks?: Array<{ id?: number; name?: string; lang?: string }>;
  subtitleTrack?: number;
  subtitleDisplay?: boolean;
  levels?: Array<{ height?: number; bitrate?: number; name?: string }>;
  currentLevel?: number;
  nextLevel?: number;
}

interface NativeAudioTrackList {
  length: number;
  [index: number]: { id?: string; label?: string; language?: string; enabled: boolean };
}

function languageLabel(lang: string | undefined | null): string | null {
  if (!lang) return null;
  try {
    const display = new Intl.DisplayNames(undefined, { type: 'language' });
    return display.of(lang) ?? lang;
  } catch {
    return lang;
  }
}

function levelLabel(level: { height?: number; bitrate?: number; name?: string }): string {
  if (level.height) return `${level.height}p`;
  if (level.name) return level.name;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return 'Auto';
}

/** Read the current track state from whichever engine is attached. */
export function readTracks(
  video: HTMLVideoElement | null,
  engine: EngineKind,
  handle: unknown,
): TrackState {
  if (!video) return EMPTY_TRACKS;

  const audio: TrackOption[] = [];
  const subtitles: TrackOption[] = [];
  const quality: TrackOption[] = [];

  if (engine === 'hls' && handle) {
    const hls = handle as HlsLike;

    (hls.audioTracks ?? []).forEach((track, index) => {
      audio.push({
        id: String(track.id ?? index),
        label: track.name || languageLabel(track.lang) || `Audio ${index + 1}`,
        language: track.lang ?? null,
        active: hls.audioTrack === (track.id ?? index),
      });
    });

    (hls.subtitleTracks ?? []).forEach((track, index) => {
      subtitles.push({
        id: String(track.id ?? index),
        label: track.name || languageLabel(track.lang) || `Subtitles ${index + 1}`,
        language: track.lang ?? null,
        active: hls.subtitleTrack === (track.id ?? index),
      });
    });

    const levels = hls.levels ?? [];
    if (levels.length > 1) {
      quality.push({ id: '-1', label: 'Auto', active: (hls.currentLevel ?? -1) === -1 });
      levels.forEach((level, index) => {
        quality.push({
          id: String(index),
          label: levelLabel(level),
          active: hls.currentLevel === index,
        });
      });
    }
  }

  // Native and mpegts both surface subtitles as DOM text tracks.
  if (engine !== 'hls' || subtitles.length === 0) {
    const textTracks = video.textTracks;
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
      subtitles.push({
        id: String(i),
        label: track.label || languageLabel(track.language) || `Subtitles ${i + 1}`,
        language: track.language || null,
        active: track.mode === 'showing',
      });
    }
  }

  if (engine !== 'hls') {
    const native = (video as unknown as { audioTracks?: NativeAudioTrackList }).audioTracks;
    if (native && native.length > 1) {
      for (let i = 0; i < native.length; i++) {
        const track = native[i];
        audio.push({
          id: track.id ?? String(i),
          label: track.label || languageLabel(track.language) || `Audio ${i + 1}`,
          language: track.language ?? null,
          active: track.enabled,
        });
      }
    }
  }

  return { audio, subtitles, quality };
}

export function selectAudioTrack(
  video: HTMLVideoElement | null,
  engine: EngineKind,
  handle: unknown,
  id: string,
): void {
  if (engine === 'hls' && handle) {
    (handle as HlsLike).audioTrack = Number(id);
    return;
  }
  const native = (video as unknown as { audioTracks?: NativeAudioTrackList } | null)?.audioTracks;
  if (!native) return;
  for (let i = 0; i < native.length; i++) {
    native[i].enabled = (native[i].id ?? String(i)) === id;
  }
}

/** `id` of null turns subtitles off — always an available choice. */
export function selectSubtitleTrack(
  video: HTMLVideoElement | null,
  engine: EngineKind,
  handle: unknown,
  id: string | null,
): void {
  if (engine === 'hls' && handle) {
    const hls = handle as HlsLike;
    if ((hls.subtitleTracks ?? []).length > 0) {
      hls.subtitleTrack = id === null ? -1 : Number(id);
      hls.subtitleDisplay = id !== null;
      return;
    }
  }
  if (!video) return;
  const textTracks = video.textTracks;
  for (let i = 0; i < textTracks.length; i++) {
    const track = textTracks[i];
    if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
    track.mode = id !== null && String(i) === id ? 'showing' : 'disabled';
  }
}

export function selectQualityLevel(engine: EngineKind, handle: unknown, id: string): void {
  if (engine !== 'hls' || !handle) return;
  const hls = handle as HlsLike;
  // -1 restores adaptive selection.
  hls.currentLevel = Number(id);
}
