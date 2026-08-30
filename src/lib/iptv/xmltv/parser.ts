import type { EPGProgram } from '@/types';
import { parseXmltvTime } from '@/lib/utils/time';

/**
 * XMLTV parser.
 *
 * Written as a hand-rolled scanner rather than a DOM parse: provider EPG
 * feeds are commonly 50–300 MB of XML and a DOM would blow the heap. This
 * walks the document once and only materializes the fields we model.
 */

export interface XmltvChannel {
  id: string;
  displayNames: string[];
  icon: string | null;
}

export interface XmltvResult {
  channels: XmltvChannel[];
  programs: EPGProgram[];
  skipped: number;
}

const CHANNEL_RE = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g;
const PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
const PROGRAMME_SELF_CLOSING_RE = /<programme\b([^>]*)\/>/g;

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? '');
}

function tagText(body: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(body);
  return m ? decodeEntities(stripCdata(m[1])).trim() || null : null;
}

function allTagText(body: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const v = decodeEntities(stripCdata(m[1])).trim();
    if (v) out.push(v);
  }
  return out;
}

function tagAttr(body: string, tag: string, name: string): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*)/?>`, 'i');
  const m = re.exec(body);
  return m ? attr(m[1], name) : null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const n = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    if (code.startsWith('#')) {
      const n = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function parseXmltv(xml: string): XmltvResult {
  const channels: XmltvChannel[] = [];
  const programs: EPGProgram[] = [];
  let skipped = 0;

  CHANNEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHANNEL_RE.exec(xml)) !== null) {
    const id = attr(m[1], 'id');
    if (!id) continue;
    channels.push({
      id,
      displayNames: allTagText(m[2], 'display-name'),
      icon: tagAttr(m[2], 'icon', 'src'),
    });
  }

  let seq = 0;
  PROGRAMME_RE.lastIndex = 0;
  while ((m = PROGRAMME_RE.exec(xml)) !== null) {
    const p = buildProgram(m[1], m[2], seq);
    if (p) {
      programs.push(p);
      seq++;
    } else skipped++;
  }

  // Rare, but some generators emit empty self-closing programmes.
  PROGRAMME_SELF_CLOSING_RE.lastIndex = 0;
  while ((m = PROGRAMME_SELF_CLOSING_RE.exec(xml)) !== null) {
    const p = buildProgram(m[1], '', seq);
    if (p) {
      programs.push(p);
      seq++;
    } else skipped++;
  }

  programs.sort((a, b) => a.start - b.start);
  return { channels, programs, skipped };
}

function buildProgram(attrs: string, body: string, seq: number): EPGProgram | null {
  const channelKey = attr(attrs, 'channel');
  const startRaw = attr(attrs, 'start');
  const stopRaw = attr(attrs, 'stop');
  if (!channelKey || !startRaw) return null;

  const start = parseXmltvTime(startRaw);
  if (start == null) return null;
  let stop = stopRaw ? parseXmltvTime(stopRaw) : null;
  // A programme with no stop is given a nominal 30 minutes so the grid can
  // still lay it out; it is corrected by the next programme on the channel.
  if (stop == null || stop <= start) stop = start + 30 * 60_000;

  const title = body ? tagText(body, 'title') : null;
  const episodeNum = body ? tagText(body, 'episode-num') : null;

  return {
    id: `${channelKey}#${start}#${seq}`,
    channelKey,
    title: title ?? 'No information',
    description: body ? tagText(body, 'desc') : null,
    start,
    stop,
    category: body ? tagText(body, 'category') : null,
    episode: episodeNum,
    icon: body ? tagAttr(body, 'icon', 'src') : null,
    rating: body ? tagText(body, 'rating') : null,
  };
}

/** Close gaps where a programme had no stop time by clamping to the next start. */
export function tightenSchedule(programs: EPGProgram[]): EPGProgram[] {
  const byChannel = new Map<string, EPGProgram[]>();
  for (const p of programs) {
    const list = byChannel.get(p.channelKey);
    if (list) list.push(p);
    else byChannel.set(p.channelKey, [p]);
  }
  for (const list of byChannel.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].stop > list[i + 1].start) list[i].stop = list[i + 1].start;
    }
  }
  return programs;
}
