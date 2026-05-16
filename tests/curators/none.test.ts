import { describe, expect, it } from 'vitest';
import { noneCurator } from '../../src/curators/none.js';
import type { Viewpoint } from '../../src/ir/types.js';

const sample: Viewpoint = {
  id: 'architecture',
  title: 't',
  graph: {
    nodes: [{ id: 'x', label: 'x', kind: 'module' }],
    edges: [],
  },
};

describe('noneCurator', () => {
  it('is non-remote', () => {
    expect(noneCurator.isRemote).toBe(false);
  });

  it('passes through the viewpoint unchanged', async () => {
    const result = await noneCurator.curate(sample);
    expect(result.viewpoint).toBe(sample);
    expect(result.usage).toBeUndefined();
  });
});
