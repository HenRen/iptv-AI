import { describe, expect, it } from 'vitest';
import { epgUrlFromHeader, parseM3U } from '@/lib/iptv/m3u/parser';
import { adaptM3U } from '@/lib/iptv/m3u/adapter';

const PLAYLIST = `#EXTM3U url-tvg="http://example.tv/xmltv.php"
#EXTINF:-1 tvg-id="espn1.nl" tvg-name="ESPN 1" tvg-logo="http://img.example.tv/espn1.png" group-title="NL Sports",NL | ESPN 1 FHD
http://example.tv/live/user/pass/101.ts
#EXTINF:-1 tvg-id="cnn.us" tvg-logo="http://img.example.tv/cnn.png" group-title="US News",US: CNN HD
http://example.tv/live/user/pass/102.ts
#EXTINF:-1 group-title="Movies",The Matrix (1999)
http://example.tv/movie/user/pass/500.mp4
#EXTINF:-1 group-title="Series",Ted Lasso S01E01
http://example.tv/series/user/pass/900.mkv
#EXTINF:-1 group-title="Series",Ted Lasso S01E02
http://example.tv/series/user/pass/901.mkv
#EXTINF:-1 group-title="Series",Ted Lasso S02E01
http://example.tv/series/user/pass/902.mkv
`;

describe('parseM3U', () => {
  it('reads header attributes and every entry', () => {
    const result = parseM3U(PLAYLIST);
    expect(result.entries).toHaveLength(6);
    expect(epgUrlFromHeader(result.header)).toBe('http://example.tv/xmltv.php');
    expect(result.malformed).toBe(0);
  });

  it('parses attributes and the title after the last comma', () => {
    const [first] = parseM3U(PLAYLIST).entries;
    expect(first.title).toBe('NL | ESPN 1 FHD');
    expect(first.attrs['tvg-id']).toBe('espn1.nl');
    expect(first.group).toBe('NL Sports');
    expect(first.url).toBe('http://example.tv/live/user/pass/101.ts');
  });

  it('survives CRLF line endings', () => {
    const result = parseM3U(PLAYLIST.replace(/\n/g, '\r\n'));
    expect(result.entries).toHaveLength(6);
  });

  it('honours #EXTGRP when group-title is absent', () => {
    const result = parseM3U('#EXTM3U\n#EXTINF:-1,Channel\n#EXTGRP:Docs\nhttp://x/1.ts\n');
    expect(result.entries[0].group).toBe('Docs');
  });

  it('captures #EXTVLCOPT options', () => {
    const result = parseM3U(
      '#EXTM3U\n#EXTINF:-1,Channel\n#EXTVLCOPT:http-user-agent=VLC/3.0\nhttp://x/1.ts\n',
    );
    expect(result.entries[0].vlcOpts['http-user-agent']).toBe('VLC/3.0');
  });

  it('counts a bare URL with no #EXTINF as malformed but keeps it', () => {
    const result = parseM3U('#EXTM3U\nhttp://x/orphan.ts\n');
    expect(result.malformed).toBe(1);
    expect(result.entries).toHaveLength(1);
  });

  it('ignores comments it does not model', () => {
    const result = parseM3U('#EXTM3U\n#PLAYLIST:Mine\n#EXTINF:-1,A\nhttp://x/1.ts\n');
    expect(result.entries).toHaveLength(1);
  });
});

describe('adaptM3U', () => {
  const catalog = adaptM3U(PLAYLIST, 'pl1');

  it('splits live, movie and series by URL shape', () => {
    expect(catalog.channels).toHaveLength(2);
    expect(catalog.movies).toHaveLength(1);
    expect(catalog.series).toHaveLength(1);
  });

  it('normalizes channel names and carries tvg data through', () => {
    const espn = catalog.channels[0];
    expect(espn.name).toBe('ESPN 1');
    expect(espn.quality).toBe('FHD');
    expect(espn.country).toBe('Netherlands');
    expect(espn.tvgId).toBe('espn1.nl');
    expect(espn.genre).toBe('sports');
    expect(espn.number).toBe(1);
  });

  it('builds categories with counts', () => {
    expect(catalog.liveCategories.map((c) => c.name).sort()).toEqual(['NL Sports', 'US News']);
    expect(catalog.liveCategories.every((c) => c.count === 1)).toBe(true);
  });

  it('groups episodes into seasons in order', () => {
    const [series] = catalog.series;
    expect(series.name).toBe('Ted Lasso');
    expect(series.seasons).toHaveLength(2);
    expect(series.seasons?.[0].episodes).toHaveLength(2);
    expect(series.seasons?.[0].episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(series.seasons?.[1].seasonNumber).toBe(2);
  });

  it('extracts the movie year and title', () => {
    expect(catalog.movies[0].name).toBe('The Matrix');
    expect(catalog.movies[0].year).toBe(1999);
  });

  it('picks up the EPG url from the header', () => {
    expect(catalog.epgUrl).toBe('http://example.tv/xmltv.php');
  });

  it('produces ids that are stable across parses', () => {
    const again = adaptM3U(PLAYLIST, 'pl1');
    expect(again.channels.map((c) => c.id)).toEqual(catalog.channels.map((c) => c.id));
  });

  it('handles an empty playlist without throwing', () => {
    const empty = adaptM3U('#EXTM3U\n', 'pl1');
    expect(empty.channels).toHaveLength(0);
    expect(empty.movies).toHaveLength(0);
  });
});
