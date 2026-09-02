import type { AIProvider } from './types';
import { config } from '../ports/index';
import { MockAIProvider } from './providers/MockAIProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';

/**
 * Provider selection.
 *
 * The application depends on the AIProvider interface, never on a vendor.
 * With nothing configured it gets the rules provider and every AI-labelled
 * feature still works — degraded in quality, not in availability.
 */
let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!instance) {
    instance = config().openAiApiKey ? new OpenAIProvider() : new MockAIProvider();
  }
  return instance;
}

export function setAIProvider(provider: AIProvider): void {
  instance = provider;
}

/** Drop the memoized provider so a config change is picked up. Tests only. */
export function resetAIProvider(): void {
  instance = null;
}

export { MockAIProvider, OpenAIProvider };
export * from './types';
