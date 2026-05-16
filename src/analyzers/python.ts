import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Analyzer, AnalyzerOptions } from './types.js';
import type { Edge, Graph, Node, Viewpoint } from '../ir/types.js';

const EXCLUDED_DIRS = new Set([
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.tox',
  '.pytest_cache',
  '.ruff_cache',
  '.mypy_cache',
  'dist',
  'build',
  'site-packages',
  'node_modules',
  '.git',
  'htmlcov',
  '.eggs',
]);

export const pythonAnalyzer: Analyzer = {
  id: 'python',
  async analyze(opts: AnalyzerOptions): Promise<Viewpoint> {
    const repoPath = path.resolve(opts.repoPath);
    const files = await collectPythonFiles(repoPath);

    const moduleByFile = new Map<string, string>();
    const modules = new Set<string>();
    for (const file of files) {
      const moduleName = extractModule(file, repoPath);
      if (!moduleName) continue;
      moduleByFile.set(file, moduleName);
      modules.add(moduleName);
    }

    const edgeMap = new Map<string, number>();
    for (const file of files) {
      const fromModule = moduleByFile.get(file);
      if (!fromModule) continue;
      let content: string;
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch {
        continue;
      }
      for (const imp of parsePythonImports(content)) {
        const toModule = resolveImportToModule(imp, modules);
        if (!toModule || toModule === fromModule) continue;
        const key = `${fromModule}->${toModule}`;
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      }
    }

    const edges: Edge[] = [...edgeMap.entries()].map(([key, weight]) => {
      const [from = '', to = ''] = key.split('->');
      return { from, to, kind: 'imports' as const, weight };
    });
    const nodes: Node[] = [...modules].map((m) => ({
      id: m,
      label: m,
      kind: 'module' as const,
      centrality: edges.filter((e) => e.from === m || e.to === m).length,
    }));

    return {
      id: 'python',
      title: 'Python architecture',
      description: `Python module structure of ${path.basename(repoPath)}. Top-level packages as nodes; absolute imports aggregate into edges. Relative imports (\`from .x import y\`) and external packages are intentionally excluded — only intra-repo structure is shown.`,
      graph: { nodes, edges },
    };
  },
};

async function collectPythonFiles(
  dir: string,
  acc: string[] = []
): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDED_DIRS.has(e.name)) continue;
      await collectPythonFiles(full, acc);
    } else if (e.isFile() && e.name.endsWith('.py')) {
      acc.push(full);
    }
  }
  return acc;
}

function extractModule(filePath: string, repoPath: string): string | null {
  const rel = path.relative(repoPath, filePath);
  const parts = rel.split(path.sep);
  if (parts[0] === 'src' && parts.length >= 2) return parts[1] ?? null;
  if (parts.length >= 1) return parts[0] ?? null;
  return null;
}

function parsePythonImports(content: string): string[] {
  const result: string[] = [];
  // Strip simple string contents and comments to reduce false positives.
  const lines = content.split('\n');
  for (const raw of lines) {
    const line = raw.split('#')[0] ?? raw;
    let m = line.match(/^\s*from\s+([A-Za-z_][\w.]*)\s+import/);
    if (m && m[1]) {
      result.push(m[1]);
      continue;
    }
    m = line.match(/^\s*import\s+([A-Za-z_][\w.]*)/);
    if (m && m[1]) {
      result.push(m[1]);
    }
  }
  return result;
}

function resolveImportToModule(
  imp: string,
  knownModules: Set<string>
): string | null {
  // Relative imports start with '.' — we don't model cross-module info for them.
  if (imp.startsWith('.')) return null;
  const first = imp.split('.')[0];
  if (first && knownModules.has(first)) return first;
  return null;
}
