import type { ContentGenre, Quality, StreamContainer } from '../types/index';

/**
 * Deterministic playlist normalization.
 *
 * This runs on 100% of entries before any AI is consulted. Real IPTV
 * playlists are ~95% mechanically parseable — "NL | ESPN 1 FHD VIP" does not
 * need a language model. The AI classification service (src/lib/ai) is only
 * offered the residue this file marks as `ambiguous`.
 */

const QUALITY_TOKENS: Array<[RegExp, Quality]> = [
  [/\b(4k|uhd|2160p?)\b/i, '4K'],
  [/\b(fhd|1080p?|full\s?hd)\b/i, 'FHD'],
  [/\b(hd|720p?)\b/i, 'HD'],
  [/\b(sd|480p?|low|lq)\b/i, 'SD'],
];

/** Junk that providers bolt onto channel names and that users never want to see. */
const NOISE_TOKENS = [
  'vip',
  'plus',
  'backup',
  'bk',
  'alt',
  'src',
  'source',
  'multi',
  'raw',
  'test',
  'h265',
  'h264',
  'hevc',
  'x265',
  '50fps',
  '60fps',
  'ott',
  'iptv',
  'premium',
  'exyu',
  'geo',
  'direct',
  'stable',
  'new',
];

const COUNTRY_CODES: Record<string, { country: string; language: string | null }> = {
  nl: { country: 'Netherlands', language: 'Dutch' },
  be: { country: 'Belgium', language: 'Dutch' },
  uk: { country: 'United Kingdom', language: 'English' },
  gb: { country: 'United Kingdom', language: 'English' },
  us: { country: 'United States', language: 'English' },
  usa: { country: 'United States', language: 'English' },
  ca: { country: 'Canada', language: 'English' },
  de: { country: 'Germany', language: 'German' },
  fr: { country: 'France', language: 'French' },
  es: { country: 'Spain', language: 'Spanish' },
  it: { country: 'Italy', language: 'Italian' },
  pt: { country: 'Portugal', language: 'Portuguese' },
  br: { country: 'Brazil', language: 'Portuguese' },
  pl: { country: 'Poland', language: 'Polish' },
  tr: { country: 'Turkey', language: 'Turkish' },
  ar: { country: 'Arabic', language: 'Arabic' },
  ru: { country: 'Russia', language: 'Russian' },
  se: { country: 'Sweden', language: 'Swedish' },
  no: { country: 'Norway', language: 'Norwegian' },
  dk: { country: 'Denmark', language: 'Danish' },
  fi: { country: 'Finland', language: 'Finnish' },
  in: { country: 'India', language: null },
  mx: { country: 'Mexico', language: 'Spanish' },
  ro: { country: 'Romania', language: 'Romanian' },
  gr: { country: 'Greece', language: 'Greek' },
  ch: { country: 'Switzerland', language: null },
  at: { country: 'Austria', language: 'German' },
  ie: { country: 'Ireland', language: 'English' },
  au: { country: 'Australia', language: 'English' },
  za: { country: 'South Africa', language: 'English' },
  cw: { country: 'Curaçao', language: 'Dutch' },
  sr: { country: 'Suriname', language: 'Dutch' },
};

const GENRE_RULES: Array<[ContentGenre, RegExp]> = [
  ['adult', /\b(adult|xxx|porn|18\+|erotic|playboy|brazzers|hustler|sex)\b/i],
  [
    'sports',
    /\b(sport|sports|espn|ziggo\s?sport|eurosport|dazn|bein|sky\s?sport|football|soccer|nfl|nba|nhl|mlb|ufc|f1|formula|golf|tennis|racing|fight|wwe|viaplay\s?sport|premier\s?league|la\s?liga|serie\s?a|bundesliga|champions)\b/i,
  ],
  [
    'news',
    /\b(news|nieuws|cnn|bbc\s?news|sky\s?news|fox\s?news|msnbc|al\s?jazeera|euronews|nos|rtl\s?z|bloomberg|cnbc|france\s?24|dw|nachrichten|actualit)\b/i,
  ],
  [
    'kids',
    /\b(kids|kind|child|cartoon|nick|nickelodeon|disney|junior|baby|boomerang|cbeebies|jeugd|animation|toon)\b/i,
  ],
  [
    'documentary',
    /\b(documentar|discovery|nat\s?geo|national\s?geographic|history|animal\s?planet|science|natuur|docu|investigation|crime\s?investigation)\b/i,
  ],
  ['music', /\b(music|muziek|mtv|vh1|slam|radio|hits|kiss|clubbing|trace|stingray|xite)\b/i],
  [
    'movies',
    /\b(movie|movies|cinema|film|hbo|starz|showtime|cinemax|paramount|sundance|amc|tnt\s?film|action|thriller|horror|comedy|drama)\b/i,
  ],
  ['religion', /\b(religio|church|islam|quran|christ|gospel|kerk|god|faith|catholic)\b/i],
  ['international', /\b(international|worldwide|global|arabic|turk|hindi|urdu|latino|africa|asia)\b/i],
  // Last resort before 'other': the catch-all bucket providers actually use
  // for general-audience channels. Without it every mainstream broadcaster
  // ends up unclassified, which empties the genre rails on Home.
  [
    'entertainment',
    /\b(entertainment|general|variety|lifestyle|reality|series|drama|comedy|talk|show|tv\s?\d|npo|rtl|sbs|bbc|itv|channel\s?\d|ard|zdf|tf1|rai|antena|canal)\b/i,
  ],
];

const ADULT_RE = GENRE_RULES[0][1];

const CONTAINER_BY_EXT: Record<string, StreamContainer> = {
  m3u8: 'hls',
  ts: 'mpegts',
  mpegts: 'mpegts',
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mp4',
  mkv: 'mkv',
  avi: 'unknown',
  flv: 'unknown',
};

