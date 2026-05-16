import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { depsAnalyzer } from '../../src/analyzers/deps.js';

let tmpRepo: string;

beforeEach(async () => {
  tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-deps-'));
});

afterEach(async () => {
  await fs.rm(tmpRepo, { recursive: true, force: true });
});

async function writePkg(pkg: object): Promise<void> {
  await fs.writeFile(
    path.join(tmpRepo, 'package.json'),
    JSON.stringify(pkg),
    'utf-8'
  );
}

describe('depsAnalyzer', () => {
  it('handles missing package.json gracefully', async () => {
    const vp = await depsAnalyzer.analyze({ repoPath: tmpRepo });
    expect(vp.graph.nodes).toHaveLength(0);
    expect(vp.graph.edges).toHaveLength(0);
  });

  it('emits project node + one node per dep, edges from project', async () => {
    await writePkg({
      name: 'demo',
      dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    const vp = await depsAnalyzer.analyze({ repoPath: tmpRepo });
    const ids = vp.graph.nodes.map((n) => n.id);
    expect(ids).toContain('demo');
    expect(ids).toContain('react');
    expect(ids).toContain('lodash');
    expect(ids).toContain('vitest');
    expect(vp.graph.edges.every((e) => e.from === 'demo')).toBe(true);
    expect(vp.graph.edges).toHaveLength(3);
  });

  it('tags edges with their depKind in meta', async () => {
    await writePkg({
      name: 'demo',
      dependencies: { a: '1' },
      devDependencies: { b: '1' },
      peerDependencies: { c: '1' },
    });
    const vp = await depsAnalyzer.analyze({ repoPath: tmpRepo });
    const a = vp.graph.edges.find((e) => e.to === 'a');
    const b = vp.graph.edges.find((e) => e.to === 'b');
    const c = vp.graph.edges.find((e) => e.to === 'c');
    expect(a?.meta?.depKind).toBe('runtime');
    expect(b?.meta?.depKind).toBe('dev');
    expect(c?.meta?.depKind).toBe('peer');
  });

  it('uses dir name when package.json has no name field', async () => {
    await writePkg({ dependencies: { x: '1' } });
    const vp = await depsAnalyzer.analyze({ repoPath: tmpRepo });
    expect(vp.graph.nodes[0]?.id).toBe(path.basename(tmpRepo));
  });
});
