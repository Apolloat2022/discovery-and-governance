import type {
  AnalyticsOverview,
  Artifact,
  ArtifactDetailResponse,
  ArtifactStatus,
  ArtifactType,
  ExecutionEvent,
  Flag,
  FlagAction,
  LineageNode,
  Recommendation,
  SearchResponse,
  SecurityScope,
  SimilarArtifact,
  TelemetryDay,
  Team,
  User,
} from "./types";

const CURRENT_USER_KEY = "prism.currentUserId";

export function getCurrentUserId(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(userId: string | null): void {
  if (userId) localStorage.setItem(CURRENT_USER_KEY, userId);
  else localStorage.removeItem(CURRENT_USER_KEY);
}

/** Raised for any non-2xx response. Carries the parsed error envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly similar?: SimilarArtifact[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Raised when fetch itself fails — the API is unreachable, not just erroring. */
export class ApiUnreachableError extends Error {
  constructor() {
    super("Could not reach the Prism API. Is the server running?");
    this.name = "ApiUnreachableError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  const userId = getCurrentUserId();
  if (userId) headers["X-User-Id"] = userId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = payload?.error?.code ?? "UNKNOWN";
    const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message, payload?.similar);
  }

  return payload as T;
}

export interface CreateArtifactInput {
  name: string;
  type: ArtifactType;
  description: string;
  content: string;
  inputs?: string[];
  outputs?: string[];
  tags?: string[];
  securityScope?: SecurityScope;
  force?: boolean;
}

export const api = {
  // ---- identity -----------------------------------------------------------
  getUsers: () => request<User[]>("GET", "/api/users"),
  getMe: () => request<{ user: User | null; team: Team | null }>("GET", "/api/me"),

  // ---- find -----------------------------------------------------------------
  search: (params: {
    q?: string;
    type?: ArtifactType;
    minTrust?: number;
    certifiedOnly?: boolean;
    sort?: "relevance" | "trust" | "recent" | "usage";
    limit?: number;
  }) => request<SearchResponse>("GET", "/api/search", { query: params }),

  getRecommendations: () => request<{ recommendations: Recommendation[] }>("GET", "/api/recommendations"),

  // ---- registry ---------------------------------------------------------
  getArtifacts: (params: { type?: ArtifactType; status?: ArtifactStatus; teamId?: string; ownerId?: string } = {}) =>
    request<Artifact[]>("GET", "/api/artifacts", { query: params }),

  getArtifact: (id: string) => request<ArtifactDetailResponse>("GET", `/api/artifacts/${id}`),

  createArtifact: (input: CreateArtifactInput) => request<Artifact>("POST", "/api/artifacts", { body: input }),

  updateArtifact: (id: string, patch: Partial<Artifact>) =>
    request<Artifact>("PATCH", `/api/artifacts/${id}`, { body: patch }),

  forkArtifact: (id: string, options: { name?: string; teamId?: string } = {}) =>
    request<Artifact>("POST", `/api/artifacts/${id}/fork`, { body: options }),

  rateArtifact: (id: string, rating: number) =>
    request<{ artifact: Artifact }>("POST", `/api/artifacts/${id}/rate`, { body: { rating } }),

  executeArtifact: (id: string) =>
    request<{ event: ExecutionEvent; artifact: Artifact }>("POST", `/api/artifacts/${id}/execute`, { body: {} }),

  getLineage: (id: string) => request<{ tree: LineageNode }>("GET", `/api/artifacts/${id}/lineage`),

  getTelemetry: (id: string, days = 90) =>
    request<{ daily: TelemetryDay[] }>("GET", `/api/artifacts/${id}/telemetry`, { query: { days } }),

  // ---- prune --------------------------------------------------------------
  getAnalyticsOverview: () => request<AnalyticsOverview>("GET", "/api/analytics/overview"),

  getFlags: (status: "open" | "resolved" | "all" = "open") =>
    request<{ flags: Flag[] }>("GET", "/api/governance/flags", { query: { status } }),

  runGovernanceScan: () => request<{ created: number; flags: Flag[] }>("POST", "/api/governance/scan", { body: {} }),

  resolveFlag: (id: string, action: FlagAction) =>
    request<{ flag: Flag }>("POST", `/api/governance/flags/${id}/resolve`, { body: { action } }),
};
