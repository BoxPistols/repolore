import type { Viewpoint } from '../ir/types.js';

export interface RendererOptions {
  maxBytes?: number;
  maxNodes?: number;
  maxEdges?: number;
}

export interface RenderedDiagram {
  source: string;
  truncated: boolean;
  format: 'mermaid' | 'svg' | 'dot' | 'wiki-md';
  stats: {
    nodeCount: number;
    edgeCount: number;
    byteSize: number;
  };
}

export interface Renderer {
  format: RenderedDiagram['format'];
  render(viewpoint: Viewpoint, options?: RendererOptions): RenderedDiagram;
}
