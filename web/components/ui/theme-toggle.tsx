"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "yuho-theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readStoredTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const label = theme === "dark" ? "Light" : "Dark";
  const icon = theme === "dark" ? "☼" : "☾";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${label.toLowerCase()} mode`}
      aria-pressed={theme === "light"}
      className="theme-toggle"
      style={{
        position: "fixed",
        top: 84,
        right: 24,
        zIndex: 100,
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid var(--rule-strong)",
        color: "var(--type-muted)",
        fontFamily: "var(--f-mono)",
        fontSize: 14,
        lineHeight: 1,
        cursor: "none",
        opacity: mounted ? 1 : 0,
        transition: "opacity 200ms ease, color 200ms ease, border-color 200ms ease",
      }}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
