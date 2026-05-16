import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Project } from 'ts-morph';
import type { Analyzer, AnalyzerOptions } from './types.js';
import type { Edge, Graph, Node, Viewpoint } from '../ir/types.js';

const FALLBACK_GLOBS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.mts',
  'src/**/*.cts',
  'src/**/*.js',
  'src/**/*.jsx',
  'src/**/*.mjs',
];

// Generated / third-party dirs. Even if tsconfig `include` pulls them in
// (e.g. Next.js's `.next/types/**`), they must not appear as modules.
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
  '.cache',
  '.turbo',
  '.vite',
  '.parcel-cache',
  '.output',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
]);

function isExcludedPath(relativePath: string): boolean {
  return relativePath
    .split(path.sep)
    .some((segment) => EXCLUDED_DIR_NAMES.has(segment));
}

export const architectureAnalyzer: Analyzer = {
  id: 'architecture',
  async analyze(opts: AnalyzerOptions): Promise<Viewpoint> {
    const repoPath = path.resolve(opts.repoPath);
    const project = await loadProject(repoPath);
    const sourceFiles = project.getSourceFiles();

    const moduleByFile = new Map<string, string>();
    const modules = new Set<string>();

    for (const sf of sourceFiles) {
      const filePath = sf.getFilePath();
      const relPath = path.relative(repoPath, filePath);
      if (relPath.startsWith('..') || isExcludedPath(relPath)) continue;
      const moduleName = extractModule(relPath);
      moduleByFile.set(filePath, moduleName);
      modules.add(moduleName);
    }

    const edgeMap = new Map<string, number>();
    const recordEdge = (fromModule: string, toFile: string): void => {
      const toModule = moduleByFile.get(toFile);
      if (!toModule || toModule === fromModule) return;
      const key = `${fromModule}->${toModule}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    };

    for (const sf of sourceFiles) {
      const filePath = sf.getFilePath();
      const fromModule = moduleByFile.get(filePath);
      if (!fromModule) continue;

      for (const imp of sf.getImportDeclarations()) {
        const resolved = imp.getModuleSpecifierSourceFile();
        if (resolved) recordEdge(fromModule, resolved.getFilePath());
      }

      // Treat `export { x } from './y'` and `export * from './y'` as edges too.
      for (const exp of sf.getExportDeclarations()) {
        const resolved = exp.getModuleSpecifierSourceFile();
        if (resolved) recordEdge(fromModule, resolved.getFilePath());
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
      centrality: computeCentrality(m, edges),
    }));

    const graph: Graph = { nodes, edges };

    return {
      id: 'architecture',
      title: 'Architecture overview',
      description: `Module-level structure of ${path.basename(repoPath)}. Nodes are top-level source directories; edges represent aggregated import dependencies (weight = import count).`,
      graph,
    };
  },
};

async function loadProject(repoPath: string): Promise<Project> {
  const tsconfigPath = path.join(repoPath, 'tsconfig.json');
  let hasTsconfig = false;
  try {
    await fs.access(tsconfigPath);
    hasTsconfig = true;
  } catch {
    /* no tsconfig */
  }

  if (hasTsconfig) {
    return new Project({ tsConfigFilePath: tsconfigPath });
  }

  const project = new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
  });
  for (const glob of FALLBACK_GLOBS) {
    project.addSourceFilesAtPaths(path.join(repoPath, glob));
  }
  return project;
}

function extractModule(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  if (parts[0] === 'src' && parts.length >= 2) {
    const second = parts[1]!;
    if (parts.length === 2) return path.basename(second, path.extname(second));
    return second;
  }
  if (parts[0] === 'packages' && parts.length >= 2) return parts[1]!;
  if (parts.length >= 2) return parts[0]!;
  return '(root)';
}

function computeCentrality(module: string, edges: Edge[]): number {
  let degree = 0;
  for (const e of edges) {
    if (e.from === module || e.to === module) degree++;
  }
  return degree;
}
