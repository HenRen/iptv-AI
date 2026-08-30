import type {
  AIProvider,
  ChannelClassification,
  EpgMatchProposal,
  Intent,
  IntentContext,
  RecommendationSignal,
} from '../types';
import { isIntentAction } from '../types';
import { MockAIProvider } from './MockAIProvider';

/**
 * OpenAI-backed provider.
 *
 * Not wired to a live model in this build — every method falls through to the
 * rules provider — but the shape is deliberate and the guard rails are the
 * part worth having early:
 *
 *   - `PROMPT_CONTRACT` states what the model is allowed to return.
 *   - `validateIntent` is applied to every response before anything acts on
 *     it. An action outside the allowlist, or an `entityId` the caller did
 *     not supply as a candidate, is dropped rather than sanitized.
 *   - Nothing that reaches this class ever contains credentials: callers pass
 *     display names and catalogue ids only. See `assertNoSecrets`.
 *
 * To enable: implement `call()` against the Responses API using
 * OPENAI_API_KEY, and keep every return path going through the validators.
 */
export class OpenAIProvider implements AIProvider {
  private readonly fallback = new MockAIProvider();

  readonly info = {
    id: 'openai',
    label: 'OpenAI',
    available: Boolean(process.env.OPENAI_API_KEY),
  };

  static readonly PROMPT_CONTRACT = `
You convert a viewer's request into ONE structured action for an IPTV app.
Return JSON only: { "action": <one of the allowlist>, "query"?: string,
"category"?: string, "time"?: "now" | "tonight" | ISO-8601 }.
You must NOT invent channel names, programme titles, times, fixtures, or URLs.
You must NOT return an id. The application resolves names against its own
catalogue and plays only what it finds there.
`.trim();

  async parseIntent(utterance: string, context: IntentContext): Promise<Intent | null> {
    assertNoSecrets(utterance);
    if (!this.info.available) return this.fallback.parseIntent(utterance, context);

    // A live implementation calls the model here and then, unconditionally:
    //   const parsed = validateIntent(await call(...));
    //   return parsed ?? this.fallback.parseIntent(utterance, context);
    return this.fallback.parseIntent(utterance, context);
  }

  async classifyChannels(rawNames: string[]): Promise<Map<string, ChannelClassification>> {
    rawNames.forEach(assertNoSecrets);
    return this.fallback.classifyChannels(rawNames);
  }

  async proposeEpgMatches(
    channels: Array<{ id: string; name: string }>,
    epgChannels: Array<{ id: string; names: string[] }>,
  ): Promise<EpgMatchProposal[]> {
    const proposals = await this.fallback.proposeEpgMatches(channels, epgChannels);
    // A proposal may only reference channels and EPG ids that were supplied.
    const channelIds = new Set(channels.map((c) => c.id));
    const epgIds = new Set(epgChannels.map((e) => e.id));
    return proposals.filter((p) => channelIds.has(p.channelId) && epgIds.has(p.epgChannelId));
  }

  async rankForUser(candidateIds: string[], signals: RecommendationSignal): Promise<string[]> {
    const ranked = await this.fallback.rankForUser(candidateIds, signals);
    // A ranking may reorder candidates. It may not add to them.
    const allowed = new Set(candidateIds);
    return ranked.filter((id) => allowed.has(id));
  }

  async summarize(metadata: Record<string, string | number | null>): Promise<string | null> {
    return this.fallback.summarize(metadata);
  }
}

/**
 * Reject anything model-shaped that is not on the allowlist. Applied to every
 * model response before the application acts on it.
 */
export function validateIntent(raw: unknown, candidateIds?: Set<string>): Intent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!isIntentAction(value.action)) return null;

  const entityId = typeof value.entityId === 'string' ? value.entityId : undefined;
  // An id the model produced is only honoured if the caller already knew it.
  if (entityId && (!candidateIds || !candidateIds.has(entityId))) return null;

  const confidence = typeof value.confidence === 'number' ? value.confidence : 0.5;

  return {
    action: value.action,
    query: typeof value.query === 'string' ? value.query.slice(0, 200) : undefined,
    category: typeof value.category === 'string' ? value.category.slice(0, 60) : undefined,
    time: typeof value.time === 'string' ? value.time.slice(0, 40) : undefined,
    entityId,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

const SECRET_SHAPES = [
  /password\s*=/i,
  /username\s*=/i,
  /player_api\.php/i,
  /get\.php\?/i,
  /https?:\/\/[^/\s]+\/(live|movie|series)\/[^/\s]+\/[^/\s]+\//i,
];

/**
 * Last line of defence: refuse to send anything that looks like a
 * credential-bearing string to a third-party model.
 */
export function assertNoSecrets(text: string): void {
  for (const shape of SECRET_SHAPES) {
    if (shape.test(text)) {
      throw new Error('Refusing to send provider credentials to an AI provider.');
    }
  }
}
