import type {
  AIProvider,
  ChannelClassification,
  EpgMatchProposal,
  Intent,
  IntentContext,
  RecommendationSignal,
} from '../types';
import { classifyGenre, epgKey, parseChannelName } from '@/lib/iptv/normalize';

/**
 * Default provider: no network, no model, no cost.
 *
 * It is not a stub that throws — it is a working rules implementation, which
 * is the point. Most of what the "AI layer" is asked to do (parse a command
 * shaped like "play ESPN", clean up a channel name, match an EPG id) is
 * deterministic, and doing it here means the app behaves identically whether
 * or not a model is configured. A real provider only has to be better on the
 * genuinely ambiguous residue.
 */
export class MockAIProvider implements AIProvider {
  readonly info = { id: 'mock', label: 'Built-in (rules only)', available: true };

  async parseIntent(utterance: string, context: IntentContext): Promise<Intent | null> {
    const text = utterance.trim().toLowerCase();
    if (!text) return null;

    if (/^(pause|stop)\b/.test(text) && context.isPlaying) {
      return { action: 'PAUSE', confidence: 0.95 };
    }
    if (/^(resume|continue playing|play)$/.test(text)) {
      return { action: 'PLAY', confidence: 0.9 };
    }
    if (/\b(next channel|channel up)\b/.test(text)) {
      return { action: 'NEXT_CHANNEL', confidence: 0.95 };
    }
    if (/\b(previous channel|last channel|channel down)\b/.test(text)) {
      return { action: 'PREVIOUS_CHANNEL', confidence: 0.95 };
    }
    if (/\b(open|show|go to) (the )?guide\b|what'?s on( tonight| now)?\b/.test(text)) {
      return { action: 'OPEN_GUIDE', confidence: 0.85, time: /tonight/.test(text) ? 'tonight' : 'now' };
    }
    if (/\b(favorites|favourites)\b/.test(text)) {
      return { action: 'OPEN_FAVORITES', confidence: 0.9 };
    }
    if (/\bmovies?\b/.test(text) && /\b(open|show|browse)\b/.test(text)) {
      return { action: 'OPEN_MOVIES', confidence: 0.85 };
    }
    if (/\bseries|shows?\b/.test(text) && /\b(open|show|browse)\b/.test(text)) {
      return { action: 'OPEN_SERIES', confidence: 0.85 };
    }

    const play = /^(?:play|watch|put on|switch to)\s+(.+)$/.exec(text);
    if (play) {
      // Deliberately an intent to SEARCH for a channel, not a channel id:
      // resolving the name against the real catalogue is the app's job.
      return { action: 'PLAY_CHANNEL', query: play[1].trim(), confidence: 0.8 };
    }

    const find = /^(?:find|search for|search|show me|look for)\s+(.+)$/.exec(text);
    if (find) {
      const query = find[1].trim();
      const genre = classifyGenre(query);
      return {
        action: 'SEARCH',
        query,
        category: genre === 'other' ? undefined : genre,
        confidence: 0.75,
      };
    }

    // Anything unrecognized becomes a plain search rather than a guess.
    return { action: 'SEARCH', query: utterance.trim(), confidence: 0.4 };
  }

  async classifyChannels(rawNames: string[]): Promise<Map<string, ChannelClassification>> {
    const out = new Map<string, ChannelClassification>();
    for (const raw of rawNames) {
      const parsed = parseChannelName(raw);
      out.set(raw, {
        displayName: parsed.name,
        country: parsed.country,
        language: parsed.language,
        genre: classifyGenre(parsed.name, raw),
        quality: parsed.quality,
        tags: parsed.tags,
        source: 'rules',
        confidence: parsed.ambiguous ? 0.4 : 0.9,
      });
    }
    return out;
  }

  async proposeEpgMatches(
    channels: Array<{ id: string; name: string }>,
    epgChannels: Array<{ id: string; names: string[] }>,
  ): Promise<EpgMatchProposal[]> {
    // Token-overlap similarity. Never returns a match below 0.6, and always
    // returns approved:false — a proposal, not a mapping.
    const epgTokens = epgChannels.map((e) => ({
      id: e.id,
      tokens: new Set(
        [...e.names, e.id].flatMap((n) => epgKey(n).match(/.{1,3}/g) ?? []),
      ),
    }));

    const proposals: EpgMatchProposal[] = [];
    for (const channel of channels) {
      const tokens = new Set(epgKey(channel.name).match(/.{1,3}/g) ?? []);
      if (tokens.size === 0) continue;

      let best: { id: string; score: number } | null = null;
      for (const candidate of epgTokens) {
        let shared = 0;
        for (const t of tokens) if (candidate.tokens.has(t)) shared++;
        const score = shared / Math.max(tokens.size, candidate.tokens.size);
        if (!best || score > best.score) best = { id: candidate.id, score };
      }
      if (best && best.score >= 0.6) {
        proposals.push({
          channelId: channel.id,
          epgChannelId: best.id,
          confidence: Math.round(best.score * 100) / 100,
          reason: 'Name similarity',
          approved: false,
        });
      }
    }
    return proposals;
  }

  async rankForUser(candidateIds: string[], signals: RecommendationSignal): Promise<string[]> {
    const score = (id: string) =>
      (signals.channelPlays[id] ?? 0) * 3 + (signals.favoriteIds.includes(id) ? 5 : 0);
    return [...candidateIds].sort((a, b) => score(b) - score(a));
  }

  async summarize(metadata: Record<string, string | number | null>): Promise<string | null> {
    const plot = metadata.plot;
    if (typeof plot !== 'string' || plot.trim().length === 0) return null;
    // Truncate rather than invent — there is no model here to summarize with,
    // and a fabricated summary is worse than no summary.
    const sentence = plot.split(/(?<=[.!?])\s/)[0];
    return sentence.length > 20 ? sentence : plot.slice(0, 180);
  }
}
