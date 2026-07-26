import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { TopbarSearch } from "./TopbarSearch";
import { UserSwitcher } from "./UserSwitcher";

const NAV_ITEMS = [
  { to: "/", label: "Search", icon: "⌕", end: true },
  { to: "/registry", label: "Registry", icon: "▤", end: false },
  { to: "/analytics", label: "Analytics", icon: "▲", end: false },
  { to: "/governance", label: "Governance", icon: "◈", end: false },
  { to: "/recommendations", label: "Recommendations", icon: "✦", end: false },
];

export function Layout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          Prism
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: "auto" }} className="text-faint text-sm">
          AI capability discovery &amp; governance
        </div>
      </aside>

      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}

      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <TopbarSearch />
          <div className="topbar-spacer" />
          <UserSwitcher />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
