import type { Intent, IntentAction } from '../types';
import { INTENT_ACTIONS, isIntentAction } from '../types';

/**
 * AI 1 / AI 8 — intent execution.
 *
 * The security model in one sentence: **the language model never executes
 * anything**. It returns a label from a fixed allowlist plus some free text;
 * this service maps that label to one of a fixed set of application commands,
 * and the application resolves any name against its own catalogue before
 * acting.
 *
 * A model cannot: navigate to an arbitrary URL, play an arbitrary stream,
 * name a channel that does not exist, or cause any effect not in
 * `INTENT_ACTIONS`.
 */

/** What the UI is allowed to do, one-to-one with INTENT_ACTIONS. */
export type Command =
  | { type: 'navigate'; to: '/home' | '/live' | '/guide' | '/movies' | '/series' | '/favorites' | '/search' }
  | { type: 'search'; query: string; filters?: { category?: string; time?: string } }
  | { type: 'play-channel'; query: string }
  | { type: 'open-content'; entityId: string }
  | { type: 'transport'; action: 'play' | 'pause' | 'next-channel' | 'previous-channel' };

export interface ResolvedIntent {
  intent: Intent;
  command: Command;
  /** Shown to the user so an action is never silent or unexplained. */
  spoken: string;
}

const ACTION_TO_COMMAND: Record<IntentAction, (intent: Intent) => Command | null> = {
  OPEN_GUIDE: () => ({ type: 'navigate', to: '/guide' }),
  OPEN_MOVIES: () => ({ type: 'navigate', to: '/movies' }),
  OPEN_SERIES: () => ({ type: 'navigate', to: '/series' }),
  OPEN_FAVORITES: () => ({ type: 'navigate', to: '/favorites' }),
  NEXT_CHANNEL: () => ({ type: 'transport', action: 'next-channel' }),
  PREVIOUS_CHANNEL: () => ({ type: 'transport', action: 'previous-channel' }),
  PAUSE: () => ({ type: 'transport', action: 'pause' }),
  PLAY: () => ({ type: 'transport', action: 'play' }),
  SEARCH: (intent) =>
    intent.query
      ? {
          type: 'search',
          query: intent.query,
          filters: { category: intent.category, time: intent.time },
        }
      : { type: 'navigate', to: '/search' },
  PLAY_CHANNEL: (intent) =>
    // Note: a *query*, not an id. The app searches its own catalogue and
    // plays a real result, or reports that it found nothing.
    intent.query ? { type: 'play-channel', query: intent.query } : null,
  OPEN_CONTENT: (intent) =>
    intent.entityId ? { type: 'open-content', entityId: intent.entityId } : null,
};

const SPOKEN: Record<IntentAction, (intent: Intent) => string> = {
  OPEN_GUIDE: () => 'Opening the TV guide',
  OPEN_MOVIES: () => 'Opening movies',
  OPEN_SERIES: () => 'Opening series',
  OPEN_FAVORITES: () => 'Opening your favorites',
  NEXT_CHANNEL: () => 'Next channel',
  PREVIOUS_CHANNEL: () => 'Previous channel',
  PAUSE: () => 'Paused',
  PLAY: () => 'Playing',
  SEARCH: (i) => (i.query ? `Searching for “${i.query}”` : 'Opening search'),
  PLAY_CHANNEL: (i) => `Looking for “${i.query}”`,
  OPEN_CONTENT: () => 'Opening',
};

export class IntentService {
  /**
   * Validate and map an intent to a command.
   * Returns null for anything not on the allowlist or missing its operand.
   */
  resolve(intent: Intent | null, knownEntityIds?: Set<string>): ResolvedIntent | null {
    if (!intent || !isIntentAction(intent.action)) return null;

    // An id from a model is only honoured if the caller already knows it.
    if (intent.entityId && (!knownEntityIds || !knownEntityIds.has(intent.entityId))) {
      return null;
    }

    const command = ACTION_TO_COMMAND[intent.action](intent);
    if (!command) return null;

    return { intent, command, spoken: SPOKEN[intent.action](intent) };
  }

  /** The complete, closed set of things any assistant input can cause. */
  get allowedActions(): readonly IntentAction[] {
    return INTENT_ACTIONS;
  }
}
