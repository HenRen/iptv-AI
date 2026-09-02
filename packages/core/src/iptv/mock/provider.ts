import type { Category, Channel, EPGProgram, Movie, Series } from '../../types/index';
import { classifyGenre, familyKey, parseChannelName } from '../normalize';

/**
 * Mock IPTV provider.
 *
 * Lets the whole UI be developed and tested without hammering a real
 * provider (and without needing credentials in CI). Deliberately built from
 * the same raw-looking strings a real playlist contains — "NL | ESPN 1 FHD
 * VIP" — so the normalization pipeline is exercised, not bypassed.
 */

const RAW_CHANNELS: Array<[string, string]> = [
  ['NL | NPO 1 FHD', 'NL Entertainment'],
  ['NL | NPO 2 HD', 'NL Entertainment'],
  ['NL | NPO 3 HD', 'NL Entertainment'],
  ['NL | RTL 4 FHD VIP', 'NL Entertainment'],
  ['NL | RTL 5 HD', 'NL Entertainment'],
  ['NL: SBS 6 HD', 'NL Entertainment'],
  ['NL | ESPN 1 FHD', 'NL Sports'],
  ['NL ESPN 1 HD (Backup)', 'NL Sports'],
  ['NL | ESPN 2 HD', 'NL Sports'],
  ['NL | ZIGGO SPORT SELECT FHD', 'NL Sports'],
  ['NL | ZIGGO SPORT VOETBAL HD', 'NL Sports'],
  ['NL | VIAPLAY SPORT 1 4K', 'NL Sports'],
  ['UK | SKY SPORTS MAIN EVENT FHD', 'UK Sports'],
  ['UK | SKY SPORTS FOOTBALL HD', 'UK Sports'],
  ['US | ESPN HD', 'US Sports'],
  ['US | CNN HD', 'US News'],
  ['US | FOX NEWS HD', 'US News'],
  ['UK | BBC NEWS FHD', 'UK News'],
  ['NL | NOS JOURNAAL 24 HD', 'NL News'],
  ['FR | FRANCE 24 HD', 'International News'],
  ['NL | DISCOVERY CHANNEL HD', 'Documentary'],
  ['NL | NATIONAL GEOGRAPHIC FHD', 'Documentary'],
  ['NL | ANIMAL PLANET HD', 'Documentary'],
  ['NL | NICKELODEON HD', 'Kids'],
  ['NL | DISNEY CHANNEL HD', 'Kids'],
  ['NL | CARTOON NETWORK SD', 'Kids'],
  ['NL | FILM1 PREMIERE FHD', 'Movies'],
  ['NL | FILM1 ACTION HD', 'Movies'],
  ['NL | MTV HITS HD', 'Music'],
  ['NL | XITE HD', 'Music'],
];

const MOVIE_TITLES: Array<[string, string, number, number]> = [
  ['Moneyball (2011)', 'Drama', 2011, 7.6],
  ['Interstellar (2014)', 'Science Fiction', 2014, 8.6],
  ['The Grand Budapest Hotel (2014)', 'Comedy', 2014, 8.1],
  ['Mad Max Fury Road (2015)', 'Action', 2015, 8.1],
  ['Arrival (2016)', 'Science Fiction', 2016, 7.9],
  ['Parasite (2019)', 'Thriller', 2019, 8.5],
  ['Dune (2021)', 'Science Fiction', 2021, 8.0],
  ['Everything Everywhere All At Once (2022)', 'Comedy', 2022, 7.8],
  ['The Batman (2022)', 'Action', 2022, 7.8],
  ['Top Gun Maverick (2022)', 'Action', 2022, 8.3],
  ['Oppenheimer (2023)', 'Drama', 2023, 8.4],
  ['Past Lives (2023)', 'Drama', 2023, 7.8],
  ['The Menu (2022)', 'Horror', 2022, 7.2],
  ['Knives Out (2019)', 'Comedy', 2019, 7.9],
  ['Sicario (2015)', 'Thriller', 2015, 7.6],
  ['Whiplash (2014)', 'Drama', 2014, 8.5],
  ['Blade Runner 2049 (2017)', 'Science Fiction', 2017, 8.0],
  ['Get Out (2017)', 'Horror', 2017, 7.7],
  ['Paddington 2 (2017)', 'Family', 2017, 7.8],
  ['Free Solo (2018)', 'Documentary', 2018, 8.1],
];

