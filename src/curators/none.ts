import type { Curator } from './types.js';

export const noneCurator: Curator = {
  id: 'none',
  isRemote: false,
  async curate(viewpoint) {
    return { viewpoint };
  },
};
