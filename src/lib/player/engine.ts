import type { StreamContainer } from '@/types';

/**
 * Playback engine selection.
 *
 * Browsers natively play very little of what IPTV providers actually serve:
 *   - HLS  is native only on Safari / iOS / tvOS; elsewhere hls.js does MSE.
 *   - MPEG-TS (the default Xtream live output) is native nowhere; mpegts.js
 *     transmuxes it to fMP4 in a worker and feeds MSE.
 *   - MKV is a container browsers largely refuse regardless of codec.
 *
 * So the engine is chosen per stream, and live playback keeps a second
 * candidate in reserve: HLS first (lighter, seekable, better recovery),
 * falling back to TS when the provider does not expose an .m3u8 variant.
 */

export type EngineKind = 'native' | 'hls' | 'mpegts' | 'unsupported';

export interface AttachedEngine {
  kind: EngineKind;
  /** The underlying engine instance (Hls / mpegts player), for track
   *  enumeration in src/lib/player/tracks.ts. Null for native playback. */
  handle: unknown;
  destroy: () => void;
}

export function canPlayNatively(video: HTMLVideoElement, container: StreamContainer): boolean {
  switch (container) {
    case 'hls':
      return (
        video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
        video.canPlayType('application/x-mpegURL') !== ''
      );
    case 'mp4':
      return video.canPlayType('video/mp4') !== '';
    case 'mpegts':
      return video.canPlayType('video/mp2t') !== '';
    case 'mkv':
      // Chrome will sometimes play a Matroska file with H.264 + AAC inside.
      return video.canPlayType('video/x-matroska') !== '' || video.canPlayType('video/webm') !== '';
    default:
      return false;
  }
}

export function chooseEngine(video: HTMLVideoElement, container: StreamContainer): EngineKind {
  if (container === 'hls') return canPlayNatively(video, 'hls') ? 'native' : 'hls';
  if (container === 'mpegts') return canPlayNatively(video, 'mpegts') ? 'native' : 'mpegts';
  if (container === 'mp4') return 'native';
  if (container === 'mkv') return canPlayNatively(video, 'mkv') ? 'native' : 'unsupported';
  return 'native';
}

export interface AttachOptions {
  url: string;
  container: StreamContainer;
  isLive: boolean;
  onError: (message: string, recoverable: boolean) => void;
  onReady?: () => void;
}

/**
 * Attach a stream to a <video>. Returns a handle whose `destroy` MUST be
 * called before attaching anything else — leaked MSE buffers are the usual
 * cause of "the third channel I try goes black".
 */
export async function attachStream(
  video: HTMLVideoElement,
  { url, container, isLive, onError, onReady }: AttachOptions,
): Promise<AttachedEngine> {
  const kind = chooseEngine(video, container);

  if (kind === 'unsupported') {
    onError(
      'This stream uses a format the browser cannot play. Try a different quality or a native app.',
      false,
    );
    return { kind, handle: null, destroy: () => {} };
  }

  if (kind === 'native') {
    video.src = url;
    video.load();
    onReady?.();
    return {
      kind,
      handle: null,
      destroy: () => {
        video.removeAttribute('src');
        video.load();
      },
    };
  }

  if (kind === 'hls') {
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
      onError('This browser cannot play HLS streams.', false);
      return { kind: 'unsupported', handle: null, destroy: () => {} };
    }
    const hls = new Hls({
      lowLatencyMode: false,
      enableWorker: true,
      // Live IPTV manifests are often short and drift; a deeper back buffer
      // wastes memory on a TV without improving anything.
      backBufferLength: isLive ? 30 : 90,
      maxBufferLength: isLive ? 20 : 60,
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 4,
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => onReady?.());
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          // A live stream dropping a segment is routine; recover in place.
          hls.startLoad();
          onError('Reconnecting to the stream…', true);
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          onError('Recovering playback…', true);
          break;
        default:
          onError('This stream could not be played.', false);
          hls.destroy();
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);
    return { kind, handle: hls, destroy: () => hls.destroy() };
  }

  // mpegts
  const mpegts = (await import('mpegts.js')).default;
  if (!mpegts.isSupported()) {
    onError('This browser cannot play MPEG-TS streams.', false);
    return { kind: 'unsupported', handle: null, destroy: () => {} };
  }
  const player = mpegts.createPlayer(
    { type: 'mpegts', isLive, url, cors: false },
    {
      enableWorker: true,
      enableStashBuffer: false,
      stashInitialSize: 128,
      liveBufferLatencyChasing: isLive,
      liveBufferLatencyMaxLatency: 6,
      liveBufferLatencyMinRemain: 1,
      lazyLoad: false,
    },
  );
  player.on(mpegts.Events.ERROR, () => {
    onError('This stream could not be played.', false);
  });
  player.on(mpegts.Events.MEDIA_INFO, () => onReady?.());
  player.attachMediaElement(video);
  player.load();

  return {
    kind,
    handle: player,
    destroy: () => {
      try {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      } catch {
        // A player destroyed mid-load throws; nothing useful to do about it.
      }
    },
  };
}
