import type { LlmProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export type ProviderId = 'anthropic' | 'openai';

export interface ModelDef {
  id: string;
  label: string;
  /** USD per million tokens, if known. */
  priceInPerMTok?: number;
  priceOutPerMTok?: number;
}

/** Curated model catalog surfaced to the UI. Edit here to add/remove models. */
export const MODEL_CATALOG: Record<ProviderId, ModelDef[]> = {
  anthropic: [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', priceInPerMTok: 5, priceOutPerMTok: 25 },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', priceInPerMTok: 3, priceOutPerMTok: 15 },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', priceInPerMTok: 1, priceOutPerMTok: 5 },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5', priceInPerMTok: 1.25, priceOutPerMTok: 10 },
    { id: 'gpt-5-mini', label: 'GPT-5 mini', priceInPerMTok: 0.25, priceOutPerMTok: 2 },
    { id: 'gpt-4.1', label: 'GPT-4.1', priceInPerMTok: 2, priceOutPerMTok: 8 },
  ],
};

const providers: Record<ProviderId, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
};

export function getProvider(id: string): LlmProvider | null {
  return (providers as Record<string, LlmProvider>)[id] ?? null;
}

/** True if `model` is in the catalog for `provider` (guards untrusted input). */
export function isValidModel(providerId: ProviderId, model: string): boolean {
  return MODEL_CATALOG[providerId]?.some((m) => m.id === model) ?? false;
}

/**
 * Provider + model catalog for the UI, tagging which providers have a key
 * configured, plus the server's default provider/model.
 */
export function catalog() {
  return {
    providers: (Object.keys(MODEL_CATALOG) as ProviderId[]).map((id) => ({
      id,
      label: providers[id].label,
      configured: providers[id].isConfigured(),
      models: MODEL_CATALOG[id],
    })),
  };
}
