import type { Viewpoint } from '../ir/types.js';

export interface AnalyzerOptions {
  repoPath: string;
  exclude?: string[];
}

export interface Analyzer {
  id: string;
  analyze(options: AnalyzerOptions): Promise<Viewpoint>;
}
