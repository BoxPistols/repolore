import { architectureAnalyzer } from './architecture.js';
import { gitHistoryAnalyzer } from './git-history.js';
import type { Analyzer, AnalyzerOptions } from './types.js';
import type { Node, Viewpoint } from '../ir/types.js';

/**
 * The marquee viewpoint: structure (who imports whom) overlaid with activity
 * (commit count and top author per module in the last 90 days). No existing
 * OSS tool ships this combination — gource/git-truck have history without
 * structure, madge/dependency-cruiser have structure without history.
 */
export const architectureHistoryAnalyzer: Analyzer = {
  id: 'architecture-history',
  async analyze(opts: AnalyzerOptions): Promise<Viewpoint> {
    const [arch, history] = await Promise.all([
      architectureAnalyzer.analyze(opts),
      gitHistoryAnalyzer.analyze(opts),
    ]);

    const historyByModule = new Map(
      history.graph.nodes.map((n) => [n.id, n])
    );

    const fusedNodes: Node[] = arch.graph.nodes.map((n) => {
      const h = historyByModule.get(n.id);
      if (!h) {
        return {
          ...n,
          label: `${n.label}<br/><em>no activity</em>`,
          meta: { ...n.meta, fusion: 'no-history' },
        };
      }
      const commits = (h.meta?.commits as number | undefined) ?? 0;
      const topAuthor = (h.meta?.topAuthor as string | undefined) ?? '?';
      const heat = heatTier(commits);
      return {
        ...n,
        label: `${n.label}<br/>${heat} ${commits} commits<br/>top: ${topAuthor}`,
        centrality: (n.centrality ?? 0) + commits, // structurally central AND hot wins
        meta: {
          ...(n.meta ?? {}),
          ...(h.meta ?? {}),
          fusion: 'merged',
        },
      };
    });

    return {
      id: 'architecture-history',
      title: 'Architecture × git activity',
      description: `Module structure (imports) overlaid with git activity. Each node carries commit count and top author from the last 90 days. Heat tier (🔥/🌡/❄): visual cue for the most-touched modules. This fusion is the differentiator from single-viewpoint tools (gource, git-truck, madge).`,
      graph: { nodes: fusedNodes, edges: arch.graph.edges },
    };
  },
};

function heatTier(commits: number): string {
  if (commits >= 10) return '🔥';
  if (commits >= 3) return '🌡';
  return '❄';
}
