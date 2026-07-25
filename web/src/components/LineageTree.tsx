import { useNavigate } from "react-router-dom";
import type { LineageNode } from "../api/types";
import { TypeBadge } from "./Badges";
import { TrustMeter } from "./TrustMeter";

function LineageNodeView({ node, currentId }: { node: LineageNode; currentId: string }) {
  const navigate = useNavigate();
  const isCurrent = node.artifact.id === currentId;

  return (
    <li className="lineage-item">
      <button
        type="button"
        className={`lineage-node ${isCurrent ? "current" : ""}`}
        onClick={() => !isCurrent && navigate(`/artifacts/${node.artifact.id}`)}
        disabled={isCurrent}
      >
        <TypeBadge type={node.artifact.type} />
        <span className="lineage-node-name">{node.artifact.name}</span>
        <TrustMeter score={node.artifact.trustScore} compact />
      </button>
      {node.children.length > 0 && (
        <ul className="lineage-children">
          {node.children.map((child) => (
            <LineageNodeView key={child.artifact.id} node={child} currentId={currentId} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LineageTree({ tree, currentId }: { tree: LineageNode; currentId: string }) {
  return (
    <ul className="lineage-tree">
      <LineageNodeView node={tree} currentId={currentId} />
    </ul>
  );
}
