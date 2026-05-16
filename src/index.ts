export { architectureAnalyzer } from './analyzers/architecture.js';
export type { Analyzer, AnalyzerOptions } from './analyzers/types.js';
export {
  mermaidRenderer,
  MERMAID_DEFAULTS,
} from './renderers/mermaid.js';
export type {
  Renderer,
  RendererOptions,
  RenderedDiagram,
} from './renderers/types.js';
export {
  writeViewpointMarkdown,
  renderViewpointMarkdown,
  type InjectionMeta,
} from './inject/markdown.js';
export {
  injectIntoReadme,
  START_MARKER,
  END_MARKER,
  type InjectionBlock,
} from './inject/readme.js';
export type * from './ir/types.js';
