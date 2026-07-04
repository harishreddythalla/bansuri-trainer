"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, Gauge, Home, Moon, Music2, Radar, ScanLine, Sun } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tools = [
  { title: "Tanpura", description: "Continuous drone", icon: Music2 },
  { title: "Metronome", description: "Beat reference", icon: Gauge },
  { title: "Tanpura + Metronome", description: "Drone and pulse", icon: Radar },
  { title: "Flute Scale Detector", description: "Find the root key", icon: ScanLine },
  { title: "Proficiency Assessment", description: "Quick starting-point check", icon: BarChart3 },
];

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  };

  return (
    <header className="site-header">
      <div className="site-header__inner mx-auto flex w-full max-w-[1720px] items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="site-header__mark" />
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text)" }}>
              Bansuri Studio
            </div>
            <div className="text-[13px]" style={{ color: "var(--muted)" }}>Interactive flute learning</div>
          </div>
        </div>

        <nav className="flex items-center gap-2" aria-label="Primary">
          {isHome ? (
            <span
              className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm"
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-medium)",
                color: "var(--text)",
              }}
              aria-current="page"
            >
              <Home className="h-4 w-4" style={{ color: "var(--text)" }} />
              Home
            </span>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-full px-4"
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-medium)",
                color: "var(--text)",
              }}
            >
              <Link href="/">
                <Home className="h-4 w-4" style={{ color: "var(--text)" }} />
                Home
              </Link>
            </Button>
          )}

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full px-4"
            style={{
              border: "1px solid var(--line)",
              background: "var(--bg-medium)",
              color: "var(--text)",
            }}
          >
            <Link href="/trainer">Live Trainer</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-4"
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--bg-medium)",
                  color: "var(--text)",
                }}
              >
                Practice Tools
                <ChevronDown className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Practice Tools</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {tools.map((tool) => {
                const Icon = tool.icon;

                return (
                  <DropdownMenuItem key={tool.title} className="gap-3 px-3 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]" style={{ color: "var(--text)" }}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{tool.title}</span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{tool.description}</span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            onClick={toggleTheme}
            className="rounded-full flex items-center justify-center p-0 h-11 w-11"
            style={{
              border: "1px solid var(--line)",
              background: "var(--bg-medium)",
              color: "var(--text)",
            }}
            aria-label="Toggle theme"
          >
            {mounted && theme === "light" ? (
              <Moon className="h-4.5 w-4.5" style={{ color: "var(--text)" }} />
            ) : (
              <Sun className="h-4.5 w-4.5" style={{ color: "var(--text)" }} />
            )}
          </Button>
        </nav>
      </div>
    </header>
  );
}
