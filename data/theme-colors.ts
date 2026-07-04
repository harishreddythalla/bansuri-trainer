export const THEME = {
  background: {
    dark: "var(--bg-dark)",
    medium: "var(--bg-medium)",
    light: "var(--bg-light)",
  },

  card: {
    bg: "var(--card-bg)",
    border: "var(--card-border)",
  },
  cardStrong: {
    bg: "var(--card-strong-bg)",
    border: "var(--card-strong-border)",
  },

  border: {
    subtle: "var(--border-subtle)",
    medium: "var(--border-medium)",
    strong: "var(--border-strong)",
    pill: "var(--border-pill)",
  },

  text: {
    muted: "var(--text-muted)",
    white: "var(--text-white)",
    light: "var(--text-light)",
    gray: "var(--text-gray)",
  },

  primary: {
    main: "var(--primary-main)",
    glow: "var(--primary-glow)",
    light: "var(--primary-light)",
    solid: "var(--primary-solid)",
  },
  success: {
    main: "var(--success-main)",
    glow: "var(--success-glow)",
    light: "var(--success-light)",
    solid: "var(--success-solid)",
  },
  warning: {
    main: "var(--warning-main)",
    glow: "var(--warning-glow)",
    light: "var(--warning-light)",
    solid: "var(--warning-solid)",
  },
  danger: {
    main: "var(--danger-main)",
    glow: "var(--danger-glow)",
    light: "var(--danger-light)",
    solid: "var(--danger-solid)",
  },

  practiceMap: {
    moduleCurrent: {
      border: "var(--practice-current-border)",
      boxShadow: "var(--practice-current-shadow)",
      background: "var(--practice-current-bg)",
    },
    moduleDefault: {
      border: "var(--practice-default-border)",
      background: "var(--practice-default-bg)",
    },
    pillCurrent: {
      bg: "var(--practice-pill-current-bg)",
      border: "var(--practice-pill-current-border)",
      color: "var(--practice-pill-current-color)",
      dot: "var(--practice-pill-current-dot)",
    },
    pillDone: {
      bg: "var(--practice-pill-done-bg)",
      border: "var(--practice-pill-done-border)",
      color: "var(--practice-pill-done-color)",
      dot: "var(--practice-pill-done-dot)",
    },
    pillDefault: {
      bg: "var(--practice-pill-default-bg)",
      border: "var(--practice-pill-default-border)",
      color: "var(--practice-pill-default-color)",
      dot: "var(--practice-pill-default-dot)",
    },
  },

  journey: {
    accent: {
      bg: "var(--journey-accent-bg)",
      border: "var(--journey-accent-border)",
    },
    success: {
      bg: "var(--journey-success-bg)",
      border: "var(--journey-success-border)",
    },
    muted: {
      bg: "var(--journey-muted-bg)",
      border: "var(--journey-muted-border)",
    },
    barBg: "var(--journey-bar-bg)",
    barFill: "var(--journey-bar-fill)",
  },

  metrics: {
    barBg: "var(--metrics-bar-bg)",
    noiseBar: "var(--metrics-noise-bar)",
    defaultBar: "var(--metrics-default-bar)",
    noiseFill: "var(--metrics-noise-fill)",
    defaultFill: "var(--metrics-default-fill)",
    barShadow: "var(--metrics-bar-shadow)",
  },

  statsCard: {
    bg: "var(--stats-card-bg)",
    border: "var(--stats-card-border)",
  },

  attemptCard: {
    bg: "var(--attempt-card-bg)",
    border: {
      success: "var(--attempt-card-border-success)",
      warning: "var(--attempt-card-border-warning)",
      danger: "var(--attempt-card-border-danger)",
      default: "var(--attempt-card-border-default)",
    },
    fill: {
      success: "var(--attempt-card-fill-success)",
      warning: "var(--attempt-card-fill-warning)",
      danger: "var(--attempt-card-fill-danger)",
      default: "var(--attempt-card-fill-default)",
    },
  },

  noteGroup: {
    bg: "var(--notegroup-bg)",
    border: "var(--notegroup-border)",
    topOverlay: "var(--notegroup-top-overlay)",
    bottomOverlay: "var(--notegroup-bottom-overlay)",
    activePill: {
      bg: "var(--notegroup-active-bg)",
      border: "var(--notegroup-active-border)",
      text: "var(--notegroup-active-text)",
    },
    donePill: {
      bg: "var(--notegroup-done-bg)",
      border: "var(--notegroup-done-border)",
      text: "var(--notegroup-done-text)",
    },
    defaultPill: {
      bg: "var(--notegroup-default-bg)",
      border: "var(--notegroup-default-border)",
      text: "var(--notegroup-default-text)",
    },
  },

  controls: {
    micActive: "var(--controls-mic-active)",
    micActiveBorder: "var(--controls-mic-active-border)",
    micActiveColor: "var(--controls-mic-active-color)",
    micInactive: "var(--controls-mic-inactive)",
    micInactiveBorder: "var(--controls-mic-inactive-border)",
    btnBg: "var(--control-btn-bg)",
    btnBorder: "var(--control-btn-border)",
    btnColor: "var(--control-btn-color)",
    btnActiveBg: "var(--control-btn-active-bg)",
  },

  toast: {
    micToast: {
      border: "var(--toast-border)",
      bg: "var(--toast-bg)",
    },
  },

  pitch: {
    bg: "var(--pitch-bg)",
    border: "var(--pitch-border)",
    trace: "var(--pitch-trace)",
    traceGlow: "var(--pitch-trace-glow)",
    targetZone: "var(--pitch-target-zone)",
    releaseZone: "var(--pitch-release-zone)",
    gridLine: "var(--pitch-grid-line)",
    axisLabel: "var(--pitch-axis-label)",
    mutedLabel: "var(--pitch-muted-label)",
  },

  road: {
    active: {
      bg: "var(--road-active-bg)",
      border: "var(--road-active-border)",
      line: "var(--road-active-line)",
    },
    inactive: {
      bg: "var(--road-inactive-bg)",
      border: "var(--road-inactive-border)",
      line: "var(--road-inactive-line)",
    },
    divider: {
      glow: "var(--road-divider-glow)",
      dashed: "var(--road-divider-dashed)",
    },
  },
};
