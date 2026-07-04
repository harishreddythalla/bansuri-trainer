// --- Core Theme Variables ---
const BG_DARK = "#050506";      // Deepest black background
const BG_MEDIUM = "#0a0a0c";    // Intermediate dark gray background
const BG_LIGHT = "#101014";     // Lightest background shade

const CARD_BG = "rgba(10, 10, 12, 0.94)";
const CARD_STRONG_BG = "rgba(6, 6, 8, 0.95)";
const BORDER_DEFAULT = "1px solid rgba(255, 255, 255, 0.05)";

// Accents
const ACCENT_PRIMARY = "rgba(0, 224, 255, 1)";
const ACCENT_SUCCESS = "rgba(46, 213, 115, 1)";
const ACCENT_WARNING = "rgba(255, 189, 89, 1)";
const ACCENT_DANGER = "rgba(255, 71, 87, 1)";

// Reusable shade values
const SHADE_TINY = "rgba(255, 255, 255, 0.02)";
const SHADE_SOFT = "rgba(255, 255, 255, 0.03)";
const SHADE_MEDIUM = "rgba(255, 255, 255, 0.06)";
const SHADE_HIGH = "rgba(255, 255, 255, 0.08)";
const SHADE_GLOW_BG = "rgba(255, 255, 255, 0.06)";

