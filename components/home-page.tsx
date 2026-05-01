import Link from "next/link";
import { dailyPlan, learningTracks } from "@/data/course";
import { FluteFinder } from "@/components/flute-finder";

export function HomePage() {
  return (
    <main style={{ paddingBottom: 60 }}>
      <section className="shell" style={{ paddingTop: 28 }}>
        <div
          className="glass"
          style={{
            padding: "32px clamp(22px, 4vw, 42px)",
            borderRadius: 36,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div className="pill">Web-first PWA · Hindustani + Carnatic · Mic-guided learning</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(300px, 0.8fr)",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div>
              <h1 className="section-title">A two-way bansuri teacher that listens back.</h1>
              <p className="section-copy" style={{ maxWidth: 660 }}>
                Learn from your first clean note to advanced raga work with guided practice,
                live swara detection, octave feedback, mastery-based progression, and a calm
                premium interface built for daily riyaz.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <Link className="button button-primary" href="/trainer">
                  Start live swara training
                </Link>
                <a className="button button-secondary" href="#roadmap">
                  View learning map
                </a>
              </div>
            </div>
            <div
              className="glass"
              style={{
                borderRadius: 28,
                padding: 22,
                background: "var(--card-strong)",
                display: "grid",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 14, color: "var(--muted)" }}>Today&apos;s practice</div>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.04em" }}>18 min</div>
              <div className="grid">
                {dailyPlan.map((item) => (
                  <div
                    key={item.title}
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{item.title}</strong>
                      <span style={{ color: "var(--warn)", fontSize: 14 }}>{item.duration}</span>
                    </div>
                    <div style={{ color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingTop: 28 }}>
        <FluteFinder />
      </section>

      <section className="shell" id="roadmap" style={{ paddingTop: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "end",
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div>
            <div className="pill">Learning architecture</div>
            <h2 className="section-title" style={{ fontSize: "clamp(24px, 4vw, 42px)", marginTop: 14 }}>
              One app, complete bansuri journey
            </h2>
          </div>
          <p className="section-copy" style={{ maxWidth: 520, margin: 0 }}>
            The core flow stays interactive: the app demonstrates, you play, the engine scores,
            and mastery unlocks the next lesson.
          </p>
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          {learningTracks.map((track) => (
            <article
              key={track.title}
              className="glass"
              style={{
                borderRadius: 28,
                padding: 22,
                minHeight: 250,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <strong style={{ fontSize: 20 }}>{track.title}</strong>
                <span className="pill">{track.progress}</span>
              </div>
              <p className="section-copy" style={{ fontSize: 15, marginTop: 10 }}>
                {track.subtitle}
              </p>
              <div className="grid" style={{ marginTop: 14 }}>
                {track.lessons.map((lesson) => (
                  <div
                    key={lesson}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "var(--muted)",
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: "linear-gradient(135deg, var(--accent), var(--success))",
                      }}
                    />
                    {lesson}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell" style={{ paddingTop: 28 }}>
        <div
          className="glass"
          style={{
            borderRadius: 32,
            padding: 26,
            display: "grid",
            gap: 18,
          }}
        >
          <div className="pill">MVP now</div>
          <h2 className="section-title" style={{ fontSize: "clamp(24px, 4vw, 38px)", margin: 0 }}>
            Live swara trainer
          </h2>
          <p className="section-copy" style={{ maxWidth: 720, margin: 0 }}>
            This first build focuses on the most important loop: detect a played note through the
            mic, map it to Sa/Re/Ga/Ma/Pa/Da/Ni, classify octave, score sustain and stability,
            then coach the learner forward.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button button-primary" href="/trainer">
              Open trainer
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
