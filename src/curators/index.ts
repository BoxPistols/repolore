import { anthropicCurator } from './anthropic.js';
import { noneCurator } from './none.js';
import type { Curator, CuratorId } from './types.js';

export const CURATORS: Record<CuratorId, Curator | null> = {
  none: noneCurator,
  anthropic: anthropicCurator,
  openai: null, // planned: Phase 3.1
  ollama: null, // planned: Phase 3.1 (fully local, no remote round-trip)
};

export function getCurator(id: string): Curator | null {
  const key = id as CuratorId;
  return CURATORS[key] ?? null;
}

export { anthropicCurator } from './anthropic.js';
export { noneCurator } from './none.js';
export type {
  Curator,
  CuratorId,
  CuratorOptions,
  CuratorResult,
  CuratorUsage,
} from './types.js';
export { CuratorError } from './types.js';
