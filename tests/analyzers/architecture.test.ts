import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureAnalyzer } from '../../src/analyzers/architecture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(here, '..', 'fixtures', 'tiny-repo');

describe('architectureAnalyzer (fixture: tiny-repo)', () => {
  it('detects all top-level modules under src/', async () => {
    const viewpoint = await architectureAnalyzer.analyze({ repoPath: fixture });
    const moduleIds = viewpoint.graph.nodes.map((n) => n.id).sort();
    expect(moduleIds).toEqual(['bar', 'foo', 'shared']);
  });

  it('captures foo → bar import edge', async () => {
    const viewpoint = await architectureAnalyzer.analyze({ repoPath: fixture });
    const fooBar = viewpoint.graph.edges.find(
      (e) => e.from === 'foo' && e.to === 'bar'
    );
    expect(fooBar).toBeDefined();
    expect(fooBar?.kind).toBe('imports');
  });

  it('captures bar → shared edge (type-only import)', async () => {
    const viewpoint = await architectureAnalyzer.analyze({ repoPath: fixture });
    const barShared = viewpoint.graph.edges.find(
      (e) => e.from === 'bar' && e.to === 'shared'
    );
    expect(barShared).toBeDefined();
  });

  it('assigns higher centrality to bar (in-degree 1 + out-degree 1)', async () => {
    const viewpoint = await architectureAnalyzer.analyze({ repoPath: fixture });
    const bar = viewpoint.graph.nodes.find((n) => n.id === 'bar');
    const shared = viewpoint.graph.nodes.find((n) => n.id === 'shared');
    expect(bar?.centrality).toBeGreaterThanOrEqual(shared?.centrality ?? 0);
  });

  it('viewpoint metadata has the correct id and title', async () => {
    const viewpoint = await architectureAnalyzer.analyze({ repoPath: fixture });
    expect(viewpoint.id).toBe('architecture');
    expect(viewpoint.title).toBe('Architecture overview');
  });
});
