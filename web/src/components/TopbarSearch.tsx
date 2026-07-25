import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export function TopbarSearch() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate(value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : "/");
  }

  return (
    <form onSubmit={onSubmit} className="topbar-search">
      <div className="search-input-wrap">
        <span className="search-input-icon">⌕</span>
        <input
          className="input"
          placeholder="Search capabilities — prompts, agents, skills, workflows…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </form>
  );
}
