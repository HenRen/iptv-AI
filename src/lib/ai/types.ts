import type { ContentGenre, Quality } from '@/types';

/**
 * AI layer contracts.
 *
 * The governing rule for everything in src/lib/ai:
 *
 *   AI decides WHAT the user may want.
 *   The IPTV engine decides WHAT ACTUALLY EXISTS.
 *   The player decides WHAT CAN ACTUALLY PLAY.
 *
 * Concretely, no model output is ever executed, dereferenced or displayed as
 * content. A model may return an *intent* drawn from a fixed allowlist, or a
 * *proposal* referencing an id that must already be in the catalogue. Titles,
 * times, fixtures and URLs coming out of a model are discarded.
 */

/* ---------------------------- intents ---------------------------- */

/** The complete set of things a voice or Ask TV command may cause. */
export const INTENT_ACTIONS = [
  'PLAY_CHANNEL',
  'OPEN_GUIDE',
  'SEARCH',
  'OPEN_MOVIES',
  'OPEN_SERIES',
  'OPEN_FAVORITES',
  'NEXT_CHANNEL',
  'PREVIOUS_CHANNEL',
  'PAUSE',
  'PLAY',
  'OPEN_CONTENT',
] as const;

export type IntentAction = (typeof INTENT_ACTIONS)[number];

export function isIntentAction(value: unknown): value is IntentAction {
  return typeof value === 'string' && (INTENT_ACTIONS as readonly string[]).includes(value);
}

export interface Intent {
  action: IntentAction;
  /** Free text to hand to the search engine — never used as a URL or an id. */
  query?: string;
  category?: ContentGenre | string;
  /** 'now' or an ISO date; resolved by the application, not the model. */
  time?: string;
  /** Only honoured after the application confirms the id exists. */
  entityId?: string;
  confidence: number;
}

/* -------------------------- classification ------------------------- */

export interface ChannelClassification {
  displayName: string;
  country: string | null;
  language: string | null;
  genre: ContentGenre;
  quality: Quality;
  tags: string[];
  /** 'rules' for deterministic parsing, 'ai' when a model was consulted. */
  source: 'rules' | 'ai' | 'user';
  confidence: number;
}

/* ---------------------------- EPG matching ------------------------- */

export interface EpgMatchProposal {
  channelId: string;
  epgChannelId: string;
  confidence: number;
  reason: string;
  /** Proposals are never applied without approval. */
  approved: false;
}

/* -------------------------- recommendations ------------------------ */

export interface RecommendationSignal {
  channelPlays: Record<string, number>;
  genrePlays: Record<string, number>;
  favoriteIds: string[];
  hourOfDay: number;
  dayOfWeek: number;
}

export interface RecommendationRail {
  key: string;
  title: string;
  /** Ids that must resolve in the catalogue before the rail is rendered. */
  itemIds: string[];
  kind: 'channel' | 'movie' | 'series';
  reason: string;
}

/* --------------------------- provider ------------------------------ */

export interface AIProviderInfo {
  id: string;
  label: string;
  available: boolean;
}

/**
 * Everything the application may ask a model to do. Note what is absent:
 * there is no `generate`, no free-form completion surfaced to the UI, and no
 * method that returns anything playable.
 */
export interface AIProvider {
  readonly info: AIProviderInfo;

  /** Natural language -> a structured, allowlisted intent. */
  parseIntent(utterance: string, context: IntentContext): Promise<Intent | null>;

  /** Disambiguate channel names the rules engine could not parse. */
  classifyChannels(rawNames: string[]): Promise<Map<string, ChannelClassification>>;

  /** Propose EPG mappings for channels deterministic matching missed. */
  proposeEpgMatches(
    channels: Array<{ id: string; name: string }>,
    epgChannels: Array<{ id: string; names: string[] }>,
  ): Promise<EpgMatchProposal[]>;

  /** Rank existing catalogue ids. May not introduce new ones. */
  rankForUser(candidateIds: string[], signals: RecommendationSignal): Promise<string[]>;

  /** Summarize from supplied metadata only. Returns null when there is none. */
  summarize(metadata: Record<string, string | number | null>): Promise<string | null>;
}

export interface IntentContext {
  /** Category names present in the playlist, so the model stays grounded. */
  categories: string[];
  /** Whether something is currently playing, for PAUSE / PLAY / zap intents. */
  isPlaying: boolean;
}
