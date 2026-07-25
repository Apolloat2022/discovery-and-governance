/**
 * Wire types transcribed from docs/API.md. Keep these in sync with the
 * contract — this file has no authority of its own.
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

export interface SearchResponse {
  results: SearchResult[];
  tookMs: number;
}

export interface ArtifactDetailResponse {
  artifact: Artifact;
  owner: User;
  team: Team;
  related: Artifact[];
}

export interface SimilarArtifact {
  artifact: Artifact;
  similarity: number;
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

export interface TelemetryDay {
  date: string;
  executions: number;
  successes: number;
  tokens: number;
}

export interface Recommendation {
  artifact: Artifact;
  reason: string;
}

export interface AnalyticsOverview {
  totals: {
    artifacts: number;
    active: number;
    flagged: number;
    archived: number;
    executions30d: number;
    costUsd30d: number;
  };
  topByUsage: Artifact[];
  abandoned: Artifact[];
  costByArtifact: Array<{ artifact: Artifact; costUsd30d: number; tokens30d: number }>;
}

export type FlagKind = "stale" | "duplicate" | "unreliable";
export type FlagResolution = "archived" | "merged" | "dismissed";
export type FlagAction = "archive" | "merge" | "dismiss";

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

export interface ApiErrorBody {
  error: { code: string; message: string };
  similar?: SimilarArtifact[];
}
