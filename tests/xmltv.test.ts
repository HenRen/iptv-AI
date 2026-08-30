import { describe, expect, it } from 'vitest';
import { parseXmltv, tightenSchedule } from '@/lib/iptv/xmltv/parser';
import { indexPrograms, matchChannels, nowNext, programsInWindow } from '@/lib/iptv/xmltv/matcher';
import { parseXmltvTime } from '@/lib/utils/time';
import type { Channel } from '@/types';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="espn1.nl">
    <display-name>ESPN 1</display-name>
    <display-name>ESPN 1 Netherlands</display-name>
    <icon src="http://img/espn1.png" />
  </channel>
  <channel id="cnn.us">
    <display-name>CNN</display-name>
  </channel>
  <programme start="20260830180000 +0000" stop="20260830200000 +0000" channel="espn1.nl">
    <title>Live Football</title>
    <desc>A match &amp; analysis</desc>
    <category>Sports</category>
  </programme>
  <programme start="20260830200000 +0000" stop="20260830210000 +0000" channel="espn1.nl">
    <title><![CDATA[Analysis]]></title>
  </programme>
  <programme start="20260830180000 +0000" channel="cnn.us">
    <title>Newsroom</title>
  </programme>
</tv>`;

describe('parseXmltvTime', () => {
  it('parses with an offset', () => {
    expect(parseXmltvTime('20260830183000 +0200')).toBe(Date.parse('2026-08-30T18:30:00+02:00'));
  });
  it('treats a missing offset as UTC', () => {
    expect(parseXmltvTime('20260830183000')).toBe(Date.parse('2026-08-30T18:30:00Z'));
  });
  it('returns null for junk', () => {
    expect(parseXmltvTime('not a time')).toBeNull();
  });
});

describe('parseXmltv', () => {
  const result = parseXmltv(XML);

  it('reads channels with all display names', () => {
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0].displayNames).toEqual(['ESPN 1', 'ESPN 1 Netherlands']);
    expect(result.channels[0].icon).toBe('http://img/espn1.png');
  });

  it('reads programmes and decodes entities and CDATA', () => {
    expect(result.programs).toHaveLength(3);
    const football = result.programs.find((p) => p.title === 'Live Football');
    expect(football?.description).toBe('A match & analysis');
    expect(result.programs.some((p) => p.title === 'Analysis')).toBe(true);
  });

  it('gives a programme with no stop a nominal duration', () => {
    const newsroom = result.programs.find((p) => p.title === 'Newsroom');
    expect(newsroom).toBeDefined();
    expect(newsroom!.stop).toBeGreaterThan(newsroom!.start);
  });

  it('returns programmes sorted by start', () => {
    const starts = result.programs.map((p) => p.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('does not throw on empty or malformed input', () => {
    expect(parseXmltv('').programs).toHaveLength(0);
    expect(parseXmltv('<tv><programme /></tv>').skipped).toBeGreaterThan(0);
  });
});

describe('tightenSchedule', () => {
  it('clamps an overlapping stop to the next start', () => {
    const programs = tightenSchedule([
      { id: 'a', channelKey: 'x', title: 'A', description: null, start: 0, stop: 100, category: null, episode: null, icon: null, rating: null },
      { id: 'b', channelKey: 'x', title: 'B', description: null, start: 50, stop: 150, category: null, episode: null, icon: null, rating: null },
    ]);
    expect(programs[0].stop).toBe(50);
  });
});

describe('matchChannels', () => {
  const channels = [
    ch('c1', 'ESPN 1', 'espn1.nl'),
    ch('c2', 'CNN', null),
    ch('c3', 'Unknown Channel', null),
  ];
  const epgChannels = parseXmltv(XML).channels;

  it('matches on tvg-id first', () => {
    const result = matchChannels(channels, epgChannels);
    const espn = result.mappings.find((m) => m.channelId === 'c1');
    expect(espn?.method).toBe('tvg-id');
    expect(espn?.confidence).toBe(1);
  });

  it('falls back to a normalized display name', () => {
    const result = matchChannels(channels, epgChannels);
    const cnn = result.mappings.find((m) => m.channelId === 'c2');
    expect(cnn?.method).toBe('name');
    expect(cnn?.epgChannelId).toBe('cnn.us');
  });

  it('reports what it could not match rather than guessing', () => {
    const result = matchChannels(channels, epgChannels);
    expect(result.unmatched.map((c) => c.id)).toEqual(['c3']);
  });

  it('lets a stored override win', () => {
    const result = matchChannels(channels, epgChannels, { c3: 'cnn.us' });
    const override = result.mappings.find((m) => m.channelId === 'c3');
    expect(override?.method).toBe('override');
    expect(result.unmatched).toHaveLength(0);
  });
});

describe('nowNext', () => {
  const programs = indexPrograms(parseXmltv(XML).programs).get('espn1.nl')!;
  const during = Date.parse('2026-08-30T19:00:00Z');

  it('finds the current programme and its progress', () => {
    const result = nowNext(programs, during);
    expect(result.now?.title).toBe('Live Football');
    expect(result.next?.title).toBe('Analysis');
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('returns nothing on an empty schedule', () => {
    expect(nowNext([], during)).toEqual({ now: null, next: null, progress: 0 });
  });

  it('reports no current programme in a gap, but still finds the next one', () => {
    const before = Date.parse('2026-08-30T10:00:00Z');
    const result = nowNext(programs, before);
    expect(result.now).toBeNull();
    expect(result.next?.title).toBe('Live Football');
  });
});

describe('programsInWindow', () => {
  const programs = indexPrograms(parseXmltv(XML).programs).get('espn1.nl')!;

  it('returns programmes overlapping the window', () => {
    const from = Date.parse('2026-08-30T19:30:00Z');
    const to = Date.parse('2026-08-30T20:30:00Z');
    expect(programsInWindow(programs, from, to).map((p) => p.title)).toEqual([
      'Live Football',
      'Analysis',
    ]);
  });

  it('excludes programmes entirely outside it', () => {
    const from = Date.parse('2026-08-31T00:00:00Z');
    expect(programsInWindow(programs, from, from + 3_600_000)).toHaveLength(0);
  });
});

function ch(id: string, name: string, tvgId: string | null): Channel {
  return {
    id,
    playlistId: 'pl1',
    streamId: id,
    number: 1,
    name,
    rawName: name,
    logo: null,
    categoryId: null,
    categoryName: null,
    genre: 'other',
    quality: 'unknown',
    country: null,
    language: null,
    tvgId,
    tvgName: null,
    familyKey: name,
    adult: false,
    container: 'mpegts',
    directUrl: null,
  };
}
