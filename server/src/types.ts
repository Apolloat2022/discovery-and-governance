/**
 * Wire types for the Prism API. These mirror docs/API.md exactly — the frontend
 * transcribes the same shapes, so changes here are contract changes.
 */

export type ArtifactType = "prompt" | "agent" | "skill" | "workflow";
export type ArtifactStatus = "active" | "flagged" | "archived";
export type SecurityScope = "public" | "team" | "restricted";
export type Role = "admin" | "lead" | "member";

export const ARTIFACT_TYPES: ArtifactType[] = ["prompt", "agent", "skill", "workflow"];
export const SECURITY_SCOPES: SecurityScope[] = ["public", "team", "restricted"];

export interface User {
  id: string;
  name: string;
  role: Role;
  teamId: string;
  title: string;
}

export interface Team {
  id: string;
  name: string;
  objective: string;
}

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  description: string;
  content: string;
  inputs: string[];
  outputs: string[];
  tags: string[];
  ownerId: string;
  teamId: string;
  securityScope: SecurityScope;
  status: ArtifactStatus;
  certified: boolean;
  parentId: string | null;
  rootId: string;
  createdAt: string;
  updatedAt: string;
  trustScore: number;
  trust: {
    usageCount: number;
    avgRating: number | null;
    ratingCount: number;
    successRate: number | null;
    certified: boolean;
  };
  cost: {
    totalTokens: number;
    totalCostUsd: number;
    avgTokensPerRun: number;
  };
  lastExecutedAt: string | null;
}

export interface SearchResult {
  artifact: Artifact;
  score: number;
  breakdown: { semantic: number; graph: number; trust: number };
  reason: string;
}

export interface ExecutionEvent {
  id: string;
  artifactId: string;
  userId: string | null;
  success: boolean;
  latencyMs: number;
  tokens: number;
  costUsd: number;
  createdAt: string;
}

export interface LineageNode {
  artifact: Artifact;
  children: LineageNode[];
}

export type FlagKind = "stale" | "duplicate" | "unreliable";
export type FlagResolution = "archived" | "merged" | "dismissed";

export interface Flag {
  id: string;
  artifactId: string;
  artifact: Artifact;
  kind: FlagKind;
  detail: string;
  duplicateOfId: string | null;
  status: "open" | "resolved";
  createdAt: string;
  resolution: FlagResolution | null;
}

export interface GraphNode {
  id: string;
  kind: "user" | "team" | "artifact" | "task";
  label: string;
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "owns" | "memberOf" | "forkOf" | "executed" | "workingOn" | "relatesTo";
  weight: number;
}
