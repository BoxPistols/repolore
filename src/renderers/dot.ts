import type { Renderer, RendererOptions, RenderedDiagram } from './types.js';
import type { Graph } from '../ir/types.js';

const DEFAULTS = { maxBytes: 100_000, maxNodes: 500, maxEdges: 2000 } as const;

export const dotRenderer: Renderer = {
  format: 'dot',
  render(viewpoint, options: RendererOptions = {}): RenderedDiagram {
    const maxNodes = options.maxNodes ?? DEFAULTS.maxNodes;
    const maxEdges = options.maxEdges ?? DEFAULTS.maxEdges;
    const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;

    const { graph, truncated } = pruneGraph(viewpoint.graph, maxNodes, maxEdges);
    const source = renderDot(graph);
    const byteSize = Buffer.byteLength(source, 'utf8');

    return {
      source,
      truncated: truncated || byteSize > maxBytes,
      format: 'dot',
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        byteSize,
      },
    };
  },
};

function renderDot(graph: Graph): string {
  const lines: string[] = [
    'digraph G {',
    '    rankdir=LR;',
    '    node [shape=box, fontname="Helvetica"];',
    '    edge [fontname="Helvetica", fontsize=10];',
  ];
  for (const node of graph.nodes) {
    lines.push(`    "${quoteId(node.id)}" [label="${dotLabel(node.label)}"];`);
  }
  for (const edge of graph.edges) {
    const labelPart =
      edge.weight && edge.weight > 1 ? ` [label="${edge.weight}"]` : '';
    const style = edge.kind === 'contains' ? ' [style=dashed]' : '';
    lines.push(
      `    "${quoteId(edge.from)}" -> "${quoteId(edge.to)}"${labelPart || style};`
    );
  }
  lines.push('}');
  return lines.join('\n');
}

function quoteId(s: string): string {
  return s.replace(/"/g, '\\"');
}

// DOT label: <br/> → DOT's literal-`\n` newline escape, escape quotes only.
// We deliberately do NOT escape backslashes — the IR uses HTML-style line breaks,
// not raw backslashes, so double-escaping would mangle the `\n` we just inserted.
function dotLabel(label: string): string {
  return label.replace(/"/g, '\\"').replace(/<br\/?>/g, '\\n');
}

function pruneGraph(graph: Graph, maxNodes: number, maxEdges: number) {
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
