import type { ReactNode } from "react";

interface StateBlockProps {
  icon: string;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}

export function StateBlock({ icon, title, detail, action }: StateBlockProps) {
  return (
    <div className="state-block">
      <div className="state-icon">{icon}</div>
      <div className="state-title">{title}</div>
      {detail && <div className="state-detail">{detail}</div>}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex-col" style={{ padding: "var(--space-6)", alignItems: "center" }}>
      <div className="skeleton" style={{ width: "100%", maxWidth: 480, height: 14, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: "80%", maxWidth: 380, height: 14, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: "60%", maxWidth: 280, height: 14 }} />
      <span className="text-faint text-sm" style={{ marginTop: 12 }}>
        {label}
      </span>
    </div>
  );
}

export function ApiDownBlock({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateBlock
      icon="⚠️"
      title="Can't reach the Prism API"
      detail="The backend may not be running. Start it with npm run dev (or npm run dev -w server) and try again."
      action={
        onRetry && (
          <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
            Retry
          </button>
        )
      }
    />
  );
}
