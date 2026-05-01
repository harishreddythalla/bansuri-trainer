import Link from "next/link";

export function Header() {
  return (
    <header className="shell" style={{ paddingTop: 20 }}>
      <div
        className="glass"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: 16,
          borderRadius: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 16,
              background: "linear-gradient(135deg, #d6ebff 0%, #86bfff 55%, #67f0ca 100%)",
            }}
          />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: "-0.03em" }}>Bansuri Studio</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Interactive flute learning</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="pill" href="/">
            Home
          </Link>
          <Link className="pill" href="/trainer">
            Live Trainer
          </Link>
        </nav>
      </div>
    </header>
  );
}
