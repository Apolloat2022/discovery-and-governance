import type { ArtifactStatus, ArtifactType, FlagKind } from "../api/types";

const TYPE_LABEL: Record<ArtifactType, string> = {
  prompt: "Prompt",
  agent: "Agent",
  skill: "Skill",
  workflow: "Workflow",
};

export function TypeBadge({ type }: { type: ArtifactType }) {
  return <span className={`badge badge-type-${type}`}>{TYPE_LABEL[type]}</span>;
}

const STATUS_LABEL: Record<ArtifactStatus, string> = {
  active: "Active",
  flagged: "Flagged",
  archived: "Archived",
};

export function StatusPill({ status }: { status: ArtifactStatus }) {
  return (
    <span className={`pill pill-${status}`}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CertifiedBadge() {
  return <span className="badge badge-certified">★ Certified</span>;
}

const KIND_LABEL: Record<FlagKind, string> = {
  stale: "Stale",
  duplicate: "Duplicate",
  unreliable: "Unreliable",
};

export function FlagKindBadge({ kind }: { kind: FlagKind }) {
  return <span className={`badge kind-badge-${kind}`}>{KIND_LABEL[kind]}</span>;
}
