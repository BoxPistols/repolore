import { describe, expect, it } from 'vitest';
import { dotRenderer } from '../../src/renderers/dot.js';
import type { Viewpoint } from '../../src/ir/types.js';

const sample: Viewpoint = {
  id: 'architecture',
  title: 't',
  graph: {
    nodes: [
      { id: 'a', label: 'a', kind: 'module', centrality: 2 },
      { id: 'b', label: 'b', kind: 'module', centrality: 1 },
    ],
    edges: [{ from: 'a', to: 'b', kind: 'imports', weight: 3 }],
  },
};

describe('dotRenderer', () => {
  it('emits `digraph G {`', () => {
    const out = dotRenderer.render(sample);
    expect(out.source.startsWith('digraph G {')).toBe(true);
    expect(out.source.endsWith('}')).toBe(true);
    expect(out.format).toBe('dot');
  });

  it('quotes node IDs and includes labels', () => {
    const out = dotRenderer.render(sample);
    expect(out.source).toContain('"a" [label="a"]');
    expect(out.source).toContain('"b" [label="b"]');
  });

  it('renders weighted edge as label attribute', () => {
    const out = dotRenderer.render(sample);
    expect(out.source).toMatch(/"a" -> "b" \[label="3"\];/);
  });

  it('escapes quotes inside labels', () => {
    const vp: Viewpoint = {
      id: 'architecture',
      title: 't',
      graph: {
        nodes: [{ id: 'x', label: 'has "quotes"', kind: 'module' }],
        edges: [],
      },
    };
    const out = dotRenderer.render(vp);
    expect(out.source).toContain('"x" [label="has \\"quotes\\""]');
  });

  it('converts <br/> in labels to \\n for graphviz', () => {
    const vp: Viewpoint = {
      id: 'architecture',
      title: 't',
      graph: {
        nodes: [{ id: 'x', label: 'foo<br/>bar', kind: 'module' }],
        edges: [],
      },
    };
    const out = dotRenderer.render(vp);
    expect(out.source).toContain('"x" [label="foo\\nbar"]');
  });
});
