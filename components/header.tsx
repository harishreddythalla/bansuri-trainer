"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsToolsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div className="site-header__mark" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, letterSpacing: "-0.03em" }}>Bansuri Studio</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Interactive flute learning</div>
          </div>
        </div>
        <nav className="site-header__nav" aria-label="Primary">
          {isHome ? (
            <span className="pill" aria-current="page">
              Home
            </span>
          ) : (
            <Link className="pill" href="/">
              Home
            </Link>
          )}
          <Link className="pill" href="/trainer">
            Live Trainer
          </Link>
          <details
            ref={menuRef}
            className="site-header__menu"
            open={isToolsOpen}
            onToggle={(event) => setIsToolsOpen(event.currentTarget.open)}
          >
            <summary
              className="pill site-header__menu-trigger"
              onClick={(event) => {
                event.preventDefault();
                setIsToolsOpen((value) => !value);
              }}
            >
              <span>Practice Tools</span>
              <span className="site-header__menu-chevron" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="site-header__menu-panel" role="menu" aria-label="Practice tools">
              <div className="site-header__menu-label">Practice Tools</div>
              <button className="site-header__menu-item" type="button">
                <span>Tanpura</span>
                <span className="site-header__menu-hint">Drone</span>
              </button>
              <button className="site-header__menu-item" type="button">
                <span>Metronome</span>
                <span className="site-header__menu-hint">Beat guide</span>
              </button>
              <button className="site-header__menu-item" type="button">
                <span>Tanpura + Metronome</span>
                <span className="site-header__menu-hint">Drone and pulse</span>
              </button>
              <button className="site-header__menu-item" type="button">
                <span>Flute Scale Detector</span>
                <span className="site-header__menu-hint">Find your Sa</span>
              </button>
              <button className="site-header__menu-item" type="button">
                <span>Flute Profile Detector</span>
                <span className="site-header__menu-hint">Check flute setup</span>
              </button>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
