"use client";

import Image from "next/image";
import fluteIllustration from "@/assets/flute.svg";

function WaveGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12c2-5 3-5 5 0s3 5 5 0 3-5 6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TargetGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function ScreenGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="5.5" width="15" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 19.5h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 15.5v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ScoreGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 17l4-4 3 3 7-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UnlockGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 10V8a4 4 0 0 1 7.7-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="6" y="10" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 13.5v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DroneGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h2l2-4 4 8 2-4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function ScaleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="17" r="2" fill="currentColor" />
      <circle cx="12" cy="17" r="2" fill="currentColor" />
      <circle cx="17" cy="17" r="2" fill="currentColor" />
      <path d="M7 7h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AssessmentGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 17V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 17v-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function HomePage() {
  const assuranceItems = [
    {
      icon: WaveGlyph,
      title: "Real-time acoustic feedback",
      description: "Detects pitch, octave, stability & timing.",
    },
    {
      icon: TargetGlyph,
      title: "Foundation-gated progression",
      description: "Advances only when played alankar is clean.",
    },
    {
      icon: ScreenGlyph,
      title: "Browser-based tutor",
      description: "No install, no extra setup, just practice!",
    },
  ];
  const loopSteps = [
    {
      icon: TargetGlyph,
      label: "Target",
      title: "Trainer sets the phrase",
      description: "A focused swara pattern appears, such as S-R-G.",
    },
    {
      icon: WaveGlyph,
      label: "Mic",
      title: "You play live",
      description: "The browser captures your flute audio in real time.",
    },
    {
      icon: ScreenGlyph,
      label: "Classify",
      title: "Swara is detected",
      description: "Pitch is mapped to swara and octave instantly.",
    },
    {
      icon: ScoreGlyph,
      label: "Score",
      title: "Attempt is scored",
      description: "Pitch, sustain, stability, and noise are evaluated together.",
    },
    {
      icon: UnlockGlyph,
      label: "Unlock",
      title: "Next drill opens",
      description: "Clear the threshold to progress, or retry with correction.",
    },
  ];
  const utilityCards = [
    {
      icon: DroneGlyph,
      title: "Tanpura + Metronome",
      description: "One-click drone and pulse for free play.",
    },
    {
      icon: ScaleGlyph,
      title: "Flute Scale Detector",
    },
    {
      icon: AssessmentGlyph,
      title: "Proficiency Assessment",
      description: "A quick check to find the right starting milestone.",
    },
  ];

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero__surface glass">
          <div className="home-hero__content">
            <h1 className="home-hero__title">
              One-Stop Interactive Tutor for Flute Mastery.
            </h1>
            <p className="home-hero__subtitle">
              A browser-based tutor that listens as you play, measures pitch and stability in real
              time, and unlocks harder alankars only when your foundation is ready.
            </p>
            <div className="home-hero__flute-art">
              <Image
                src={fluteIllustration}
                alt="Bansuri illustration"
                className="home-hero__flute-image"
                priority
              />
            </div>
          </div>

          <aside className="home-hero__panel" aria-label="Learning ecosystem summary">
            <div className="home-hero__panel-label">Why this feels different</div>
            <div className="home-hero__panel-grid">
              {assuranceItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="home-hero__panel-item" key={item.title}>
                    <span className="home-hero__panel-icon">
                      <Icon />
                    </span>
                    <div className="home-hero__panel-copy">
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="home-loop" aria-labelledby="software-loop-title">
            <div className="home-loop__header">
              <div>
                <div className="home-loop__label">5-stage software loop</div>
                <h2 id="software-loop-title">How the app replaces passive lessons</h2>
              </div>
              <a className="button button-primary home-loop__cta" href="/trainer">
                Begin Learning <span aria-hidden="true">›</span>
              </a>
            </div>
            <div className="home-loop__rail" aria-label="Interactive learning loop">
              {loopSteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <article className="home-loop__step" key={step.title}>
                    <div className="home-loop__step-top">
                      <span className="home-loop__number">{index + 1}</span>
                      <span className="home-loop__step-icon">
                        <Icon />
                      </span>
                    </div>
                    <span className="home-loop__step-label">{step.label}</span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
      <section className="home-utilities" aria-labelledby="utility-matrix-title">
        <div className="home-utilities__header">
          <div>
            <h2 id="utility-matrix-title">Tools</h2>
            <p>Start without a lesson plan</p>
          </div>
        </div>
        <div className="home-utilities__grid">
          {utilityCards.map((card) => {
            const Icon = card.icon;

            return (
              <article className="home-utilities__card" key={card.title}>
                <span className="home-utilities__icon">
                  <Icon />
                </span>
                <div className="home-utilities__copy">
                  <h3>{card.title}</h3>
                  {card.description ? <p>{card.description}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
