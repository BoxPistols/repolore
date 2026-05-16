import type { Viewpoint } from '../ir/types.js';

export type CuratorId = 'none' | 'anthropic' | 'openai' | 'ollama';

export interface CuratorOptions {
  /** Hard cap on LLM spend in USD. Throws CuratorError before calling if estimate exceeds. */
  budgetUsd?: number;
  /** API key override (otherwise reads ${PROVIDER}_API_KEY env var). */
  apiKey?: string;
  /** Provider-specific model name. */
  model?: string;
}

export interface CuratorUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface CuratorResult {
  viewpoint: Viewpoint;
  usage?: CuratorUsage;
}

export interface Curator {
  id: CuratorId;
  /** True if this curator sends code/metadata to a remote provider. */
  isRemote: boolean;
  curate(viewpoint: Viewpoint, options?: CuratorOptions): Promise<CuratorResult>;
}

export class CuratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CuratorError';
  }
}
