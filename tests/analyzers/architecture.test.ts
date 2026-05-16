import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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

describe('architectureAnalyzer (build-dir exclusion)', () => {
  let tmpRepo: string;

  beforeEach(async () => {
    tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-arch-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRepo, { recursive: true, force: true });
  });

  async function writeFiles(files: Record<string, string>): Promise<void> {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(tmpRepo, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf-8');
    }
  }

  it('excludes .next/types/** even when tsconfig pulls it in (Next.js leak)', async () => {
    await writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          noEmit: true,
        },
        include: ['src/**/*', '.next/types/**/*.ts'],
      }),
      'src/app/page.ts': 'export const page = 1;',
      '.next/types/route.ts': 'export type Route = string;',
    });

    const viewpoint = await architectureAnalyzer.analyze({ repoPath: tmpRepo });
    const moduleIds = viewpoint.graph.nodes.map((n) => n.id);
    expect(moduleIds).not.toContain('.next');
    expect(moduleIds).toContain('app');
  });

  it('excludes dist/, build/, out/, coverage/ regardless of tsconfig', async () => {
    await writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'ESNext', noEmit: true },
        include: ['**/*.ts'],
      }),
      'src/a.ts': 'export const a = 1;',
      'dist/a.js.ts': 'export const x = 1;',
      'build/b.ts': 'export const y = 1;',
      'out/c.ts': 'export const z = 1;',
      'coverage/d.ts': 'export const w = 1;',
    });

    const viewpoint = await architectureAnalyzer.analyze({ repoPath: tmpRepo });
    const moduleIds = viewpoint.graph.nodes.map((n) => n.id);
    expect(moduleIds).not.toContain('dist');
    expect(moduleIds).not.toContain('build');
    expect(moduleIds).not.toContain('out');
    expect(moduleIds).not.toContain('coverage');
  });
});
