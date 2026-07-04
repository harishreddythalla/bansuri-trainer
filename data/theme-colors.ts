export const THEME = {
  // --- Pure Gray & Black Dark Theme Colors ---
  background: {
    dark: "#050506",      // Deepest black background
    medium: "#0a0a0c",    // Intermediate dark gray background
    light: "#101014",     // Lightest background shade
  },

  // Glass card backgrounds (Apple System Gray tones)
  card: {
    bg: "#1c1c1e",          // Apple System Gray 6 (System Base Card)
    border: "1px solid rgba(255, 255, 255, 0.03)",
  },
  cardStrong: {
    bg: "#2c2c2e",          // Apple Elevated Gray (System Gray 5)
    border: "1px solid rgba(255, 255, 255, 0.03)",
  },

  // Helper colors
  border: {
    subtle: "rgba(255, 255, 255, 0.03)",
    medium: "rgba(255, 255, 255, 0.05)",
    strong: "rgba(255, 255, 255, 0.08)",
    pill: "none",
  },

  text: {
    muted: "#86868b",       // Apple secondary label gray
    white: "#f5f5f7",       // Apple primary label off-white
    light: "#e8e8ed",       // Secondary text
    gray: "#86868b",        // Tertiary text
  },

  // --- Apple Accent Colors ---
  primary: {
    main: "#0a84ff",         // Apple System Blue (iOS Dark)
    glow: "rgba(10, 132, 255, 0.16)",
    light: "rgba(10, 132, 255, 0.06)",
    solid: "#0a84ff",
  },
  success: {
    main: "#30d158",         // Apple System Green
    glow: "rgba(48, 209, 88, 0.12)",
    light: "rgba(48, 209, 88, 0.04)",
    solid: "#30d158",
  },
  warning: {
    main: "#ffd60a",         // Apple System Yellow
    glow: "rgba(255, 214, 10, 0.12)",
    light: "rgba(255, 214, 10, 0.04)",
    solid: "#ffd60a",
  },
  danger: {
    main: "#ff453a",         // Apple System Red
    glow: "rgba(255, 69, 58, 0.14)",
    light: "rgba(255, 69, 58, 0.04)",
    solid: "#ff453a",
  },

  // --- Practice Map & Module List ---
  practiceMap: {
    // Current module details card
    moduleCurrent: {
      border: "none",
      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
      background: "#3a3a3c", // Apple elevated System Gray 4
    },
    moduleDefault: {
      border: "none",
      background: "#2c2c2e", // System Gray 5
    },
    // Checkpoint pill highlights
    pillCurrent: {
      bg: "rgba(10, 132, 255, 0.15)", // Subtle Apple blue tint
      border: "none",
      color: "#0a84ff",
      dot: "#0a84ff",
    },
    pillDone: {
      bg: "rgba(48, 209, 88, 0.12)", // Subtle Apple green tint
      border: "none",
      color: "#30d158",
      dot: "#30d158",
    },
    pillDefault: {
      bg: "#3a3a3c",
      border: "none",
      color: "#86868b",
      dot: "rgba(255, 255, 255, 0.2)",
    },
  },

  // --- Journey Ribbon / Progress Overview ---
  journey: {
    accent: {
      bg: "#3a3a3c",
      border: "1px solid rgba(10, 132, 255, 0.3)",
    },
    success: {
      bg: "#3a3a3c",
      border: "1px solid rgba(48, 209, 88, 0.3)",
    },
    muted: {
      bg: "#2c2c2e",
      border: "none",
    },
    barBg: "#2c2c2e",
    barFill: "#0a84ff", // Solid Apple blue progress fill
  },

  // --- Live Metrics ---
  metrics: {
    barBg: "#2c2c2e",
    noiseBar: "linear-gradient(90deg, #30d158, #ffd60a, #ff453a)", // Clean Apple success-warning-danger bar
    defaultBar: "#0a84ff",
    noiseFill: "#ff453a",
    defaultFill: "#30d158",
    barShadow: "0 0 10px rgba(48, 209, 88, 0.2)",
  },

  // --- Live Stats panels ---
  statsCard: {
    bg: "#2c2c2e",
    border: "none",
  },

  // --- Attempt Progress metrics ---
  attemptCard: {
    bg: "#2c2c2e",
    border: {
      success: "none",
      warning: "none",
      danger: "none",
      default: "none",
    },
    fill: {
      success: "#30d158",
      warning: "#0a84ff",
      danger: "#ff453a",
      default: "#3a3a3c",
    },
  },

  // --- Dynamic Note Group Visualizer ---
  noteGroup: {
    bg: "#1c1c1e",
    border: "none",
    topOverlay: "linear-gradient(180deg, #1c1c1e 0%, transparent 100%)",
    bottomOverlay: "linear-gradient(360deg, #1c1c1e 0%, transparent 100%)",
    activePill: {
      bg: "rgba(10, 132, 255, 0.15)",
      border: "none",
      text: "#0a84ff",
    },
    donePill: {
      bg: "rgba(48, 209, 88, 0.12)",
      border: "none",
      text: "#30d158",
    },
    defaultPill: {
      bg: "#2c2c2e",
      border: "none",
      text: "#86868b",
    },
  },

  // --- Mic & Controls Toolbar ---
  controls: {
    micActive: "rgba(48, 209, 88, 0.15)",
    micActiveBorder: "none",
    micActiveColor: "#30d158",
    micInactive: "#2c2c2e",
    micInactiveBorder: "none",
  },

  // --- Toasts & Alerts ---
  toast: {
    micToast: {
      border: "none",
      bg: "#2c2c2e",
    },
  },

  // --- Pitch Tracker Canvas ---
  pitch: {
    bg: "#1c1c1e",
    border: "none",
    trace: "#0a84ff",                          // Clean Apple Blue trace
    traceGlow: "rgba(10, 132, 255, 0.2)",
    targetZone: "rgba(48, 209, 88, 0.08)",     // Soft Green success target zone
    releaseZone: "rgba(255, 255, 255, 0.015)", // Extremely faint warning zone
    gridLine: "rgba(255, 255, 255, 0.04)",
    axisLabel: "#86868b",
    mutedLabel: "rgba(255, 255, 255, 0.22)",
  },

  // --- Flute Road lanes ---
  road: {
    active: {
      bg: "rgba(10, 132, 255, 0.08)",
      border: "none",
      line: "#0a84ff",
    },
    inactive: {
      bg: "rgba(255, 255, 255, 0.015)",
      border: "none",
      line: "rgba(255, 255, 255, 0.03)",
    },
    divider: {
      glow: "none",
      dashed: "rgba(10, 132, 255, 0.3)",
    },
  },
};
