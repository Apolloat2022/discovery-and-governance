import { useEffect, useRef, useState } from "react";
import { useUser } from "../context/UserContext";
import { initials, titleCase } from "../lib/format";

export function UserSwitcher() {
  const { users, currentUser, selectUser } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (!currentUser) return null;

  return (
    <div className="user-switcher" ref={ref}>
      <button type="button" className="user-switcher-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="user-avatar">{initials(currentUser.name)}</span>
        <span className="flex-col" style={{ gap: 0, alignItems: "flex-start" }}>
          <span className="user-switcher-name">{currentUser.name}</span>
          <span className="user-switcher-role">
            {titleCase(currentUser.role)} · {currentUser.teamId.replace("team_", "")}
          </span>
        </span>
        <span className="text-faint" style={{ marginLeft: "auto" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="user-switcher-menu">
          <div className="text-faint text-sm" style={{ padding: "4px 10px 8px" }}>
            Switch user to demo RBAC
          </div>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className={`user-switcher-item ${user.id === currentUser.id ? "selected" : ""}`}
              onClick={() => {
                selectUser(user.id);
                setOpen(false);
              }}
            >
              <span className="user-avatar">{initials(user.name)}</span>
              <span className="user-switcher-item-meta">
                <div className="user-switcher-name">{user.name}</div>
                <div className="user-switcher-item-title">
                  {titleCase(user.role)} · {user.title}
                </div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
