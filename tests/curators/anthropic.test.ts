import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { anthropicCurator } from '../../src/curators/anthropic.js';
import { CuratorError } from '../../src/curators/types.js';
import type { Viewpoint } from '../../src/ir/types.js';

// Mock the entire @anthropic-ai/sdk module
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

const sample: Viewpoint = {
  id: 'architecture',
  title: 'Architecture',
  graph: {
    nodes: [
      { id: 'auth', label: 'auth', kind: 'module' },
      { id: 'api', label: 'api', kind: 'module' },
    ],
    edges: [],
  },
};

let originalEnvKey: string | undefined;

beforeEach(() => {
  mockCreate.mockReset();
  originalEnvKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalEnvKey !== undefined) process.env.ANTHROPIC_API_KEY = originalEnvKey;
});

describe('anthropicCurator', () => {
  it('throws CuratorError when ANTHROPIC_API_KEY is missing', async () => {
    await expect(anthropicCurator.curate(sample)).rejects.toBeInstanceOf(
      CuratorError
    );
  });

  it('throws CuratorError when estimated cost exceeds --budget-usd', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    // Tiny budget will be exceeded by the baseline system prompt token count.
    await expect(
      anthropicCurator.curate(sample, { budgetUsd: 0.0000001 })
    ).rejects.toBeInstanceOf(CuratorError);
  });

  it('enriches node labels with the model response', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'auth: Handles login and session\napi: HTTP routing layer',
        },
      ],
      usage: { input_tokens: 100, output_tokens: 30 },
    });

    const { viewpoint, usage } = await anthropicCurator.curate(sample, {
      apiKey: 'sk-test',
      budgetUsd: 1,
    });

    const auth = viewpoint.graph.nodes.find((n) => n.id === 'auth');
    expect(auth?.label).toContain('Handles login and session');
    expect(usage?.inputTokens).toBe(100);
    expect(usage?.outputTokens).toBe(30);
    expect(usage?.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('is marked as remote', () => {
    expect(anthropicCurator.isRemote).toBe(true);
  });
});
