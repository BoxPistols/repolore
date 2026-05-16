import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pythonAnalyzer } from '../../src/analyzers/python.js';

let tmpRepo: string;

beforeEach(async () => {
  tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-py-'));
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

describe('pythonAnalyzer', () => {
  it('detects top-level packages from src/ layout', async () => {
    await writeFiles({
      'src/foo/__init__.py': '',
      'src/foo/a.py': 'def hello(): pass',
      'src/bar/__init__.py': '',
      'src/bar/b.py': 'def hi(): pass',
    });
    const vp = await pythonAnalyzer.analyze({ repoPath: tmpRepo });
    const ids = vp.graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['bar', 'foo']);
  });

  it('captures absolute import edges between modules', async () => {
    await writeFiles({
      'src/foo/a.py': 'from bar import x',
      'src/bar/b.py': 'x = 1',
    });
    const vp = await pythonAnalyzer.analyze({ repoPath: tmpRepo });
    const edge = vp.graph.edges.find((e) => e.from === 'foo' && e.to === 'bar');
    expect(edge).toBeDefined();
  });

  it('ignores relative imports (.foo) and external packages (numpy)', async () => {
    await writeFiles({
      'src/foo/a.py': 'from .helpers import x\nimport numpy as np',
      'src/foo/helpers.py': 'x = 1',
    });
    const vp = await pythonAnalyzer.analyze({ repoPath: tmpRepo });
    expect(vp.graph.edges).toHaveLength(0);
  });

  it('excludes __pycache__, .venv, dist, build', async () => {
    await writeFiles({
      'src/foo/a.py': 'pass',
      '__pycache__/cached.py': 'pass',
      '.venv/lib/foo.py': 'pass',
      'dist/foo.py': 'pass',
      'build/foo.py': 'pass',
    });
    const vp = await pythonAnalyzer.analyze({ repoPath: tmpRepo });
    const ids = vp.graph.nodes.map((n) => n.id);
    expect(ids).not.toContain('__pycache__');
    expect(ids).not.toContain('.venv');
    expect(ids).not.toContain('dist');
    expect(ids).not.toContain('build');
  });

  it('handles comments and string literals without false positives', async () => {
    await writeFiles({
      'src/foo/a.py': [
        '# import fake_module',
        'x = "import not_a_real_import"',
        'from bar import real_thing',
      ].join('\n'),
      'src/bar/b.py': 'real_thing = 1',
    });
    const vp = await pythonAnalyzer.analyze({ repoPath: tmpRepo });
    const edges = vp.graph.edges.map((e) => `${e.from}->${e.to}`);
    expect(edges).toContain('foo->bar');
    expect(edges).not.toContain('foo->fake_module');
    expect(edges).not.toContain('foo->not_a_real_import');
  });
});
