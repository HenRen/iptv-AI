import type { Channel, EPGProgram, NowNext } from '@/types';
import { epgKey } from '../normalize';
import type { XmltvChannel } from './parser';

/**
 * EPG channel matching.
 *
 * Strictly deterministic, in confidence order:
 *   1. exact tvg-id            (100%)
 *   2. exact normalized name   (95%)
 *   3. stored user/AI override (whatever was approved)
 *
 * Anything that still fails is reported as `unmatched` and offered to the AI
 * matching service — which may only ever *propose* a mapping for approval. It
 * can never invent a programme, a title or a time.
 */

export interface EpgMapping {
  channelId: string;
  epgChannelId: string;
  confidence: number;
  method: 'tvg-id' | 'name' | 'override' | 'ai';
}

export interface MatchResult {
  mappings: EpgMapping[];
  unmatched: Channel[];
  /** EPG channels no playlist channel claimed. */
  orphanEpgChannels: XmltvChannel[];
}

export function matchChannels(
  channels: Channel[],
  epgChannels: XmltvChannel[],
  overrides: Record<string, string> = {},
): MatchResult {
  const byId = new Map<string, XmltvChannel>();
  const byName = new Map<string, XmltvChannel>();

  for (const ec of epgChannels) {
    byId.set(ec.id.toLowerCase(), ec);
    for (const dn of ec.displayNames) {
      const key = epgKey(dn);
      if (key && !byName.has(key)) byName.set(key, ec);
    }
    const idKey = epgKey(ec.id);
    if (idKey && !byName.has(idKey)) byName.set(idKey, ec);
  }

  const mappings: EpgMapping[] = [];
  const unmatched: Channel[] = [];
  const claimed = new Set<string>();

  for (const ch of channels) {
    const override = overrides[ch.id];
    if (override) {
      mappings.push({ channelId: ch.id, epgChannelId: override, confidence: 1, method: 'override' });
      claimed.add(override.toLowerCase());
      continue;
    }

    if (ch.tvgId) {
      const hit = byId.get(ch.tvgId.toLowerCase());
      if (hit) {
        mappings.push({ channelId: ch.id, epgChannelId: hit.id, confidence: 1, method: 'tvg-id' });
        claimed.add(hit.id.toLowerCase());
        continue;
      }
    }

    const nameHit =
      byName.get(epgKey(ch.name)) ??
      (ch.tvgName ? byName.get(epgKey(ch.tvgName)) : undefined) ??
      byName.get(epgKey(ch.rawName));
    if (nameHit) {
      mappings.push({ channelId: ch.id, epgChannelId: nameHit.id, confidence: 0.95, method: 'name' });
      claimed.add(nameHit.id.toLowerCase());
      continue;
    }

    unmatched.push(ch);
  }

  return {
    mappings,
    unmatched,
    orphanEpgChannels: epgChannels.filter((ec) => !claimed.has(ec.id.toLowerCase())),
  };
}

/** Group programmes by EPG channel id, sorted by start time. */
export function indexPrograms(programs: EPGProgram[]): Map<string, EPGProgram[]> {
  const map = new Map<string, EPGProgram[]>();
  for (const p of programs) {
    const key = p.channelKey.toLowerCase();
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start);
  return map;
}

export function nowNext(programs: EPGProgram[] | undefined, at = Date.now()): NowNext {
  if (!programs || programs.length === 0) return { now: null, next: null, progress: 0 };

  // Binary search for the last programme starting at or before `at`.
  let lo = 0;
  let hi = programs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (programs[mid].start <= at) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const candidate = idx >= 0 ? programs[idx] : null;
  const current = candidate && candidate.stop > at ? candidate : null;
  const next = programs[idx + 1] ?? null;
  const progress = current
    ? Math.min(1, Math.max(0, (at - current.start) / Math.max(1, current.stop - current.start)))
    : 0;

  return { now: current, next, progress };
}

/** Programmes overlapping a window — the guide grid's only query. */
export function programsInWindow(
  programs: EPGProgram[] | undefined,
  from: number,
  to: number,
): EPGProgram[] {
  if (!programs || programs.length === 0) return [];
  const out: EPGProgram[] = [];
  for (const p of programs) {
    if (p.stop <= from) continue;
    if (p.start >= to) break;
    out.push(p);
  }
  return out;
}
