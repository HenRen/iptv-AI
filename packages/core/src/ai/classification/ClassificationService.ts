import type { Channel } from '../../types/index';
import type { AIProvider, ChannelClassification } from '../types';
import { classifyGenre, parseChannelName } from '../../iptv/normalize';

/**
 * AI 2 — Smart Playlist Organizer.
 *
 * Deterministic parsing runs on 100% of entries first. Only the residue the
 * rules engine flags as ambiguous is offered to a model, and even then the
 * result is a *proposal* the user can override — never a silent rewrite of
 * the provider's data. `Channel.rawName` is always preserved.
 */

export interface ClassificationOverride {
  channelId: string;
  displayName?: string;
  genre?: Channel['genre'];
  country?: string | null;
  hidden?: boolean;
}

export interface OrganizeResult {
  classifications: Map<string, ChannelClassification>;
  /** Entries the rules engine could not confidently parse. */
  ambiguous: string[];
  /** How many needed a model at all. */
  aiConsulted: number;
}

export class ClassificationService {
  constructor(private readonly ai: AIProvider) {}

  /**
   * Classify a set of channels. `useAi` false keeps this entirely local,
   * which is the default — see Settings → AI & Privacy.
   */
  async organize(
    channels: Array<Pick<Channel, 'id' | 'rawName'>>,
    { useAi = false }: { useAi?: boolean } = {},
  ): Promise<OrganizeResult> {
    const classifications = new Map<string, ChannelClassification>();
    const ambiguous: string[] = [];

    for (const channel of channels) {
      const parsed = parseChannelName(channel.rawName);
      classifications.set(channel.id, {
        displayName: parsed.name,
        country: parsed.country,
        language: parsed.language,
        genre: classifyGenre(parsed.name, channel.rawName),
        quality: parsed.quality,
        tags: parsed.tags,
        source: 'rules',
        confidence: parsed.ambiguous ? 0.4 : 0.9,
      });
      if (parsed.ambiguous) ambiguous.push(channel.id);
    }

    if (!useAi || ambiguous.length === 0) {
      return { classifications, ambiguous, aiConsulted: 0 };
    }

    const byRaw = new Map(channels.map((c) => [c.id, c.rawName]));
    const rawNames = ambiguous.map((id) => byRaw.get(id)!).filter(Boolean);
    const proposed = await this.ai.classifyChannels(rawNames);

    let consulted = 0;
    for (const id of ambiguous) {
      const raw = byRaw.get(id);
      const hit = raw ? proposed.get(raw) : undefined;
      // Only accept a model's answer when it beats the rules engine.
      if (hit && hit.confidence > (classifications.get(id)?.confidence ?? 0)) {
        classifications.set(id, { ...hit, source: 'ai' });
        consulted++;
      }
    }

    return { classifications, ambiguous, aiConsulted: consulted };
  }

  /** User overrides always win, and are marked as such. */
  applyOverrides(
    classifications: Map<string, ChannelClassification>,
    overrides: ClassificationOverride[],
  ): Map<string, ChannelClassification> {
    const out = new Map(classifications);
    for (const override of overrides) {
      const current = out.get(override.channelId);
      if (!current) continue;
      out.set(override.channelId, {
        ...current,
        displayName: override.displayName ?? current.displayName,
        genre: override.genre ?? current.genre,
        country: override.country !== undefined ? override.country : current.country,
        source: 'user',
        confidence: 1,
      });
    }
    return out;
  }
}
