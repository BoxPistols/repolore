import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Analyzer, AnalyzerOptions } from './types.js';
import type { Edge, Node, Viewpoint } from '../ir/types.js';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

type DepKind = 'runtime' | 'dev' | 'peer' | 'optional';

export const depsAnalyzer: Analyzer = {
  id: 'deps',
  async analyze(opts: AnalyzerOptions): Promise<Viewpoint> {
    const repoPath = path.resolve(opts.repoPath);
    const pkgPath = path.join(repoPath, 'package.json');

    let pkg: PackageJson;
    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')) as PackageJson;
    } catch {
      return {
        id: 'deps',
        title: 'External dependencies',
        description: 'No package.json found at repo root.',
        graph: { nodes: [], edges: [] },
      };
    }

    const projectName = pkg.name ?? path.basename(repoPath);
    const projectNode: Node = {
      id: projectName,
      label: projectName,
      kind: 'package',
      centrality: 1,
      meta: { isProject: true },
    };

    const nodes: Node[] = [projectNode];
    const edges: Edge[] = [];
    const seen = new Set<string>([projectName]);

    const addGroup = (deps: Record<string, string> | undefined, kind: DepKind): void => {
      if (!deps) return;
      for (const [name, version] of Object.entries(deps)) {
        if (!seen.has(name)) {
          nodes.push({
            id: name,
            label: name,
            kind: 'package',
            centrality: 0,
            meta: { version, kinds: [kind] },
          });
          seen.add(name);
        } else {
          // Track that this dep appears in multiple groups (e.g. dev + peer).
          const node = nodes.find((n) => n.id === name);
          const kinds = (node?.meta?.kinds as DepKind[] | undefined) ?? [];
          if (node?.meta) node.meta.kinds = [...kinds, kind];
        }
        edges.push({
          from: projectName,
          to: name,
          kind: 'depends-on',
          meta: { depKind: kind, version },
        });
      }
    };

    addGroup(pkg.dependencies, 'runtime');
    addGroup(pkg.devDependencies, 'dev');
    addGroup(pkg.peerDependencies, 'peer');
    addGroup(pkg.optionalDependencies, 'optional');

    const counts = {
      runtime: Object.keys(pkg.dependencies ?? {}).length,
      dev: Object.keys(pkg.devDependencies ?? {}).length,
      peer: Object.keys(pkg.peerDependencies ?? {}).length,
      optional: Object.keys(pkg.optionalDependencies ?? {}).length,
    };

    return {
      id: 'deps',
      title: 'External dependencies',
      description: `Direct dependencies of ${projectName}: ${counts.runtime} runtime, ${counts.dev} dev${counts.peer ? `, ${counts.peer} peer` : ''}${counts.optional ? `, ${counts.optional} optional` : ''}. Solid arrows = runtime, dashed = dev/peer/optional.`,
      graph: { nodes, edges },
    };
  },
};