export const THEME = {
  background: {
    dark: BG_DARK,
    medium: BG_MEDIUM,
    light: BG_LIGHT,
  },

  card: {
    bg: CARD_BG,
    border: BORDER_DEFAULT,
  },
  cardStrong: {
    bg: CARD_STRONG_BG,
    border: BORDER_DEFAULT,
  },

  border: {
    subtle: SHADE_MEDIUM,
    medium: SHADE_HIGH,
    strong: "rgba(255, 255, 255, 0.15)",
    pill: "rgba(255, 255, 255, 0.1)",
  },

  text: {
    muted: "var(--muted)",
    white: "rgba(255, 255, 255, 0.98)",
    light: "rgba(255, 255, 255, 0.85)",
    gray: "rgba(255, 255, 255, 0.72)",
  },

  primary: {
    main: ACCENT_PRIMARY,
    glow: "rgba(0, 224, 255, 0.28)",
    light: "rgba(0, 224, 255, 0.08)",
    solid: "#00e0ff",
  },
  success: {
    main: ACCENT_SUCCESS,
    glow: "rgba(46, 213, 115, 0.18)",
    light: "rgba(46, 213, 115, 0.03)",
    solid: "#2ed573",
  },
  warning: {
    main: ACCENT_WARNING,
    glow: "rgba(255, 189, 89, 0.18)",
    light: "rgba(255, 189, 89, 0.05)",
    solid: "#ffbd59",
  },
  danger: {
    main: ACCENT_DANGER,
    glow: "rgba(255, 71, 87, 0.22)",
    light: "rgba(255, 71, 87, 0.05)",
    solid: "#ff4757",
  },

  practiceMap: {
    moduleCurrent: {
      border: "1px solid rgba(0, 224, 255, 0.16)",
      boxShadow: "0 0 16px rgba(0, 224, 255, 0.08), inset 0 0 12px rgba(0, 224, 255, 0.04)",
      background: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${SHADE_TINY})`,
    },
    moduleDefault: {
      border: `1px solid ${SHADE_HIGH}`,
      background: SHADE_TINY,
    },
    pillCurrent: {
      bg: "rgba(0, 224, 255, 0.08)",
      border: "1px solid rgba(0, 224, 255, 0.35)",
      color: "rgba(255, 255, 255, 0.98)",
      dot: ACCENT_PRIMARY,
    },
    pillDone: {
      bg: "rgba(46, 213, 115, 0.03)",
      border: "1px solid rgba(46, 213, 115, 0.22)",
      color: "rgba(255, 255, 255, 0.82)",
      dot: ACCENT_SUCCESS,
    },
    pillDefault: {
      bg: SHADE_TINY,
      border: `1px solid rgba(255, 255, 255, 0.05)`,
      color: "var(--muted)",
      dot: "rgba(255, 255, 255, 0.28)",
    },
  },

  journey: {
    accent: {
      bg: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${SHADE_TINY})`,
      border: "1px solid rgba(0, 224, 255, 0.28)",
    },
    success: {
      bg: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${SHADE_TINY})`,
      border: "1px solid rgba(46, 213, 115, 0.28)",
    },
    muted: {
      bg: SHADE_SOFT,
      border: `1px solid ${SHADE_HIGH}`,
    },
    barBg: SHADE_HIGH,
    barFill: "linear-gradient(90deg, rgba(117, 184, 255, 0.95), rgba(103, 240, 202, 0.95))",
  },

  metrics: {
    barBg: SHADE_HIGH,
    noiseBar: "linear-gradient(90deg, rgba(103, 240, 202, 0.88), rgba(255, 189, 89, 0.72), rgba(255, 99, 99, 0.9))",
    defaultBar: "linear-gradient(90deg, rgba(117, 184, 255, 0.18), rgba(103, 240, 202, 0.9))",
    noiseFill: "rgba(255, 99, 99, 0.95)",
    defaultFill: "rgba(103, 240, 202, 0.95)",
    barShadow: "0 0 16px rgba(103, 240, 202, 0.28)",
  },

  statsCard: {
    bg: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${SHADE_TINY})`,
    border: `1px solid ${SHADE_HIGH}`,
  },

  attemptCard: {
    bg: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${SHADE_TINY})`,
    border: {
      success: "1px solid rgba(46, 213, 115, 0.28)",
      warning: "1px solid rgba(0, 224, 255, 0.28)",
      danger: "1px solid rgba(255, 71, 87, 0.28)",
      default: "1px solid rgba(255, 255, 255, 0.05)",
    },
    fill: {
      success: ACCENT_SUCCESS,
      warning: ACCENT_PRIMARY,
      danger: ACCENT_DANGER,
      default: "rgba(255, 255, 255, 0.15)",
    },
  },

  noteGroup: {
    bg: `linear-gradient(180deg, ${SHADE_SOFT} 0%, rgba(10, 10, 12, 0.4) 50%, ${SHADE_SOFT} 100%)`,
    border: "1px solid rgba(255, 255, 255, 0.06)",
    topOverlay: `linear-gradient(180deg, rgba(6, 6, 8, 0.85) 0%, transparent 100%)`,
    bottomOverlay: `linear-gradient(360deg, rgba(6, 6, 8, 0.85) 0%, transparent 100%)`,
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
      bg: SHADE_TINY,
      border: "1px solid rgba(255, 255, 255, 0.06)",
      text: "rgba(255, 255, 255, 0.85)",
    },
  },

  controls: {
    micActive: "linear-gradient(180deg, rgba(103,240,202,0.16), rgba(103,240,202,0.06))",
    micActiveBorder: "1px solid rgba(103,240,202,0.34)",
    micActiveColor: "rgba(219,255,247,0.98)",
    micInactive: "rgba(255,255,255,0.04)",
    micInactiveBorder: "1px solid rgba(255,255,255,0.08)",
  },

  toast: {
    micToast: {
      border: BORDER_DEFAULT,
      bg: `linear-gradient(180deg, ${SHADE_GLOW_BG}, ${BG_MEDIUM})`,
    },
  },

  pitch: {
    bg: CARD_STRONG_BG,
    border: BORDER_DEFAULT,
    trace: "rgba(117, 184, 255, 0.95)",
    traceGlow: "rgba(117, 184, 255, 0.8)",
    targetZone: "rgba(124, 173, 238, 0.15)",
    releaseZone: "rgba(117, 184, 255, 0.06)",
    gridLine: "rgba(255, 255, 255, 0.1)",
    axisLabel: "rgba(255, 255, 255, 0.76)",
    mutedLabel: "rgba(255, 255, 255, 0.42)",
  },

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
