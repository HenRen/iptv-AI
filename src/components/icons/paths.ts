/**
 * StreamWise proprietary icon language.
 *
 * Ported verbatim from `IPTV Icon System.dc.html`. Every icon is generated
 * from three primitives rather than drawn independently, which is what makes
 * the family read as one system at 16px and at 96px:
 *
 *   01 · Broadcast Frame     16:9 rounded geometry — the shared DNA. Never a
 *                            literal TV outline.
 *   02 · The Signal Cut      one diagonal interruption in every frame — the
 *                            brand's fingerprint for signal and transmission.
 *   03 · Intelligence Node   a four-point constellation shared by the whole
 *                            AI sub-family. Never a sparkle.
 *
 * Master grid 24 × 24, 1.6px stroke, round caps and joins.
 *
 * Because the paths are generated, the geometry stays exact: changing the
 * frame radius once changes every icon built on it, which is not true of a
 * hand-drawn set.
 */

const n = (v: number) => Math.round(v * 100) / 100;

/** A 0-length segment — renders as a round dot under `stroke-linecap:round`. */
export const dot = (x: number, y: number) => `M${n(x)} ${n(y)}h.01`;

/** Rounded rectangle. */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${y}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(
    -(w - 2 * r),
  )}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}`;

/** Rounded rectangle with a gap on the top edge, near the right. */
export const rrGap = (x: number, y: number, w: number, h: number, r: number) => {
  const ge = x + w - r - 1.2;
  const gs = ge - 2.8;
  return `M${n(ge)} ${y}h${n(x + w - r - ge)}a${r} ${r} 0 0 1 ${r} ${r}v${n(
    h - 2 * r,
  )}a${r} ${r} 0 0 1 ${-r} ${r}h${n(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(
    -(h - 2 * r),
  )}a${r} ${r} 0 0 1 ${r} ${-r}h${n(gs - (x + r))}`;
};

/** The diagonal slash that sits in the frame's gap. */
export const slashAt = (x: number, y: number, w: number, h: number, r: number) => {
  const ge = x + w - r - 1.2;
  const gs = ge - 2.8;
  const cx = (gs + ge) / 2;
  return `M${n(cx - 0.5)} ${n(y - 1.3)}l1 2.6`;
};

/** Broadcast Frame + Signal Cut — the combination most icons are built on. */
export const rrCut = (x: number, y: number, w: number, h: number, r: number) =>
  rrGap(x, y, w, h, r) + slashAt(x, y, w, h, r);

/** Intelligence Node — four points around a centre. */
export const NODE = (cx: number, cy: number, r = 1.9) =>
  dot(cx, cy) + dot(cx, cy - r) + dot(cx + r, cy) + dot(cx, cy + r) + dot(cx - r, cy);

/** The canonical frame every framed icon uses. */
export const FR = rrCut(3.5, 7, 17, 10, 2.5);

const liveNoDot = FR + 'M9.3 9.8a3.9 3.9 0 0 0 0 4.4M14.7 14.2a3.9 3.9 0 0 0 0-4.4';
const liveDot = dot(12, 12);
const liveD = liveNoDot + liveDot;

/* ------------------------------------------------------------------ *
 * The family
 * ------------------------------------------------------------------ */

export const ICON_PATHS = {
  /* Navigation */
  'iptv-home': FR + 'M7 10.6h10M7 13.6h4.2M13.6 13.6h3.4',
  'iptv-live': liveD,
  'iptv-guide': FR + 'M8.6 7v10M11.2 10.4h6M11.2 13.6h3.6' + dot(16.9, 13.6),
  'iptv-channels': 'M6.5 4.7h11' + rrCut(3.5, 8, 17, 8, 2.2) + 'M6.5 19.3h11' + dot(9, 12),
  'iptv-search': rrCut(4, 6.5, 12.5, 8.5, 2.2) + 'M14.9 13.5l4.7 4.7M9.1 9l3.1 1.75-3.1 1.75z',
  'iptv-favorites':
    FR + 'M12 14.8l-2.5-2.3a1.55 1.55 0 0 1 2.2-2.2l.3.3.3-.3a1.55 1.55 0 0 1 2.2 2.2z',
  'iptv-categories':
    rrCut(3.5, 6.6, 8, 5, 1.4) + rr(12.5, 6.6, 8, 5, 1.4) + rr(3.5, 12.6, 8, 5, 1.4) + rr(12.5, 12.6, 8, 5, 1.4),
  'iptv-profile':
    FR +
    'M13.7 10.6a1.7 1.7 0 1 1-3.4 0a1.7 1.7 0 1 1 3.4 0M8.6 15.2c.7-1.7 1.9-2.5 3.4-2.5s2.7.8 3.4 2.5',
  'iptv-settings':
    FR + 'M7 10.4h3.6M13.8 10.4h3.2' + dot(12.2, 10.4) + 'M7 13.6h1.2M11.4 13.6h5.6' + dot(9.8, 13.6),
  'iptv-voice': 'M6.4 10.8v2.4M9.2 9.2v5.6M12 7.4v9.2M14.8 9.2v5.6M17.6 10.8v2.4' + dot(12, 19.2),

  /* Content */
  'iptv-movies': FR + 'M7.3 7v10M10.9 9.9l3.4 1.85-3.4 1.85z',
  'iptv-series': 'M8.5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v4.5' + rrCut(3.5, 8.5, 14.5, 9, 2.4),
  'iptv-sports': FR + 'M7 14.8c1.4-3.8 4.4-5.6 7.4-5.4' + dot(16.6, 9.3),
  'iptv-playlists':
    'M6.5 5h10.5a2 2 0 0 1 2 2v1.4' + rrCut(3.5, 8.5, 13.5, 9, 2.2) + dot(20.4, 12.2) + dot(20.4, 15.2),
  'iptv-recent': FR + 'M15 12a3 3 0 1 1-.9-2.1M14.3 8.1l-.1 1.8 1.8.3',
  'iptv-continue':
    FR + 'M10.5 9.2l3.8 2.05-3.8 2.05z M6.8 14.9h4.6' + dot(13.9, 14.9) + dot(16.4, 14.9),
  'iptv-reminder':
    rrCut(3.5, 8.5, 13.5, 8, 2.2) +
    'M6.3 12.5h4.4M12.6 11v3' +
    dot(19.4, 6.1) +
    'M20.7 3.7a3.8 3.8 0 0 1 1.2 2.5',
  'iptv-record': FR + 'M14.7 12a2.7 2.7 0 1 1-5.4 0a2.7 2.7 0 1 1 5.4 0' + dot(12, 12),
  'iptv-download':
    'M8.8 17H6a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 6 7h12a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-2.8M12 10v6.6M9.6 14.2l2.4 2.4 2.4-2.4',
  'iptv-parental': FR + 'M12 9.2l2.7 1v2.1c0 1.7-1 2.7-2.7 3.3-1.7-.6-2.7-1.6-2.7-3.3v-2.1z',

  /* Player */
  'iptv-play': 'M9 10.6V7.2l8.6 4.8-8.6 4.8v-3.2',
  'iptv-pause': 'M9.2 7.5v9M14.8 7.5v3.4M14.8 14.1v2.4',
  'iptv-stop': rrCut(7.8, 7.8, 8.4, 8.4, 2),
  'iptv-next': 'M7.8 8.2l5.6 3.8-5.6 3.8zM16.4 7.8v8.4',
  'iptv-prev': 'M16.2 8.2l-5.6 3.8 5.6 3.8zM7.6 7.8v8.4',
  'iptv-ch-up': 'M7.6 14.6L12 10.2l4.4 4.4' + dot(12, 6.8),
  'iptv-ch-down': 'M7.6 9.8l4.4 4.4 4.4-4.4' + dot(12, 17.4),
  'iptv-back-10':
    'M7.6 7.6A6.2 6.2 0 1 0 12 5.8M7.6 4.4v3.2h3.2M10.6 10.5l1-.8v4.6M14.5 10.3h.1a1.3 1.3 0 0 1 1.3 1.3v1.4a1.3 1.3 0 0 1-1.3 1.3h-.1a1.3 1.3 0 0 1-1.3-1.3v-1.4a1.3 1.3 0 0 1 1.3-1.3z',
  'iptv-fwd-10':
    'M16.4 7.6A6.2 6.2 0 1 1 12 5.8M16.4 4.4v3.2h-3.2M8.6 10.5l1-.8v4.6M12.5 10.3h.1a1.3 1.3 0 0 1 1.3 1.3v1.4a1.3 1.3 0 0 1-1.3 1.3h-.1a1.3 1.3 0 0 1-1.3-1.3v-1.4a1.3 1.3 0 0 1 1.3-1.3z',
  'iptv-volume':
    'M5.2 10.2h2.6l3.4-2.9v9.4l-3.4-2.9H5.2zM14.6 9.6a4.2 4.2 0 0 1 0 4.8M17.2 8.2a6.6 6.6 0 0 1 0 7.6',
  'iptv-mute': 'M5.2 10.2h2.6l3.4-2.9v9.4l-3.4-2.9H5.2zM14.8 9.6l4.4 4.8M19.2 9.6l-4.4 4.8',
  'iptv-fullscreen':
    'M3.5 10.4V9.5A2.5 2.5 0 0 1 6 7h1.9M16.1 7H18a2.5 2.5 0 0 1 2.5 2.5v.9M20.5 13.6v.9a2.5 2.5 0 0 1-2.5 2.5h-1.9M7.9 17H6a2.5 2.5 0 0 1-2.5-2.5v-.9' +
    dot(12, 12),
  'iptv-exit-fs':
    'M9.5 4.5v3a2 2 0 0 1-2 2h-3M14.5 19.5v-3a2 2 0 0 1 2-2h3M14.5 4.5v3a2 2 0 0 0 2 2h3M9.5 19.5v-3a2 2 0 0 0-2-2h-3',
  'iptv-pip':
    'M16.9 7h1.1a2.5 2.5 0 0 1 2.5 2.5v1.6M13.4 7H6a2.5 2.5 0 0 0-2.5 2.5v5A2.5 2.5 0 0 0 6 17h4.6M14.7 5.7l1 2.6' +
    rr(13, 11.8, 7.5, 5.2, 1.5),
  'iptv-subtitles': FR + 'M6.8 11h5.6M6.8 13.8h3.2M12.4 13.8h4.8',
  'iptv-audio': rrCut(3.5, 8, 9.5, 8, 2.2) + 'M15.9 10a3.2 3.2 0 0 1 0 4M18.5 8.4a6 6 0 0 1 0 7.2',
  'iptv-quality': FR + rr(7.4, 10.2, 9.2, 3.6, 1.2),
  'iptv-favorite': 'M12 17l-4.6-4.3a2.9 2.9 0 0 1 4.1-4.1l.5.5.5-.5a2.9 2.9 0 0 1 4.1 4.1l-2.4 2.2',
  'iptv-info': 'M15.5 5.9a7 7 0 1 0 2.9 2.8M12 11.2v4.4' + dot(12, 8.2),

  /* AI intelligence */
  'iptv-ai':
    FR +
    dot(12, 12) +
    dot(8.4, 9.7) +
    dot(15.6, 9.7) +
    dot(8.4, 14.3) +
    dot(15.6, 14.3) +
    'M10.9 11.1l-1.4-1M13.1 11.1l1.4-1M10.9 12.9l-1.4 1M13.1 12.9l1.4 1',
  'iptv-ask-tv': FR + 'M6.6 12c.9-1.8 1.8-1.8 2.7 0s1.8 1.8 2.7 0' + NODE(16.3, 12, 1.7),
  'iptv-ai-search': rr(4, 6.5, 11.5, 8, 2.2) + 'M15.2 13.9l4.4 4.4' + NODE(9.75, 10.5, 1.7),
  'iptv-ai-recs': FR + NODE(8.8, 12, 1.7) + 'M13.4 9.9h3.6M13.4 12h3.6M13.4 14.1h2.2',
  'iptv-ai-cleanup':
    'M3.4 8l3.4-1M3.4 11.8l3.3.6M3.5 15.6l3.2-1.4' +
    NODE(12, 12, 1.9) +
    'M17.2 8.4h3.4M17.2 12h3.4M17.2 15.6h3.4',
  'iptv-ai-epg': rrCut(3.5, 7, 17, 10, 2.4) + 'M8.4 7v10M10.9 10.3h3.4' + NODE(16.4, 13.2, 1.5),
  'iptv-ai-diagnostics': FR + 'M6.5 12.2h1.8l1.3-2.3 1.8 4.4 1.4-2.1h1.2' + NODE(17, 12, 1.5),
  'iptv-ai-sports': FR + 'M7 14.8c1.2-3.2 3.6-4.9 6.2-5' + NODE(16, 9.6, 1.6),

  /* Utility.
   *
   * Not in the original sheet, but the app needs close, confirm, add and
   * chevrons. Built from the same construction rules — the Signal Cut's
   * diagonal, the frame's corner radius, the 24-grid — so they read as part
   * of the family rather than a second icon language bolted on. */
  'iptv-close': 'M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4',
  'iptv-check': 'M6.4 12.4l3.6 3.6 7.6-8',
  'iptv-plus': 'M12 6.6v10.8M6.6 12h10.8',
  'iptv-minus': 'M6.6 12h10.8',
  'iptv-chevron-right': 'M10 6.8l5.2 5.2-5.2 5.2',
  'iptv-chevron-left': 'M14 6.8L8.8 12l5.2 5.2',
  'iptv-chevron-down': 'M6.8 10l5.2 5.2L17.2 10',
  'iptv-refresh':
    'M19.4 12a7.4 7.4 0 1 1-2.2-5.3M19.4 4.4v3.6h-3.6',
  'iptv-trash':
    'M5.8 7.6h12.4M9.6 7.6V5.9a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.7M7.4 7.6l.8 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.8-10',
  'iptv-edit':
    'M11 6.4H6.6A2.2 2.2 0 0 0 4.4 8.6v8.8a2.2 2.2 0 0 0 2.2 2.2h8.8a2.2 2.2 0 0 0 2.2-2.2V13M16.1 4.9a1.9 1.9 0 0 1 2.7 2.7l-7.3 7.3-3.4.7.7-3.4z',
  'iptv-star': 'M12 5.4l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7L5.2 10.4l4.7-.7z',
  'iptv-send': 'M19.6 4.4L4.4 10.2l6.4 2.6 2.6 6.4z',
  'iptv-mic': 'M12 4.6a2.4 2.4 0 0 1 2.4 2.4v4.6a2.4 2.4 0 0 1-4.8 0V7A2.4 2.4 0 0 1 12 4.6M6.8 11.2a5.2 5.2 0 0 0 10.4 0M12 16.4v3',
  'iptv-eye-off':
    'M9.6 6.6a8.8 8.8 0 0 1 2.4-.3c4.5 0 7.6 3.2 8.6 5.1a1 1 0 0 1 0 1.2 13 13 0 0 1-2 2.5M6.6 8a13.6 13.6 0 0 0-3.2 3.4 1 1 0 0 0 0 1.2c1 1.9 4.1 5.1 8.6 5.1a9.3 9.3 0 0 0 3.4-.6M4.6 4.6l14.8 14.8',
  'iptv-shield-check': 'M12 4.4l6.4 2.4v5c0 4-2.4 6.4-6.4 7.8-4-1.4-6.4-3.8-6.4-7.8v-5zM9.2 11.6l2 2 3.6-3.8',

  /* System */
  'iptv-connection':
    rr(3, 4.5, 8.5, 5.5, 1.6) +
    rr(12.5, 14, 8.5, 5.5, 1.6) +
    'M9.4 10.6l1.2.9M14.6 13.4l-1.2-.9' +
    dot(12, 12),
  'iptv-health': FR + 'M6.5 12.3h2.2l1.4-2.5 1.9 4.8 1.5-2.3h3.6',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** The five icons the design nominates as the family's signature. */
export const SIGNATURE_ICONS: IconName[] = [
  'iptv-live',
  'iptv-guide',
  'iptv-movies',
  'iptv-ai',
  'iptv-ai-cleanup',
];

/** Bare primitives, for the icon-system reference screen. */
export const PRIMITIVES = {
  frameOnly: rr(3.5, 7, 17, 10, 2.5),
  frameGapped: rrGap(3.5, 7, 17, 10, 2.5),
  slashOnly: slashAt(3.5, 7, 17, 10, 2.5),
  nodeOnly: NODE(12, 12, 4.5),
};

/** The live icon's parts, for the pulsing on-air treatment. */
export const LIVE_PARTS = { liveNoDot, liveDot };
