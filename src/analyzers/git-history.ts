import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import type { Analyzer, AnalyzerOptions } from './types.js';
import type { Node, Viewpoint } from '../ir/types.js';

const exec = promisify(execFile);

interface CommitTouchedFile {
  commit: string;
  author: string;
  file: string;
}

export interface GitHistoryOptions extends AnalyzerOptions {
  /** Default "90 days ago" — passed verbatim to `git log --since`. */
  since?: string;
}

export const gitHistoryAnalyzer: Analyzer = {
  id: 'git-history',
  async analyze(opts: AnalyzerOptions): Promise<Viewpoint> {
    const repoPath = path.resolve(opts.repoPath);
    const since = (opts as GitHistoryOptions).since ?? '90 days ago';

    let touches: CommitTouchedFile[];
    try {
      const { stdout } = await exec(
        'git',
        [
          'log',
          `--since=${since}`,
          '--name-only',
          '--pretty=format:COMMIT|%H|%an',
          '--no-renames',
        ],
        { cwd: repoPath, maxBuffer: 50_000_000 }
      );
      touches = parseGitLog(stdout);
    } catch {
      return {
        id: 'git-history',
        title: 'Git activity',
        description: 'Not a git repository or git command failed.',
        graph: { nodes: [], edges: [] },
      };
    }

    const moduleStats = new Map<
      string,
      { commits: Set<string>; authors: Map<string, number> }
    >();

    for (const t of touches) {
      const moduleId = extractModule(t.file);
      if (!moduleId) continue;
      let stats = moduleStats.get(moduleId);
      if (!stats) {
        stats = { commits: new Set(), authors: new Map() };
        moduleStats.set(moduleId, stats);
      }
      stats.commits.add(t.commit);
      stats.authors.set(t.author, (stats.authors.get(t.author) ?? 0) + 1);
    }

    const nodes: Node[] = [];
    for (const [moduleId, stats] of moduleStats) {
      const commitCount = stats.commits.size;
      const ranked = [...stats.authors.entries()].sort((a, b) => b[1] - a[1]);
      const topAuthor = ranked[0]?.[0];
      const label = topAuthor
        ? `${moduleId}<br/>${commitCount} commits<br/>top: ${topAuthor}`
        : `${moduleId}<br/>${commitCount} commits`;
      nodes.push({
        id: moduleId,
        label,
        kind: 'module',
        centrality: commitCount,
        meta: {
          commits: commitCount,
          topAuthor,
          authors: ranked.slice(0, 5).map(([name, count]) => ({ name, count })),
        },
      });
    }

    nodes.sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0));

    return {
      id: 'git-history',
      title: `Git activity (since ${since})`,
      description: `Modules ranked by commit count in the time window. Each node shows commit count and top author. Edges are intentionally omitted in this viewpoint — combine with the architecture viewpoint to see structure-vs-activity correlation.`,
      graph: { nodes, edges: [] },
    };
  },
};

function parseGitLog(stdout: string): CommitTouchedFile[] {
  const result: CommitTouchedFile[] = [];
  let currentCommit = '';
  let currentAuthor = '';
  for (const line of stdout.split('\n')) {
    if (line.startsWith('COMMIT|')) {
      const parts = line.split('|');
      currentCommit = parts[1] ?? '';
      currentAuthor = parts[2] ?? '';
    } else if (line.trim() && currentCommit) {
      result.push({
        commit: currentCommit,
        author: currentAuthor,
        file: line.trim(),
      });
    }
  }
  return result;
}

function extractModule(relativePath: string): string | null {
  const parts = relativePath.split('/');
  if (parts[0] === 'src' && parts.length >= 2) return parts[1] ?? null;
  if (parts[0] === 'packages' && parts.length >= 2) return parts[1] ?? null;
  if (parts[0] === 'app' && parts.length >= 2) return `app/${parts[1]}`;
  if (parts.length >= 1) return parts[0] ?? null;
  return null;
}