const SERIES_TITLES: Array<[string, string, number, number, number]> = [
  // name, genre, year, seasons, episodes per season
  ['Ted Lasso', 'Comedy', 2020, 3, 10],
  ['Slow Horses', 'Thriller', 2022, 4, 6],
  ['Severance', 'Science Fiction', 2022, 2, 9],
  ['The Bear', 'Drama', 2022, 3, 10],
  ['Shogun', 'Drama', 2024, 1, 10],
  ['Andor', 'Science Fiction', 2022, 2, 12],
  ['Bluey', 'Kids', 2018, 3, 12],
  ['Planet Earth III', 'Documentary', 2023, 1, 8],
  ['Formula 1 Drive to Survive', 'Documentary', 2019, 6, 10],
  ['Dark', 'Thriller', 2017, 3, 8],
];

const EPG_TEMPLATES: Record<string, string[]> = {
  sports: [
    'Live: Eredivisie',
    'Champions League Highlights',
    'Match of the Day',
    'Live: Premier League',
    'SportsCenter',
    'Formula 1: Qualifying',
    'Analysis',
  ],
  news: ['NOS Journaal', 'World News', 'Newsroom', 'Business Report', 'EenVandaag', 'Headlines'],
  kids: ['Bluey', 'SpongeBob SquarePants', 'PAW Patrol', 'Cartoon Hour', 'Junior Movie'],
  documentary: [
    'Planet Earth',
    'Air Crash Investigation',
    'How It Is Made',
    'Wild Frontiers',
    'Ancient Mysteries',
  ],
  movies: ['Feature Presentation', 'Late Night Movie', 'Premiere', 'Classic Cinema'],
  music: ['Top 40 Countdown', 'Non-Stop Hits', 'Live Sessions', 'Throwback Hour'],
  entertainment: [
    'The Evening Show',
    'Quiz Night',
    'Soap Marathon',
    'Talk Show',
    'Prime Time Special',
    'Late Night',
  ],
  other: ['Programme', 'Continuous Coverage', 'Scheduled Broadcast'],
};

