import type { Channel, EPGProgram, Movie, ParsedQuery, PlaylistHealth, RecommendationRail, Series, SportKind, SportsEvent, UserSignals, WatchMatch, WatchRule } from '@streamwise/core';

/** Client for the AI layer. One endpoint, discriminated by `op`. */

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `AI request failed (${res.status}).`;
    throw new Error(message);
  }
  return parsed as T;
}

export type AiCommand =
  | { type: 'navigate'; to: string }
  | { type: 'search'; query: string; filters?: { category?: string; time?: string } }
  | { type: 'play-channel-resolved'; channel: Channel }
  | { type: 'open-content'; entityId: string }
  | { type: 'transport'; action: 'play' | 'pause' | 'next-channel' | 'previous-channel' };

export interface ResolvedRail extends RecommendationRail {
  items: Array<Channel | Movie | Series>;
}

export const aiApi = {
  intent: (utterance: string) =>
    post<{ ok: boolean; spoken?: string; message?: string; command?: AiCommand }>({
      op: 'intent',
      utterance,
    }),

  search: (query: string) =>
    post<{
      parsed: ParsedQuery;
      channels: Channel[];
      movies: Movie[];
      series: Series[];
      programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
      explanation: string[];
      relaxed: boolean;
    }>({ op: 'search', query }),

  rails: (signals: Partial<UserSignals>) =>
    post<{ rails: ResolvedRail[] }>({ op: 'rails', signals }),

  sports: () =>
    post<{ events: SportsEvent[]; groups: Array<{ sport: SportKind; count: number }>; hasEpg: boolean }>(
      { op: 'sports' },
    ),

  health: () => post<(PlaylistHealth & { cleanView: { before: number; after: number; collapsed: number } }) | null>({ op: 'health' }),

  watchlist: (rules: WatchRule[]) => post<{ matches: WatchMatch[] }>({ op: 'watchlist', rules }),

  explain: (contentId: string) =>
    post<{
      summary: string | null;
      reason: string | null;
      similar: Array<{ id: string; name: string; poster: string | null }>;
    }>({ op: 'explain', query: contentId }),
};
