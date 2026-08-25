import { config } from '../config.js';
import type { LlmProvider, ProviderId } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export type { ProviderId } from './types.js';

export const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'local'];

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
  // Whatever the EEA gateway serves — configured with EEA_MODEL(S), no pricing
  // (the gateway is in-house, so there is no per-token cost to show).
  local: localModels(),
};

/** Models exposed by the in-house gateway: EEA_MODEL plus optional extras. */
function localModels(): ModelDef[] {
  const ids = config.localModel
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return ids.map((id) => ({ id, label: id.split('/').pop() || id }));
}

const providers: Record<ProviderId, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  // The EEA gateway speaks the OpenAI API — same provider, different endpoint.
  local: new OpenAIProvider({
    id: 'local',
    label: 'EEA Local LLM',
    apiKey: () => config.localApiKey,
    baseUrl: () => config.localBaseUrl,
  }),
};

/** Server-side default model for a provider (used when the UI sends none). */
export function defaultModelFor(id: ProviderId): string {
  if (id === 'openai') return config.openaiModel;
  if (id === 'local') return MODEL_CATALOG.local[0]?.id ?? config.localModel;
  return config.anthropicModel;
}

export function getProvider(id: string): LlmProvider | null {
  return (providers as Record<string, LlmProvider>)[id] ?? null;
}

/** True if `model` is in the catalog for `provider` (guards untrusted input). */
export function isValidModel(providerId: ProviderId, model: string): boolean {
  return MODEL_CATALOG[providerId]?.some((m) => m.id === model) ?? false;
}

/** True when `id` is a known provider id (guards untrusted input). */
export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === 'string' && PROVIDER_IDS.includes(id as ProviderId);
}

/**
 * Provider + model catalog for the UI, tagging which providers have a key
 * configured, plus the server's default provider/model.
 */
export function catalog() {
  return {
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: providers[id].label,
      configured: providers[id].isConfigured(),
      models: MODEL_CATALOG[id],
    })),
  };
}
