import type { Renderer, RendererOptions, RenderedDiagram } from './types.js';
import type { Edge, Graph } from '../ir/types.js';

export const MERMAID_DEFAULTS = {
  maxBytes: 25_000,
  maxNodes: 100,
  maxEdges: 200,
} as const;

export const mermaidRenderer: Renderer = {
  format: 'mermaid',
  render(viewpoint, options: RendererOptions = {}): RenderedDiagram {
    const maxNodes = options.maxNodes ?? MERMAID_DEFAULTS.maxNodes;
    const maxEdges = options.maxEdges ?? MERMAID_DEFAULTS.maxEdges;
    const maxBytes = options.maxBytes ?? MERMAID_DEFAULTS.maxBytes;

    const { graph, truncated: graphTruncated } = pruneGraph(
      viewpoint.graph,
      maxNodes,
      maxEdges
    );

    const source = renderFlowchart(graph);
    const byteSize = Buffer.byteLength(source, 'utf8');
    const overByteLimit = byteSize > maxBytes;

    return {
      source,
      truncated: graphTruncated || overByteLimit,
      format: 'mermaid',
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        byteSize,
      },
    };
  },
};

function pruneGraph(
  graph: Graph,
  maxNodes: number,
  maxEdges: number
): { graph: Graph; truncated: boolean } {
  if (graph.nodes.length <= maxNodes && graph.edges.length <= maxEdges) {
    return { graph, truncated: false };
  }

  const ranked = [...graph.nodes].sort(
    (a, b) => (b.centrality ?? 0) - (a.centrality ?? 0)
  );
  const kept = new Set(ranked.slice(0, maxNodes).map((n) => n.id));

  let edges = graph.edges.filter((e) => kept.has(e.from) && kept.has(e.to));
  if (edges.length > maxEdges) {
    edges = [...edges]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, maxEdges);
  }

  return {
    graph: {
      nodes: graph.nodes.filter((n) => kept.has(n.id)),
      edges,
      groups: graph.groups,
    },
    truncated: true,
  };
}

function renderFlowchart(graph: Graph): string {
  const lines: string[] = ['flowchart LR'];

  for (const node of graph.nodes) {
    lines.push(`    ${sanitizeId(node.id)}["${escapeLabel(node.label)}"]`);
  }

  for (const edge of graph.edges) {
    const arrow = arrowFor(edge);
    // Canonical Mermaid syntax: no space between arrow and pipe (`-->|"2"| B`).
    const labelPart =
      edge.weight && edge.weight > 1 ? `|"${edge.weight}"|` : '';
    lines.push(
      `    ${sanitizeId(edge.from)} ${arrow}${labelPart} ${sanitizeId(edge.to)}`
    );
  }

  return lines.join('\n');
}

function arrowFor(edge: Edge): string {
  switch (edge.kind) {
    case 'imports':
    case 'depends-on':
      return '-->';
    case 'calls':
      return '-->';
    case 'contains':
      return '-.->';
    case 'authored':
    case 'modified':
      return '-.->';
    default:
      return '-->';
  }
}

function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '#quot;');
}
