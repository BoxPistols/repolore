import Anthropic from '@anthropic-ai/sdk';
import type { Curator, CuratorOptions, CuratorResult } from './types.js';
import { CuratorError } from './types.js';
import type { Node, Viewpoint } from '../ir/types.js';

// Haiku 4.5 pricing (USD per 1M tokens). Used for budget estimation and post-hoc.
const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const anthropicCurator: Curator = {
  id: 'anthropic',
  isRemote: true,
  async curate(viewpoint, options: CuratorOptions = {}): Promise<CuratorResult> {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new CuratorError(
        'ANTHROPIC_API_KEY not set. Export it or pass apiKey in options.'
      );
    }

    const model = options.model ?? DEFAULT_MODEL;

    // Pre-call estimate (rough). Real cost is computed after the response.
    const estimatedInputTokens = estimateInputTokens(viewpoint);
    const estimatedOutputTokens = Math.max(
      256,
      viewpoint.graph.nodes.length * 15
    );
    const estimatedCostUsd = costFor(estimatedInputTokens, estimatedOutputTokens);

    if (options.budgetUsd !== undefined && estimatedCostUsd > options.budgetUsd) {
      throw new CuratorError(
        `Estimated cost $${estimatedCostUsd.toFixed(4)} exceeds budget $${options.budgetUsd.toFixed(4)}. Raise --budget-usd or use --curate none.`
      );
    }

    const client = new Anthropic({ apiKey });

    // System prompt is cacheable across multiple viewpoints in the same run.
    const response = await client.messages.create({
      model,
      max_tokens: Math.max(512, viewpoint.graph.nodes.length * 30),
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserPrompt(viewpoint) }],
    });

    const labels = parseLabels(response);
    const newNodes: Node[] = viewpoint.graph.nodes.map((n) => {
      const summary = labels[n.id];
      if (!summary) return n;
      return { ...n, label: `${n.label}<br/><em>${summary}</em>` };
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const realCostUsd = costFor(inputTokens, outputTokens);

    return {
      viewpoint: {
        ...viewpoint,
        graph: { ...viewpoint.graph, nodes: newNodes },
      },
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: realCostUsd,
      },
    };
  },
};

const SYSTEM_PROMPT = `You are analyzing software repositories. For each module / package / file the user lists, produce a 1-line semantic summary (5–10 words, no period, no module name).

Output format: one line per item, exactly "<id>: <summary>". Do not add any other text, intro, or commentary. Skip any id you cannot meaningfully describe.`;

function buildUserPrompt(viewpoint: Viewpoint): string {
  const ids = viewpoint.graph.nodes.map((n) => `- ${n.id}`).join('\n');
  return `Viewpoint: ${viewpoint.title}
${viewpoint.description ?? ''}

Items:
${ids}`;
}

function parseLabels(response: Anthropic.Message): Record<string, string> {
  const labels: Record<string, string> = {};
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const id = line.slice(0, idx).trim().replace(/^[-*]\s*/, '');
    const summary = line.slice(idx + 1).trim().replace(/\.$/, '');
    if (id && summary) labels[id] = summary;
  }
  return labels;
}

function estimateInputTokens(viewpoint: Viewpoint): number {
  // ~4 chars per token rule of thumb.
  const chars =
    SYSTEM_PROMPT.length +
    buildUserPrompt(viewpoint).length;
  return Math.ceil(chars / 4);
}

function costFor(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK
  );
}
