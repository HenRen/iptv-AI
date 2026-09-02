import type { Channel, EPGProgram } from '../../types/index';

/**
 * AI 5 — Sports Intelligence.
 *
 * Recognises sporting events **inside EPG data that already exists**. It
 * never fabricates a fixture: every event returned is one programme entry
 * from the provider's guide, on one real channel, and if the guide is empty
 * this returns an empty list rather than a plausible-looking schedule.
 *
 * The extraction is pattern-based on the programme title and description —
 * a model is not needed to see that "Ajax vs PSV" names two teams, and a
 * model that guessed here would be inventing sport.
 */

export type SportKind =
  | 'football'
  | 'basketball'
  | 'tennis'
  | 'motorsport'
  | 'combat'
  | 'golf'
  | 'cricket'
  | 'rugby'
  | 'hockey'
  | 'baseball'
  | 'cycling'
  | 'other';

export interface SportsEvent {
  programId: string;
  channelId: string;
  channelName: string;
  channelNumber: number;
  title: string;
  sport: SportKind;
  competition: string | null;
  /** Only set when the title genuinely names two sides. */
  teams: [string, string] | null;
  start: number;
  stop: number;
  live: boolean;
}

const SPORT_PATTERNS: Array<[SportKind, RegExp]> = [
  [
    'football',
    /\b(football|soccer|voetbal|eredivisie|premier\s?league|la\s?liga|serie\s?a|bundesliga|ligue\s?1|champions\s?league|europa\s?league|world\s?cup|fa\s?cup|kNVB)\b/i,
  ],
  ['basketball', /\b(basketball|nba|euroleague|ncaa)\b/i],
  ['tennis', /\b(tennis|wimbledon|roland\s?garros|us\s?open|australian\s?open|atp|wta)\b/i],
  [
    'motorsport',
    /\b(formula\s?(?:[1e]|one|e)|f1\b|grand\s?prix|motogp|nascar|rally|indycar|le\s?mans)\b/i,
  ],
  ['combat', /\b(ufc|boxing|mma|wrestling|wwe|bellator|kickboxing|glory)\b/i],
  ['golf', /\b(golf|pga|masters|ryder\s?cup)\b/i],
  ['cricket', /\b(cricket|ipl|test\s?match|odi)\b/i],
  ['rugby', /\b(rugby|six\s?nations|nrl)\b/i],
  ['hockey', /\b(ice\s?hockey|nhl|hockey)\b/i],
  ['baseball', /\b(baseball|mlb|world\s?series)\b/i],
  ['cycling', /\b(cycling|tour\s?de\s?france|giro|vuelta|wielrennen)\b/i],
];

const COMPETITION_PATTERNS = [
  /\b(UEFA Champions League|Champions League|Europa League|Conference League)\b/i,
  /\b(Premier League|Eredivisie|La Liga|Serie A|Bundesliga|Ligue 1)\b/i,
  /\b(Formula 1|MotoGP|NASCAR|IndyCar)\b/i,
  /\b(NBA|NFL|NHL|MLB|UFC|WTA|ATP|PGA)\b/i,
  /\b(World Cup|Euro \d{4}|Six Nations|Ryder Cup)\b/i,
];

/** "Ajax vs PSV", "Ajax - PSV", "Ajax v PSV". */
const VERSUS = /^(.{2,40}?)\s+(?:vs?\.?|v|-|–|@)\s+(.{2,40}?)$/i;

const LIVE_MARKER = /\b(live|直播|direct|en\s?vivo)\b/i;

export function detectSport(text: string): SportKind | null {
  for (const [sport, pattern] of SPORT_PATTERNS) {
    if (pattern.test(text)) return sport;
  }
  return null;
}

function detectCompetition(text: string): string | null {
  for (const pattern of COMPETITION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

function detectTeams(title: string): [string, string] | null {
  // Strip a leading "Live:" / "LIVE " marker before looking for the fixture.
  const cleaned = title.replace(/^\s*(live|voetbal|football)\s*[:\-]\s*/i, '').trim();
  const match = VERSUS.exec(cleaned);
  if (!match) return null;
  const [, home, away] = match;
  // Reject matches where a side is obviously not a team name.
  if (/\d{2}:\d{2}/.test(home) || /\d{2}:\d{2}/.test(away)) return null;
  if (home.trim().length < 2 || away.trim().length < 2) return null;
  return [home.trim(), away.trim()];
}

/**
 * A fixture title on a sports channel is itself evidence of sport, even when
 * no sport word appears — real guides are full of bare "Ajax - PSV" entries.
 * This is inference from two real signals (the channel's classification and
 * the title's shape), not invention: the programme, the time and the channel
 * all still come from the provider's EPG.
 */
function isFixtureOnSportsChannel(title: string, channelIsSports: boolean): boolean {
  return channelIsSports && detectTeams(title) !== null;
}

export interface SportsQuery {
  channels: Channel[];
  /** channelId -> that channel's programmes within the window. */
  schedules: Record<string, EPGProgram[]>;
  from?: number;
  to?: number;
  limit?: number;
}

/**
 * Extract sporting events from real guide data.
 * Returns [] when there is no EPG — deliberately, rather than guessing.
 */
export function findSportsEvents({
  channels,
  schedules,
  from = Date.now(),
  to = Date.now() + 12 * 60 * 60 * 1000,
  limit = 40,
}: SportsQuery): SportsEvent[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const events: SportsEvent[] = [];
  const now = Date.now();

  for (const [channelId, programs] of Object.entries(schedules)) {
    const channel = byId.get(channelId);
    if (!channel) continue;

    for (const program of programs) {
      if (program.stop <= from || program.start >= to) continue;

      const haystack = `${program.title} ${program.category ?? ''} ${program.description ?? ''}`;
      const channelIsSports = channel.genre === 'sports';

      // A sports channel raises confidence, but the programme itself must
      // still look like sport — a sports channel airing a talk show is not
      // a sporting event.
      const sport =
        detectSport(haystack) ??
        (isFixtureOnSportsChannel(program.title, channelIsSports) ? 'other' : null);
      if (!sport) continue;

      events.push({
        programId: program.id,
        channelId,
        channelName: channel.name,
        channelNumber: channel.number,
        title: program.title,
        sport,
        competition: detectCompetition(haystack),
        teams: detectTeams(program.title),
        start: program.start,
        stop: program.stop,
        live: program.start <= now && program.stop > now,
      });
    }
  }

  return events
    .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, limit);
}

/** Group events for display: "Football", "Motorsport", … */
export function groupBySport(events: SportsEvent[]): Array<[SportKind, SportsEvent[]]> {
  const map = new Map<SportKind, SportsEvent[]>();
  for (const event of events) {
    const list = map.get(event.sport) ?? [];
    list.push(event);
    map.set(event.sport, list);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export const SPORT_LABEL: Record<SportKind, string> = {
  football: 'Football',
  basketball: 'Basketball',
  tennis: 'Tennis',
  motorsport: 'Motorsport',
  combat: 'Combat Sports',
  golf: 'Golf',
  cricket: 'Cricket',
  rugby: 'Rugby',
  hockey: 'Hockey',
  baseball: 'Baseball',
  cycling: 'Cycling',
  other: 'Other',
};

export { LIVE_MARKER };
