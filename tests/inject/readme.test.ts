import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  injectIntoReadme,
  START_MARKER,
  END_MARKER,
} from '../../src/inject/readme.js';
import type { Viewpoint } from '../../src/ir/types.js';
import type { RenderedDiagram } from '../../src/renderers/types.js';

const sampleViewpoint: Viewpoint = {
  id: 'architecture',
  title: 'Architecture',
  description: 'Test description.',
  graph: { nodes: [], edges: [] },
};

const sampleDiagram: RenderedDiagram = {
  source: 'flowchart LR\n    a --> b',
  truncated: false,
  format: 'mermaid',
  stats: { nodeCount: 2, edgeCount: 1, byteSize: 24 },
};

const blocks = [{ viewpoint: sampleViewpoint, rendered: sampleDiagram }];

let tmpFile: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repolore-test-'));
  tmpFile = path.join(dir, 'README.md');
});

afterEach(async () => {
  await fs.rm(path.dirname(tmpFile), { recursive: true, force: true });
});

describe('injectIntoReadme', () => {
  it('creates a new file with markers when target does not exist', async () => {
    await injectIntoReadme(tmpFile, blocks);
    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toContain(START_MARKER);
    expect(content).toContain(END_MARKER);
    expect(content).toContain('flowchart LR');
  });

  it('replaces content between existing markers', async () => {
    const initial = `# Title\n\nIntro\n\n${START_MARKER}\nOLD CONTENT\n${END_MARKER}\n\nOutro\n`;
    await fs.writeFile(tmpFile, initial, 'utf-8');
    await injectIntoReadme(tmpFile, blocks);
    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toContain('# Title');
    expect(content).toContain('Intro');
    expect(content).toContain('Outro');
    expect(content).not.toContain('OLD CONTENT');
    expect(content).toContain('flowchart LR');
  });

  it('ignores markers inside fenced code blocks', async () => {
    const initial = [
      '# Title',
      '',
      'Example syntax:',
      '',
      '```markdown',
      START_MARKER, // inside fence — must be ignored
      END_MARKER,   // inside fence — must be ignored
      '```',
      '',
      '## Real target',
      '',
      START_MARKER, // outside fence — must be the injection target
      'OLD CONTENT',
      END_MARKER,
      '',
      'Outro',
      '',
    ].join('\n');
    await fs.writeFile(tmpFile, initial, 'utf-8');
    await injectIntoReadme(tmpFile, blocks);
    const content = await fs.readFile(tmpFile, 'utf-8');

    // Docs example must still contain plain markers, untouched
    const fenceMatch = content.match(/```markdown\n([\s\S]*?)\n```/);
    expect(fenceMatch).not.toBeNull();
    expect(fenceMatch![1]).toBe(`${START_MARKER}\n${END_MARKER}`);

    // OLD CONTENT must be replaced by the real injection
    expect(content).not.toContain('OLD CONTENT');
    expect(content).toContain('flowchart LR');
  });

  it('appends a new marker block when no markers are present outside fences', async () => {
    const initial = '# Title\n\nIntro\n';
    await fs.writeFile(tmpFile, initial, 'utf-8');
    await injectIntoReadme(tmpFile, blocks);
    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content.startsWith('# Title')).toBe(true);
    expect(content).toContain(START_MARKER);
    expect(content).toContain(END_MARKER);
  });

  it('is idempotent on repeat calls', async () => {
    await injectIntoReadme(tmpFile, blocks);
    const first = await fs.readFile(tmpFile, 'utf-8');
    await injectIntoReadme(tmpFile, blocks);
    const second = await fs.readFile(tmpFile, 'utf-8');
    expect(second).toBe(first);
  });

  it('embeds commit SHA when provided in meta', async () => {
    await injectIntoReadme(tmpFile, blocks, {
      commit: 'abc123',
      toolVersion: '0.1.0',
    });
    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toContain('abc123');
    expect(content).toContain('0.1.0');
  });
});
