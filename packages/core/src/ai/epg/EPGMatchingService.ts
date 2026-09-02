import type { Channel } from '../../types/index';
import type { AIProvider, EpgMatchProposal } from '../types';
import { matchChannels, type EpgMapping } from '../../iptv/xmltv/matcher';
import type { XmltvChannel } from '../../iptv/xmltv/parser';

/**
 * AI 6 — Smart EPG matching.
 *
 * Order is fixed and deterministic-first:
 *   1. exact tvg-id
 *   2. exact normalized name
 *   3. stored user/AI-approved override
 *   4. only then: an AI *proposal*, which is never auto-applied
 *
 * A proposal must reference a channel and an EPG id that were both supplied
 * as inputs. The AI may not invent an EPG channel, and it categorically may
 * not invent a programme, a title or a time — those come from XMLTV only.
 */

export interface MatchingReport {
  mappings: EpgMapping[];
  proposals: EpgMatchProposal[];
  unmatched: Channel[];
  coverage: number;
}

export class EPGMatchingService {
  constructor(private readonly ai: AIProvider) {}

  async analyze(
    channels: Channel[],
    epgChannels: XmltvChannel[],
    overrides: Record<string, string> = {},
    { useAi = false }: { useAi?: boolean } = {},
  ): Promise<MatchingReport> {
    const deterministic = matchChannels(channels, epgChannels, overrides);

    let proposals: EpgMatchProposal[] = [];
    if (useAi && deterministic.unmatched.length > 0 && deterministic.orphanEpgChannels.length > 0) {
      const candidateIds = new Set(deterministic.orphanEpgChannels.map((c) => c.id));
      const channelIds = new Set(deterministic.unmatched.map((c) => c.id));

      const raw = await this.ai.proposeEpgMatches(
        deterministic.unmatched.map((c) => ({ id: c.id, name: c.name })),
        deterministic.orphanEpgChannels.map((c) => ({ id: c.id, names: c.displayNames })),
      );

      // Hard validation: a proposal may only name inputs we supplied, and
      // may never arrive pre-approved.
      proposals = raw
        .filter((p) => channelIds.has(p.channelId) && candidateIds.has(p.epgChannelId))
        .map((p) => ({ ...p, approved: false as const }));
    }

    const coverage =
      channels.length === 0 ? 0 : deterministic.mappings.length / channels.length;

    return {
      mappings: deterministic.mappings,
      proposals,
      unmatched: deterministic.unmatched,
      coverage,
    };
  }

  /**
   * Turn approved proposals into overrides. Only proposals the caller
   * explicitly lists are accepted — approval is a user action, never a
   * confidence threshold.
   */
  approve(
    proposals: EpgMatchProposal[],
    approvedChannelIds: string[],
    existing: Record<string, string> = {},
  ): Record<string, string> {
    const wanted = new Set(approvedChannelIds);
    const next = { ...existing };
    for (const proposal of proposals) {
      if (wanted.has(proposal.channelId)) next[proposal.channelId] = proposal.epgChannelId;
    }
    return next;
  }
}
