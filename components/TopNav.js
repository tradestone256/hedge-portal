import { useState, useEffect } from "react";

export function TopNav({ userName, onSignOut }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = localStorage.getItem("ts-theme") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ts-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const initials = (userName || "U").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="nav">
      <div className="nav-brand">
        <div className="logo-box">
          <svg viewBox="0 0 100 100" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" fill="none" stroke="#7c3aed" strokeWidth="4"/>
            <path d="M 35 40 L 50 30 L 65 40 M 50 30 L 50 65" stroke="#7c3aed" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="brand-name">Trade<span className="accent">stone</span><span className="brand-suffix">Portal</span></div>
      </div>
      <div className="nav-right">
        {userName && (
          <div className="user-pill">
            <div className="avatar-circle">{initials}</div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{userName}</span>
          </div>
        )}
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? "☀" : "🌙"}
        </button>
        <button className="btn-signout" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export function greetingFor(name) {
  const h = new Date().getHours();
  const t = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = (name || "").split(" ")[0] || "there";
  return { hello: t, name: first };
}

export function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
