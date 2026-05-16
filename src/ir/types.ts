export interface RepoIR {
  source: SourceInfo;
  viewpoints: Viewpoint[];
}

export interface SourceInfo {
  path: string;
  commit: string | null;
  generatedAt: string;
  toolVersion: string;
}

export type ViewpointId =
  | 'architecture'
  | 'architecture-history'
  | 'deps'
  | 'git-history'
  | 'module-relations'
  | 'api-surface'
  | 'python';

export interface Viewpoint {
  id: ViewpointId;
  title: string;
  description?: string;
  graph: Graph;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
  groups?: Group[];
}

export type NodeKind =
  | 'module'
  | 'file'
  | 'package'
  | 'function'
  | 'class'
  | 'commit'
  | 'author'
  | 'group';

export interface Node {
  id: string;
  label: string;
  kind: NodeKind;
  centrality?: number;
  meta?: Record<string, unknown>;
}

export type EdgeKind =
  | 'imports'
  | 'depends-on'
  | 'calls'
  | 'contains'
  | 'authored'
  | 'modified';

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface Group {
  id: string;
  label: string;
  nodeIds: string[];
}
