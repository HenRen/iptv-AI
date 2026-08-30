/**
 * Streaming-friendly M3U / M3U8 playlist parser.
 *
 * Deliberately allocation-light: real playlists routinely exceed 100k lines
 * and 40 MB, and this runs on the server during connect. It never builds an
 * intermediate array of the whole file beyond the split, and it tolerates the
 * malformed entries every provider emits.
 */

export interface RawM3UEntry {
  /** Raw title after the last comma on the #EXTINF line. */
  title: string;
  url: string;
  durationSecs: number;
  attrs: Record<string, string>;
  /** #EXTGRP fallback when group-title is absent. */
  group: string | null;
  /** VLC options (#EXTVLCOPT) such as http-user-agent. */
  vlcOpts: Record<string, string>;
}

export interface M3UParseResult {
  entries: RawM3UEntry[];
  /** Attributes on the #EXTM3U header line, e.g. url-tvg / x-tvg-url. */
  header: Record<string, string>;
  malformed: number;
}

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

function parseAttrs(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(input)) !== null) {
    out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

export function parseM3U(text: string): M3UParseResult {
  const entries: RawM3UEntry[] = [];
  let header: Record<string, string> = {};
  let malformed = 0;

  // Normalize line endings once; splitting is the single big allocation.
  const lines = text.split(/\r?\n/);

  let pending: {
    title: string;
    durationSecs: number;
    attrs: Record<string, string>;
    group: string | null;
    vlcOpts: Record<string, string>;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    if (line.startsWith('#EXTM3U')) {
      header = parseAttrs(line);
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const colon = line.indexOf(':');
      const rest = colon === -1 ? '' : line.slice(colon + 1);
      const comma = rest.lastIndexOf(',');
      const meta = comma === -1 ? rest : rest.slice(0, comma);
      const title = comma === -1 ? '' : rest.slice(comma + 1).trim();
      const duration = Number.parseFloat(meta);
      pending = {
        title,
        durationSecs: Number.isFinite(duration) && duration > 0 ? duration : 0,
        attrs: parseAttrs(meta),
        group: null,
        vlcOpts: {},
      };
      continue;
    }

    if (line.startsWith('#EXTGRP')) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (pending) pending.group = value || null;
      continue;
    }

    if (line.startsWith('#EXTVLCOPT')) {
      const value = line.slice(line.indexOf(':') + 1);
      const eq = value.indexOf('=');
      if (pending && eq > 0) {
        pending.vlcOpts[value.slice(0, eq).trim().toLowerCase()] = value.slice(eq + 1).trim();
      }
      continue;
    }

    // Any other comment/directive we do not model.
    if (line.startsWith('#')) continue;

    // A bare URL line closes the pending entry.
    if (pending) {
      entries.push({
        title: pending.title || pending.attrs['tvg-name'] || '',
        url: line,
        durationSecs: pending.durationSecs,
        attrs: pending.attrs,
        group: pending.group ?? pending.attrs['group-title'] ?? null,
        vlcOpts: pending.vlcOpts,
      });
      pending = null;
    } else {
      // URL with no preceding #EXTINF — still playable, but unnamed.
      malformed++;
      entries.push({
        title: '',
        url: line,
        durationSecs: 0,
        attrs: {},
        group: null,
        vlcOpts: {},
      });
    }
  }

  return { entries, header, malformed };
}

/** The XMLTV URL a provider may advertise on the #EXTM3U line. */
export function epgUrlFromHeader(header: Record<string, string>): string | null {
  return header['url-tvg'] || header['x-tvg-url'] || header['tvg-url'] || null;
}