export function containerFromExt(ext: string | null | undefined): StreamContainer {
  if (!ext) return 'unknown';
  return CONTAINER_BY_EXT[ext.replace(/^\./, '').toLowerCase()] ?? 'unknown';
}

export function containerFromUrl(url: string): StreamContainer {
  try {
    const path = new URL(url, 'http://x').pathname;
    const ext = path.includes('.') ? path.split('.').pop() : null;
    return containerFromExt(ext);
  } catch {
    return 'unknown';
  }
}

export interface ParsedChannelName {
  /** Cleaned, human display name. */
  name: string;
  quality: Quality;
  country: string | null;
  language: string | null;
  tags: string[];
  /** True when the cleaner had to fall back to the raw name. */
  ambiguous: boolean;
}

/**
 * "NL | ESPN 1 FHD VIP"  ->  { name: "ESPN 1", quality: "FHD", country: "Netherlands" }
 * "US: CNN HD (Backup)"  ->  { name: "CNN", quality: "HD", country: "United States" }
 */
export function parseChannelName(raw: string): ParsedChannelName {
  const original = (raw ?? '').trim();
  let work = original;
  const tags: string[] = [];

  // Leading country prefix: "NL |", "NL:", "NL -", "[NL]", "(NL)"
  let country: string | null = null;
  let language: string | null = null;
  const prefix = /^\s*[[(]?\s*([A-Za-z]{2,3})\s*[\])]?\s*[|:\-–]\s*/.exec(work);
  if (prefix) {
    const code = prefix[1].toLowerCase();
    if (COUNTRY_CODES[code]) {
      country = COUNTRY_CODES[code].country;
      language = COUNTRY_CODES[code].language;
      work = work.slice(prefix[0].length);
    }
  }
  // Bare leading code with no separator: "NL ESPN 1"
  if (!country) {
    const bare = /^\s*([A-Za-z]{2})\s+(?=\S)/.exec(work);
    if (bare && COUNTRY_CODES[bare[1].toLowerCase()]) {
      const code = bare[1].toLowerCase();
      // Only strip when what follows still looks like a name.
      const rest = work.slice(bare[0].length).trim();
      if (rest.length >= 2) {
        country = COUNTRY_CODES[code].country;
        language = COUNTRY_CODES[code].language;
        work = rest;
      }
    }
  }

  // Quality
  let quality: Quality = 'unknown';
  for (const [re, q] of QUALITY_TOKENS) {
    if (re.test(work)) {
      quality = q;
      work = work.replace(re, ' ');
      break;
    }
  }

  // Bracketed extras become tags: "(Backup)", "[VIP]"
  work = work.replace(/[[(]([^\])]{1,24})[\])]/g, (_m, inner: string) => {
    tags.push(inner.trim());
    return ' ';
  });

  // Noise tokens
  for (const token of NOISE_TOKENS) {
    const re = new RegExp(`(^|[\\s|:_\\-])${token}(?=$|[\\s|:_\\-])`, 'gi');
    if (re.test(work)) {
      tags.push(token.toUpperCase());
      work = work.replace(re, ' ');
    }
  }

  // Tidy separators and whitespace
  work = work
    .replace(/[|_]+/g, ' ')
    .replace(/\s*[-–]\s*$/g, '')
    .replace(/^\s*[-–:]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const ambiguous = work.length < 2;
  return {
    name: ambiguous ? original : work,
    quality,
    country,
    language,
    tags: [...new Set(tags)],
    ambiguous,
  };
}

/** Stable key grouping HD/FHD/4K/backup variants of the same service. */
export function familyKey(displayName: string, country: string | null): string {
  const base = displayName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return country ? `${country.toLowerCase().replace(/\s+/g, '')}:${base}` : base;
}

/** Loose key used for EPG matching when tvg-id is missing. */
export function epgKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(hd|fhd|uhd|4k|sd|tv|channel|kanal)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function classifyGenre(...texts: Array<string | null | undefined>): ContentGenre {
  const hay = texts.filter(Boolean).join(' ');
  if (!hay) return 'other';
  for (const [genre, re] of GENRE_RULES) {
    if (re.test(hay)) return genre;
  }
  return 'other';
}

export function isAdult(...texts: Array<string | null | undefined>): boolean {
  return ADULT_RE.test(texts.filter(Boolean).join(' '));
}

/** "The Matrix (1999)" -> { title: "The Matrix", year: 1999 } */
export function parseTitleYear(raw: string): { title: string; year: number | null } {
  const m = /^(.*?)[\s._-]*[[(]?((?:19|20)\d{2})[\])]?\s*$/.exec(raw.trim());
  if (m && m[1].trim().length > 1) {
    return { title: cleanupVodTitle(m[1]), year: Number(m[2]) };
  }
  return { title: cleanupVodTitle(raw), year: null };
}

function cleanupVodTitle(raw: string) {
  return raw
    .replace(/^\s*[A-Za-z]{2,3}\s*[|:\-–]\s*/, '')
    .replace(/\b(1080p?|720p?|2160p?|4k|uhd|fhd|hdrip|webrip|web-dl|bluray|bdrip|x264|x265|hevc|aac|dts|multi|dub|sub)\b/gi, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "S02E07" / "2x07" -> { season: 2, episode: 7 } */
export function parseEpisodeCode(raw: string): { season: number; episode: number } | null {
  const se = /\bS(\d{1,2})\s?E(\d{1,3})\b/i.exec(raw);
  if (se) return { season: Number(se[1]), episode: Number(se[2]) };
  const x = /\b(\d{1,2})\s?x\s?(\d{1,3})\b/i.exec(raw);
  if (x) return { season: Number(x[1]), episode: Number(x[2]) };
  return null;
}