/** Deterministic PRNG so mock data is identical between runs and in CI. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface MockCatalog {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  liveCategories: Category[];
  movieCategories: Category[];
  seriesCategories: Category[];
  programs: EPGProgram[];
}

export function buildMockCatalog(playlistId: string): MockCatalog {
  const rng = makeRng(0xc0ffee);

  const liveCatMap = new Map<string, Category>();
  const channels: Channel[] = RAW_CHANNELS.map(([rawName, group], i) => {
    const parsed = parseChannelName(rawName);
    const catId = `live-${group.toLowerCase().replace(/\s+/g, '-')}`;
    const existing = liveCatMap.get(catId);
    if (existing) existing.count++;
    else
      liveCatMap.set(catId, {
        id: catId,
        name: group,
        kind: 'live',
        count: 1,
        genre: classifyGenre(group),
        adult: false,
      });

    const genre = classifyGenre(group, parsed.name);
    return {
      id: `${playlistId}:ch:${i + 1}`,
      playlistId,
      streamId: String(i + 1),
      number: i + 1,
      name: parsed.name,
      rawName,
      logo: null,
      categoryId: catId,
      categoryName: group,
      genre,
      quality: parsed.quality,
      country: parsed.country,
      language: parsed.language,
      tvgId: `mock.${parsed.name.toLowerCase().replace(/\s+/g, '')}`,
      tvgName: parsed.name,
      familyKey: familyKey(parsed.name, parsed.country),
      adult: false,
      container: 'hls' as const,
      directUrl: null,
    };
  });

  const movieCatMap = new Map<string, Category>();
  const movies: Movie[] = MOVIE_TITLES.map(([rawName, genre, year, rating], i) => {
    const catId = `movie-${genre.toLowerCase().replace(/\s+/g, '-')}`;
    const existing = movieCatMap.get(catId);
    if (existing) existing.count++;
    else
      movieCatMap.set(catId, {
        id: catId,
        name: genre,
        kind: 'movie',
        count: 1,
        genre: 'movies',
        adult: false,
      });
    return {
      id: `${playlistId}:mv:${i + 1}`,
      playlistId,
      streamId: String(i + 1),
      name: rawName.replace(/\s*\(\d{4}\)$/, ''),
      rawName,
      poster: null,
      backdrop: null,
      categoryId: catId,
      categoryName: genre,
      year,
      rating,
      durationSecs: Math.round(5400 + rng() * 3600),
      genre,
      plot: `${rawName.replace(/\s*\(\d{4}\)$/, '')} is sample catalogue data supplied by the mock provider so the interface can be developed without a live IPTV connection.`,
      cast: 'Sample Cast',
      director: 'Sample Director',
      container: 'mp4' as const,
      containerExt: 'mp4',
      directUrl: null,
      addedAt: Date.now() - i * 86_400_000,
      adult: false,
    };
  });

  const seriesCatMap = new Map<string, Category>();
  const series: Series[] = SERIES_TITLES.map(([name, genre, year, seasonCount, epCount], i) => {
    const catId = `series-${genre.toLowerCase().replace(/\s+/g, '-')}`;
    const existing = seriesCatMap.get(catId);
    if (existing) existing.count++;
    else
      seriesCatMap.set(catId, {
        id: catId,
        name: genre,
        kind: 'series',
        count: 1,
        genre: 'entertainment',
        adult: false,
      });

    const seriesId = String(i + 1);
    return {
      id: `${playlistId}:sr:${seriesId}`,
      playlistId,
      seriesId,
      name,
      rawName: name,
      poster: null,
      backdrop: null,
      categoryId: catId,
      categoryName: genre,
      year,
      rating: Math.round((6.5 + rng() * 2.5) * 10) / 10,
      genre,
      plot: `${name} is sample catalogue data supplied by the mock provider.`,
      cast: 'Sample Cast',
      director: null,
      addedAt: Date.now() - i * 86_400_000,
      adult: false,
      seasons: Array.from({ length: seasonCount }, (_, s) => ({
        seasonNumber: s + 1,
        name: `Season ${s + 1}`,
        overview: null,
        poster: null,
        episodes: Array.from({ length: epCount }, (_, e) => ({
          id: `${playlistId}:ep:${seriesId}-${s + 1}-${e + 1}`,
          seriesId,
          seasonNumber: s + 1,
          episodeNumber: e + 1,
          title: `Episode ${e + 1}`,
          plot: null,
          thumbnail: null,
          durationSecs: 1500 + Math.round(rng() * 900),
          container: 'mp4' as const,
          containerExt: 'mp4',
          directUrl: null,
        })),
      })),
    };
  });

  return {
    channels,
    movies,
    series,
    liveCategories: [...liveCatMap.values()],
    movieCategories: [...movieCatMap.values()],
    seriesCategories: [...seriesCatMap.values()],
    programs: buildMockEpg(channels),
  };
}

/** 48 hours of plausible schedule, aligned to the half hour. */
export function buildMockEpg(channels: Channel[], now = Date.now()): EPGProgram[] {
  const rng = makeRng(0xbadc0de);
  const programs: EPGProgram[] = [];
  const origin = new Date(now);
  origin.setHours(origin.getHours() - 6, 0, 0, 0);
  const start0 = origin.getTime();
  const horizon = now + 42 * 60 * 60 * 1000;

  // Quality variants of one service share a tvg-id on purpose — they are the
  // same broadcast. Generating a schedule per variant would produce two
  // interleaved, overlapping schedules under one key, so build once per id.
  const seen = new Set<string>();

  for (const ch of channels) {
    if (!ch.tvgId) continue;
    const key = ch.tvgId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const titles = EPG_TEMPLATES[ch.genre] ?? EPG_TEMPLATES.other;
    let cursor = start0;
    let n = 0;
    while (cursor < horizon) {
      // 30 / 60 / 90 / 120 minute slots.
      const slots = [1, 2, 2, 3, 4][Math.floor(rng() * 5)];
      const duration = slots * 30 * 60_000;
      const title = titles[Math.floor(rng() * titles.length)];
      programs.push({
        id: `${ch.tvgId}#${cursor}#${n}`,
        channelKey: ch.tvgId,
        title,
        description: `${title} on ${ch.name}. Sample programme data from the mock provider.`,
        start: cursor,
        stop: cursor + duration,
        category: ch.genre,
        episode: null,
        icon: null,
        rating: null,
      });
      cursor += duration;
      n++;
    }
  }
  programs.sort((a, b) => a.start - b.start);
  return programs;
}
