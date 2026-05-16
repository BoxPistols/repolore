import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gitHistoryAnalyzer } from '../../src/analyzers/git-history.js';

const exec = promisify(execFile);

let tmpRepo: string;

beforeEach(async () => {
  tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-git-'));
  await exec('git', ['init', '-b', 'main'], { cwd: tmpRepo });
  await exec('git', ['config', 'user.email', 'test@example.com'], {
    cwd: tmpRepo,
  });
  await exec('git', ['config', 'user.name', 'Test User'], { cwd: tmpRepo });
});

afterEach(async () => {
  await fs.rm(tmpRepo, { recursive: true, force: true });
});

async function commit(
  files: Record<string, string>,
  msg: string,
  authorName = 'Test User'
): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmpRepo, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }
  await exec('git', ['add', '.'], { cwd: tmpRepo });
  await exec(
    'git',
    ['commit', '-m', msg, '--author', `${authorName} <${authorName}@x>`],
    { cwd: tmpRepo }
  );
}

describe('gitHistoryAnalyzer', () => {
  it('returns empty graph on a non-git directory', async () => {
    const nonGit = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-nogit-'));
    try {
      const vp = await gitHistoryAnalyzer.analyze({ repoPath: nonGit });
      expect(vp.graph.nodes).toHaveLength(0);
    } finally {
      await fs.rm(nonGit, { recursive: true, force: true });
    }
  });

  it('groups commits by top-level module under src/', async () => {
    await commit(
      { 'src/foo/a.ts': '1', 'src/bar/b.ts': '1' },
      'init'
    );
    await commit({ 'src/foo/a.ts': '2' }, 'edit foo');

    const vp = await gitHistoryAnalyzer.analyze({ repoPath: tmpRepo });
    const ids = vp.graph.nodes.map((n) => n.id);
    expect(ids).toContain('foo');
    expect(ids).toContain('bar');

    const foo = vp.graph.nodes.find((n) => n.id === 'foo');
    const bar = vp.graph.nodes.find((n) => n.id === 'bar');
    // foo touched in 2 commits, bar in 1
    expect((foo?.centrality ?? 0)).toBeGreaterThan(bar?.centrality ?? 0);
  });

  it('records top author per module', async () => {
    await commit({ 'src/foo/a.ts': '1' }, 'alice 1', 'Alice');
    await commit({ 'src/foo/a.ts': '2' }, 'alice 2', 'Alice');
    await commit({ 'src/foo/a.ts': '3' }, 'bob 1', 'Bob');

    const vp = await gitHistoryAnalyzer.analyze({ repoPath: tmpRepo });
    const foo = vp.graph.nodes.find((n) => n.id === 'foo');
    expect(foo?.meta?.topAuthor).toBe('Alice');
  });

  it('emits no edges (this viewpoint is a node-only ranking)', async () => {
    await commit({ 'src/x/a.ts': '1' }, 'init');
    const vp = await gitHistoryAnalyzer.analyze({ repoPath: tmpRepo });
    expect(vp.graph.edges).toHaveLength(0);
  });
});
