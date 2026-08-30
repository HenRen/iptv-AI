import type { AIProvider } from './types';
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
    instance = process.env.OPENAI_API_KEY ? new OpenAIProvider() : new MockAIProvider();
  }
  return instance;
}

export function setAIProvider(provider: AIProvider): void {
  instance = provider;
}

export { MockAIProvider, OpenAIProvider };
export * from './types';
