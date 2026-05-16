#!/usr/bin/env node
import { cac } from 'cac';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import pc from 'picocolors';
import {
  architectureAnalyzer,
  architectureHistoryAnalyzer,
  depsAnalyzer,
  gitHistoryAnalyzer,
  pythonAnalyzer,
} from '../analyzers/index.js';
import type { Analyzer } from '../analyzers/types.js';
import { mermaidRenderer } from '../renderers/mermaid.js';
import { dotRenderer } from '../renderers/dot.js';
import type { Renderer } from '../renderers/types.js';
import { writeViewpointMarkdown } from '../inject/markdown.js';
import { injectIntoReadme } from '../inject/readme.js';
import { readPackageVersion } from '../util/version.js';
import { readHeadCommit } from '../util/git.js';
import { getCurator, CuratorError } from '../curators/index.js';

const VERSION = readPackageVersion();

const ANALYZERS: Record<string, Analyzer> = {
  architecture: architectureAnalyzer,
  'architecture-history': architectureHistoryAnalyzer,
  deps: depsAnalyzer,
  'git-history': gitHistoryAnalyzer,
  python: pythonAnalyzer,
};

const RENDERERS: Record<string, Renderer> = {
  mermaid: mermaidRenderer,
  dot: dotRenderer,
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  mermaid: '.md',
  dot: '.dot',
};

const cli = cac('repolore');

