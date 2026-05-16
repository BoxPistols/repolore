import { describe, expect, it } from 'vitest';
import { mermaidRenderer } from '../../src/renderers/mermaid.js';
import type { Viewpoint } from '../../src/ir/types.js';

function makeViewpoint(overrides: Partial<Viewpoint['graph']> = {}): Viewpoint {
  return {
    id: 'architecture',
    title: 'Test',
    graph: {
      nodes: overrides.nodes ?? [
        { id: 'a', label: 'a', kind: 'module', centrality: 2 },
        { id: 'b', label: 'b', kind: 'module', centrality: 1 },
        { id: 'c', label: 'c', kind: 'module', centrality: 1 },
      ],
      edges: overrides.edges ?? [
        { from: 'a', to: 'b', kind: 'imports', weight: 1 },
        { from: 'a', to: 'c', kind: 'imports', weight: 3 },
      ],
      ...(overrides.groups ? { groups: overrides.groups } : {}),
    },
  };
}

describe('mermaidRenderer', () => {
  it('emits `flowchart LR` and stable node IDs', () => {
    const out = mermaidRenderer.render(makeViewpoint());
    expect(out.source.startsWith('flowchart LR')).toBe(true);
    expect(out.source).toContain('a["a"]');
    expect(out.source).toContain('b["b"]');
    expect(out.format).toBe('mermaid');
  });

  it('omits edge label when weight is 1', () => {
    const out = mermaidRenderer.render(makeViewpoint());
    expect(out.source).toContain('a --> b');
    expect(out.source).not.toMatch(/a -->\|"?1"?\| b/);
  });

  it('includes edge label with weight when > 1', () => {
    const out = mermaidRenderer.render(makeViewpoint());
    expect(out.source).toContain('a -->|"3"| c');
  });

  it('never emits a %%{init}%% theme directive (would break GitHub dark mode)', () => {
    const out = mermaidRenderer.render(makeViewpoint());
    expect(out.source).not.toContain('%%{init');
  });

  it('uses no space between arrow and pipe (canonical Mermaid syntax)', () => {
    const out = mermaidRenderer.render(makeViewpoint());
    expect(out.source).not.toMatch(/-->\s+\|/);
  });

  it('prunes by centrality when maxNodes exceeded', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      label: `n${i}`,
      kind: 'module' as const,
      centrality: 10 - i,
    }));
    const edges = nodes.slice(1).map((n) => ({
      from: 'n0',
      to: n.id,
      kind: 'imports' as const,
    }));
    const out = mermaidRenderer.render(makeViewpoint({ nodes, edges }), {
      maxNodes: 3,
    });
    expect(out.truncated).toBe(true);
    expect(out.stats.nodeCount).toBe(3);
    // Top-3 centrality: n0 (10), n1 (9), n2 (8)
    expect(out.source).toContain('n0["n0"]');
    expect(out.source).toContain('n1["n1"]');
    expect(out.source).toContain('n2["n2"]');
    expect(out.source).not.toContain('n9["n9"]');
  });

  it('sanitizes IDs with dashes and dots', () => {
    const out = mermaidRenderer.render(
      makeViewpoint({
        nodes: [
          { id: 'foo-bar', label: 'foo-bar', kind: 'module', centrality: 1 },
          { id: 'baz.qux', label: 'baz.qux', kind: 'module', centrality: 1 },
        ],
        edges: [{ from: 'foo-bar', to: 'baz.qux', kind: 'imports' }],
      })
    );
    expect(out.source).toContain('foo_bar["foo-bar"]');
    expect(out.source).toContain('baz_qux["baz.qux"]');
    expect(out.source).toContain('foo_bar --> baz_qux');
  });
});
