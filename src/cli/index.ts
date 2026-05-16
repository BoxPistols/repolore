#!/usr/bin/env node
import { cac } from 'cac';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import pc from 'picocolors';
import { architectureAnalyzer } from '../analyzers/architecture.js';
import { mermaidRenderer } from '../renderers/mermaid.js';
import { writeViewpointMarkdown } from '../inject/markdown.js';
import { injectIntoReadme } from '../inject/readme.js';
import { readPackageVersion } from '../util/version.js';
import { readHeadCommit } from '../util/git.js';

const VERSION = readPackageVersion();

const cli = cac('repolore');

cli
  .command('[path]', 'Generate diagrams for a repo (default: cwd)')
  .option('-o, --output <dir>', 'Output directory (relative to repo)', {
    default: 'docs/diagrams',
  })
  .option('--viewpoints <list>', 'Comma-separated viewpoint IDs', {
    default: 'architecture',
  })
  .option('--format <fmt>', 'Output format (mermaid)', { default: 'mermaid' })
  .option('--max-nodes <n>', 'Cap nodes per diagram', { default: 100 })
  .option('--max-edges <n>', 'Cap edges per diagram', { default: 200 })
  .option('--inject <file>', 'Inject diagrams into a Markdown file at markers')
  .option('--quiet', 'Suppress non-error output')
  .action(async (pathArg: string | undefined, opts: Record<string, unknown>) => {
    const repoPath = path.resolve(
      typeof pathArg === 'string' ? pathArg : process.cwd()
    );
    const outputDir = path.resolve(repoPath, String(opts.output));
    const requested = String(opts.viewpoints)
      .split(',')
      .map((s) => s.trim());
    const quiet = Boolean(opts.quiet);

    const log = (msg: string) => {
      if (!quiet) console.log(msg);
    };

    log(pc.dim(`repolore v${VERSION}`));
    log(pc.dim(`repo: ${repoPath}`));

    const viewpoints = [];
    if (requested.includes('architecture')) {
      log(pc.cyan('→ analyzing architecture…'));
      const vp = await architectureAnalyzer.analyze({ repoPath });
      viewpoints.push(vp);
      log(
        pc.dim(
          `  ${vp.graph.nodes.length} modules, ${vp.graph.edges.length} edges`
        )
      );
    }

    if (viewpoints.length === 0) {
      console.error(
        pc.red(
          `No supported viewpoints in --viewpoints (got: ${requested.join(', ')}). Currently supported: architecture.`
        )
      );
      process.exit(1);
    }

    await fs.mkdir(outputDir, { recursive: true });
    const commit = await readHeadCommit(repoPath);
    const meta = { commit, toolVersion: VERSION };

    const rendered = viewpoints.map((vp) => ({
      viewpoint: vp,
      rendered: mermaidRenderer.render(vp, {
        maxNodes: Number(opts.maxNodes),
        maxEdges: Number(opts.maxEdges),
      }),
    }));

    for (const { viewpoint, rendered: diagram } of rendered) {
      const file = path.join(outputDir, `${viewpoint.id}.md`);
      await writeViewpointMarkdown(file, viewpoint, diagram, meta);
      log(
        pc.green(`✓ ${path.relative(repoPath, file)}`) +
          pc.dim(
            ` (${diagram.stats.nodeCount}n/${diagram.stats.edgeCount}e/${diagram.stats.byteSize}B${diagram.truncated ? ', truncated' : ''})`
          )
      );
    }

    if (opts.inject) {
      const target = path.resolve(repoPath, String(opts.inject));
      await injectIntoReadme(target, rendered, meta);
      log(pc.green(`✓ injected into ${path.relative(repoPath, target)}`));
    }
  });

cli.command('check', 'Stale-check diagrams against current HEAD (not yet implemented)').action(() => {
  console.error(pc.yellow('check: not yet implemented (planned for v0.2)'));
  process.exit(1);
});

cli.version(VERSION);
cli.help();

try {
  cli.parse();
} catch (err) {
  console.error(pc.red(String(err)));
  process.exit(1);
}
