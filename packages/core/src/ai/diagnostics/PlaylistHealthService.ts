import type { Channel, ChannelFamily, Movie, Series } from '../../types/index';
import { familyKey } from '../../iptv/normalize';

/**
 * AI 11 + AI 12 — Playlist health and the CLEAN VIEW.
 *
 * Two rules govern this file:
 *   - the original provider playlist is never modified; the clean view is a
 *     separate derived representation;
 *   - every suggested action explains itself before anything destructive can
 *     be applied, and nothing is applied automatically.
 */

export interface HealthIssue {
  id: string;
  severity: 'info' | 'warn' | 'error';
  title: string;
  detail: string;
  count: number;
  /** The action key the UI may offer. Never auto-run. */
  action?: 'normalize-names' | 'merge-duplicates' | 'fix-epg' | 'hide-uncategorized';
  /** Plain-English consequence, shown before the user confirms. */
  consequence?: string;
}

export interface PlaylistHealth {
  totals: { channels: number; movies: number; series: number };
  metrics: {
    healthyMetadata: number; // 0..1
    missingLogos: number;
    missingEpg: number;
    possibleDuplicates: number;
    uncategorized: number;
    badNames: number;
    unplayable: number;
    adult: number;
  };
  issues: HealthIssue[];
}

/** A name that will read badly in the UI even after normalization. */
const BAD_NAME = /^[^a-z0-9]*$|^.{0,1}$|^\W*(hd|fhd|uhd|4k|sd)\W*$/i;

export class PlaylistHealthService {
  analyze(input: {
    channels: Channel[];
    movies: Movie[];
    series: Series[];
    epgMappings: Record<string, string>;
  }): PlaylistHealth {
    const { channels, movies, series, epgMappings } = input;

    const missingLogos = channels.filter((c) => !c.logo).length;
    const missingEpg = channels.filter((c) => !epgMappings[c.id]).length;
    const uncategorized = channels.filter((c) => !c.categoryId).length;
    const badNames = channels.filter((c) => BAD_NAME.test(c.name)).length;
    const unplayable = channels.filter((c) => c.container === 'unknown').length;
    const adult = channels.filter((c) => c.adult).length;

    const families = buildFamilies(channels);
    const duplicateFamilies = [...families.values()].filter((f) => f.variants.length > 1);
    const possibleDuplicates = duplicateFamilies.reduce(
      (total, family) => total + family.variants.length - 1,
      0,
    );

    // "Healthy" = has a name we did not have to fall back on, a category,
    // and a playable container. Logos and EPG are tracked separately because
    // plenty of good playlists lack them.
    const healthy = channels.filter(
      (c) => !BAD_NAME.test(c.name) && c.categoryId && c.container !== 'unknown',
    ).length;

    const issues: HealthIssue[] = [];

    if (badNames > 0) {
      issues.push({
        id: 'bad-names',
        severity: 'warn',
        title: 'Poorly named channels',
        detail: `${badNames} channels have names that are empty or contain only a quality tag.`,
        count: badNames,
        action: 'normalize-names',
        consequence:
          'Creates cleaned display names in the clean view. Your provider playlist is not modified and the original name is kept.',
      });
    }

    if (possibleDuplicates > 0) {
      issues.push({
        id: 'duplicates',
        severity: 'info',
        title: 'Duplicate channels',
        detail: `${duplicateFamilies.length} channels appear more than once as quality or backup variants (${possibleDuplicates} extra entries).`,
        count: possibleDuplicates,
        action: 'merge-duplicates',
        consequence:
          'Collapses variants into one entry with a quality selector. Nothing is deleted — every stream stays reachable.',
      });
    }

    if (missingEpg > 0) {
      issues.push({
        id: 'missing-epg',
        severity: missingEpg > channels.length / 2 ? 'error' : 'warn',
        title: 'Channels without a TV guide',
        detail: `${missingEpg} of ${channels.length} channels are not matched to any EPG data.`,
        count: missingEpg,
        action: 'fix-epg',
        consequence:
          'Proposes matches for you to approve one by one. No mapping is applied until you accept it.',
      });
    }

    if (uncategorized > 0) {
      issues.push({
        id: 'uncategorized',
        severity: 'info',
        title: 'Uncategorized channels',
        detail: `${uncategorized} channels have no category and only appear under All Channels.`,
        count: uncategorized,
        action: 'hide-uncategorized',
        consequence: 'Hides them from browsing. They stay searchable and can be unhidden later.',
      });
    }

    if (missingLogos > 0) {
      issues.push({
        id: 'missing-logos',
        severity: 'info',
        title: 'Channels without artwork',
        detail: `${missingLogos} channels have no logo. A generated fallback is shown instead.`,
        count: missingLogos,
      });
    }

    if (unplayable > 0) {
      issues.push({
        id: 'unplayable',
        severity: 'warn',
        title: 'Unsupported stream format',
        detail: `${unplayable} channels use a container the browser cannot play directly.`,
        count: unplayable,
      });
    }

    return {
      totals: { channels: channels.length, movies: movies.length, series: series.length },
      metrics: {
        healthyMetadata: channels.length === 0 ? 0 : healthy / channels.length,
        missingLogos,
        missingEpg,
        possibleDuplicates,
        uncategorized,
        badNames,
        unplayable,
        adult,
      },
      issues,
    };
  }
}

/**
 * AI 12 — the CLEAN VIEW.
 *
 * Groups "NL | ESPN 1 FHD", "NL: ESPN1 HD", "NL ESPN 1 BACKUP" and
 * "NL | ESPN 1 UHD" into one ESPN 1 entry with a quality selector, without
 * touching a single provider record.
 */
export function buildFamilies(channels: Channel[]): Map<string, ChannelFamily> {
  const families = new Map<string, ChannelFamily>();

  for (const channel of channels) {
    const key = channel.familyKey || familyKey(channel.name, channel.country);
    let family = families.get(key);
    if (!family) {
      family = {
        key,
        name: channel.name,
        logo: channel.logo,
        genre: channel.genre,
        variants: [],
      };
      families.set(key, family);
    }
    if (!family.logo && channel.logo) family.logo = channel.logo;
    family.variants.push({
      channelId: channel.id,
      quality: channel.quality,
      label: channel.quality !== 'unknown' ? channel.quality : `Stream ${family.variants.length + 1}`,
    });
  }

  const rank: Record<string, number> = { '4K': 4, FHD: 3, HD: 2, SD: 1, unknown: 0 };
  for (const family of families.values()) {
    family.variants.sort((a, b) => (rank[b.quality] ?? 0) - (rank[a.quality] ?? 0));
    // Re-label unknown-quality variants after sorting so numbering is stable.
    let stream = 1;
    for (const variant of family.variants) {
      if (variant.quality === 'unknown') variant.label = `Stream ${stream++}`;
    }
  }

  return families;
}

/** One representative channel per family — the clean channel list. */
export function cleanView(channels: Channel[]): {
  channels: Channel[];
  families: Map<string, ChannelFamily>;
  collapsed: number;
} {
  const families = buildFamilies(channels);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const out: Channel[] = [];

  for (const family of families.values()) {
    const best = byId.get(family.variants[0].channelId);
    if (best) out.push(best);
  }
  out.sort((a, b) => a.number - b.number);

  return { channels: out, families, collapsed: channels.length - out.length };
}
