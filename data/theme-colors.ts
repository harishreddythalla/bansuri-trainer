export const THEME = {
  // --- Pure Gray & Black Dark Theme Colors ---
  background: {
    dark: "#050506",      // Deepest black background
    medium: "#0a0a0c",    // Intermediate dark gray background
    light: "#101014",     // Lightest background shade
  },

  // Glass card backgrounds (charcoal gray glass)
  card: {
    bg: "rgba(10, 10, 12, 0.94)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },
  cardStrong: {
    bg: "rgba(6, 6, 8, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },

  // Helper colors
  border: {
    subtle: "rgba(255, 255, 255, 0.06)",
    medium: "rgba(255, 255, 255, 0.08)",
    strong: "rgba(255, 255, 255, 0.15)",
    pill: "rgba(255, 255, 255, 0.1)",
  },

  text: {
    muted: "var(--muted)",
    white: "rgba(255, 255, 255, 0.98)",
    light: "rgba(255, 255, 255, 0.85)",
    gray: "rgba(255, 255, 255, 0.72)",
  },

  // --- Unified Accent Colors ---
  primary: {
    main: "rgba(0, 224, 255, 1)",           // Bright cyan accent
    glow: "rgba(0, 224, 255, 0.28)",         // Primary glow
    light: "rgba(0, 224, 255, 0.08)",        // Very faint primary highlight
    solid: "#00e0ff",
  },
  success: {
    main: "rgba(46, 213, 115, 1)",          // Clean success green
    glow: "rgba(46, 213, 115, 0.18)",        // Success glow
    light: "rgba(46, 213, 115, 0.03)",       // Faint success highlight
    solid: "#2ed573",
  },
  warning: {
    main: "rgba(255, 189, 89, 1)",           // Amber warning yellow
    glow: "rgba(255, 189, 89, 0.18)",
    light: "rgba(255, 189, 89, 0.05)",
    solid: "#ffbd59",
  },
  danger: {
    main: "rgba(255, 71, 87, 1)",           // Danger red
    glow: "rgba(255, 71, 87, 0.22)",
    light: "rgba(255, 71, 87, 0.05)",
    solid: "#ff4757",
  },

  // --- Practice Map & Module List ---
  practiceMap: {
    // Current module details card
    moduleCurrent: {
      border: "1px solid rgba(0, 224, 255, 0.16)",
      boxShadow: "0 0 16px rgba(0, 224, 255, 0.08), inset 0 0 12px rgba(0, 224, 255, 0.04)",
      background: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
    },
    moduleDefault: {
      border: "1px solid rgba(255, 255, 255, 0.08)",
      background: "rgba(255, 255, 255, 0.02)",
    },
    // Checkpoint pill highlights
    pillCurrent: {
      bg: "rgba(0, 224, 255, 0.08)",
      border: "1px solid rgba(0, 224, 255, 0.35)",
      color: "rgba(255, 255, 255, 0.98)",
      dot: "rgba(0, 224, 255, 1)",
    },
    pillDone: {
      bg: "rgba(46, 213, 115, 0.03)",
      border: "1px solid rgba(46, 213, 115, 0.22)",
      color: "rgba(255, 255, 255, 0.82)",
      dot: "rgba(46, 213, 115, 1)",
    },
    pillDefault: {
      bg: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      color: "var(--muted)",
      dot: "rgba(255, 255, 255, 0.28)",
    },
  },

  // --- Journey Ribbon / Progress Overview ---
  journey: {
    accent: {
      bg: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
      border: "1px solid rgba(0, 224, 255, 0.28)",
    },
    success: {
      bg: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
      border: "1px solid rgba(46, 213, 115, 0.28)",
    },
    muted: {
      bg: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
    },
    barBg: "rgba(255, 255, 255, 0.08)",
    barFill: "linear-gradient(90deg, rgba(117, 184, 255, 0.95), rgba(103, 240, 202, 0.95))",
  },

  // --- Live Metrics ---
  metrics: {
    barBg: "rgba(255, 255, 255, 0.08)",
    noiseBar: "linear-gradient(90deg, rgba(103, 240, 202, 0.88), rgba(255, 189, 89, 0.72), rgba(255, 99, 99, 0.9))",
    defaultBar: "linear-gradient(90deg, rgba(117, 184, 255, 0.18), rgba(103, 240, 202, 0.9))",
    noiseFill: "rgba(255, 99, 99, 0.95)",
    defaultFill: "rgba(103, 240, 202, 0.95)",
    barShadow: "0 0 16px rgba(103, 240, 202, 0.28)",
  },

  // --- Live Stats panels ---
  statsCard: {
    bg: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },

  // --- Attempt Progress metrics ---
  attemptCard: {
    bg: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
    border: {
      success: "1px solid rgba(46, 213, 115, 0.28)",
      warning: "1px solid rgba(0, 224, 255, 0.28)",
      danger: "1px solid rgba(255, 71, 87, 0.28)",
      default: "1px solid rgba(255, 255, 255, 0.05)",
    },
    fill: {
      success: "rgba(46, 213, 115, 1)",
      warning: "rgba(0, 224, 255, 1)",
      danger: "rgba(255, 71, 87, 1)",
      default: "rgba(255, 255, 255, 0.15)",
    },
  },

  // --- Dynamic Note Group Visualizer ---
  noteGroup: {
    bg: "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(10, 10, 12, 0.4) 50%, rgba(255, 255, 255, 0.03) 100%)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    topOverlay: "linear-gradient(180deg, rgba(6, 6, 8, 0.85) 0%, transparent 100%)",
    bottomOverlay: "linear-gradient(360deg, rgba(6, 6, 8, 0.85) 0%, transparent 100%)",
    activePill: {
      bg: "rgba(0, 224, 255, 0.08)",
      border: "1px solid rgba(0, 224, 255, 0.4)",
      text: "rgba(219, 255, 247, 1)",
    },
    donePill: {
      bg: "rgba(46, 213, 115, 0.03)",
      border: "1px solid rgba(46, 213, 115, 0.18)",
      text: "rgba(46, 213, 115, 0.9)",
    },
    defaultPill: {
      bg: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      text: "rgba(255, 255, 255, 0.85)",
    },
  },

  // --- Mic & Controls Toolbar ---
  controls: {
    micActive: "linear-gradient(180deg, rgba(103,240,202,0.16), rgba(103,240,202,0.06))",
    micActiveBorder: "1px solid rgba(103,240,202,0.34)",
    micActiveColor: "rgba(219,255,247,0.98)",
    micInactive: "rgba(255,255,255,0.04)",
    micInactiveBorder: "1px solid rgba(255,255,255,0.08)",
  },

  // --- Toasts & Alerts ---
  toast: {
    micToast: {
      border: "1px solid rgba(255, 255, 255, 0.05)",
      bg: "linear-gradient(180deg, rgba(255,255,255,0.06), #0a0a0c)",
    },
  },

  // --- Pitch Tracker Canvas ---
  pitch: {
    bg: "rgba(6, 6, 8, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    trace: "rgba(117, 184, 255, 0.95)",        // Bright light blue trace
    traceGlow: "rgba(117, 184, 255, 0.8)",
    targetZone: "rgba(124, 173, 238, 0.15)",   // Selected target zone
    releaseZone: "rgba(117, 184, 255, 0.06)",  // Soft blue release zone
    gridLine: "rgba(255, 255, 255, 0.1)",
    axisLabel: "rgba(255, 255, 255, 0.76)",
    mutedLabel: "rgba(255, 255, 255, 0.42)",
  },

  // --- Flute Road lanes ---
  road: {
    active: {
      bg: "rgba(0, 224, 255, 0.12)",
      border: "rgba(0, 224, 255, 0.26)",
      line: "rgba(0, 224, 255, 0.32)",
    },
    inactive: {
      bg: "rgba(255, 255, 255, 0.03)",
      border: "rgba(255, 255, 255, 0.05)",
      line: "rgba(255, 255, 255, 0.06)",
    },
    divider: {
      glow: "rgba(0, 224, 255, 0.05)",
      dashed: "rgba(0, 224, 255, 0.28)",
    },
  },
};