cli
  .command('[path]', 'Generate diagrams for a repo (default: cwd)')
  .option('-o, --output <dir>', 'Output directory (relative to repo)', {
    default: 'docs/diagrams',
  })
  .option(
    '--viewpoints <list>',
    'Viewpoint IDs (comma): architecture, architecture-history, deps, git-history, python',
    { default: 'architecture' }
  )
  .option('--format <list>', 'Output formats (comma): mermaid, dot', {
    default: 'mermaid',
  })
  .option('--max-nodes <n>', 'Cap nodes per diagram', { default: 100 })
  .option('--max-edges <n>', 'Cap edges per diagram', { default: 200 })
  .option(
    '--inject <file>',
    'Inject Mermaid diagrams into a Markdown file at markers'
  )
  .option(
    '--curate <provider>',
    'LLM curator: none | anthropic (default none; sends node metadata to provider)',
    { default: 'none' }
  )
  .option('--curate-model <name>', 'Provider-specific model name')
  .option('--budget-usd <n>', 'Max LLM spend per run; hard-fail above', {
    default: 0.1,
  })
  .option('--quiet', 'Suppress non-error output')
  .action(async (pathArg: string | undefined, opts: Record<string, unknown>) => {
    const repoPath = path.resolve(
      typeof pathArg === 'string' ? pathArg : process.cwd()
    );
    const outputDir = path.resolve(repoPath, String(opts.output));
    const requested = String(opts.viewpoints)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const formats = String(opts.format)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const quiet = Boolean(opts.quiet);

    const log = (msg: string) => {
      if (!quiet) console.log(msg);
    };

    log(pc.dim(`repolore v${VERSION}`));
    log(pc.dim(`repo: ${repoPath}`));

    const viewpoints = [];
    const unknownViews: string[] = [];
    for (const id of requested) {
      const analyzer = ANALYZERS[id];
      if (!analyzer) {
        unknownViews.push(id);
        continue;
      }
      log(pc.cyan(`→ analyzing ${id}…`));
      const vp = await analyzer.analyze({ repoPath });
      viewpoints.push(vp);
      log(
        pc.dim(
          `  ${vp.graph.nodes.length} nodes, ${vp.graph.edges.length} edges`
        )
      );
    }

    if (unknownViews.length > 0) {
      console.error(
        pc.yellow(
          `Unknown viewpoint(s) skipped: ${unknownViews.join(', ')}. Available: ${Object.keys(ANALYZERS).join(', ')}.`
        )
      );
    }

    const activeRenderers = formats
      .map((f) => RENDERERS[f])
      .filter((r): r is Renderer => Boolean(r));
    const unknownFormats = formats.filter((f) => !RENDERERS[f]);
    if (unknownFormats.length > 0) {
      console.error(
        pc.yellow(
          `Unknown format(s) skipped: ${unknownFormats.join(', ')}. Available: ${Object.keys(RENDERERS).join(', ')}.`
        )
      );
    }
    if (activeRenderers.length === 0) {
      console.error(pc.red('No valid output formats. Nothing to write.'));
      process.exit(1);
    }

    if (viewpoints.length === 0) {
      console.error(pc.red('No viewpoints analyzed. Nothing to write.'));
      process.exit(1);
    }

    const curatorId = String(opts.curate);
    const curator = getCurator(curatorId);
    if (!curator) {
      console.error(
        pc.red(
          `Unknown curator: ${curatorId}. Available: none, anthropic (openai/ollama planned).`
        )
      );
      process.exit(1);
    }
    if (curator.isRemote) {
      log(
        pc.yellow(
          `⚠ --curate ${curator.id}: module/file names will be sent to the ${curator.id} API. Budget cap: $${Number(opts.budgetUsd).toFixed(2)}.`
        )
      );
    }

    const curated = [];
    let totalCostUsd = 0;
    for (const vp of viewpoints) {
      try {
        const result = await curator.curate(vp, {
          budgetUsd: Number(opts.budgetUsd),
          model: opts.curateModel ? String(opts.curateModel) : undefined,
        });
        curated.push(result.viewpoint);
        if (result.usage) {
          totalCostUsd += result.usage.estimatedCostUsd;
          log(
            pc.dim(
              `  curated ${vp.id}: $${result.usage.estimatedCostUsd.toFixed(4)} (${result.usage.inputTokens}in/${result.usage.outputTokens}out)`
            )
          );
        }
      } catch (err) {
        if (err instanceof CuratorError) {
          console.error(pc.red(`curator error on ${vp.id}: ${err.message}`));
          process.exit(2);
        }
        throw err;
      }
    }
    if (totalCostUsd > 0) {
      log(pc.dim(`  total LLM spend: $${totalCostUsd.toFixed(4)}`));
    }

    await fs.mkdir(outputDir, { recursive: true });
    const commit = await readHeadCommit(repoPath);
    const meta = { commit, toolVersion: VERSION };

    // Render each (viewpoint × format) pair.
    const renderedForMermaidInject: Array<{
      viewpoint: (typeof curated)[number];
      rendered: ReturnType<Renderer['render']>;
    }> = [];

    for (const vp of curated) {
      for (const renderer of activeRenderers) {
        const diagram = renderer.render(vp, {
          maxNodes: Number(opts.maxNodes),
          maxEdges: Number(opts.maxEdges),
        });
        const ext = FORMAT_EXTENSIONS[renderer.format] ?? '.txt';
        const file = path.join(outputDir, `${vp.id}${ext}`);
        if (renderer.format === 'mermaid') {
          await writeViewpointMarkdown(file, vp, diagram, meta);
          renderedForMermaidInject.push({ viewpoint: vp, rendered: diagram });
        } else {
          await fs.writeFile(file, diagram.source, 'utf-8');
        }
        log(
          pc.green(`✓ ${path.relative(repoPath, file)}`) +
            pc.dim(
              ` [${renderer.format}] (${diagram.stats.nodeCount}n/${diagram.stats.edgeCount}e/${diagram.stats.byteSize}B${diagram.truncated ? ', truncated' : ''})`
            )
        );
      }
    }

    if (opts.inject) {
      if (renderedForMermaidInject.length === 0) {
        console.error(
          pc.yellow(
            '--inject requires mermaid format. Add `mermaid` to --format.'
          )
        );
      } else {
        const target = path.resolve(repoPath, String(opts.inject));
        await injectIntoReadme(target, renderedForMermaidInject, meta);
        log(pc.green(`✓ injected into ${path.relative(repoPath, target)}`));
      }
    }
  });

cli
  .command(
    'check',
    'Stale-check diagrams against current HEAD (not yet implemented)'
  )
  .action(() => {
    console.error(pc.yellow('check: not yet implemented'));
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
