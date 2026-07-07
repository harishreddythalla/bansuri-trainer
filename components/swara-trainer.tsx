"use client";

import { useEffect, useMemo, useRef, useState, Fragment, useCallback } from "react";
import { createPortal } from "react-dom";
import { Settings, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Repeat, Music, Maximize2, Minimize2, Timer, Gauge } from "lucide-react";
import { foundationModules } from "@/data/lesson-plan";
import {
  defaultFluteProfile,
  classifySwara,
  detectPitch,
  estimateNoiseLevel,
  fluteProfileForSelection,
  fluteRegisterOptions,
  resolveSwaraReading,
  scoreAttempt,
  swaraTargets,
  tonicOptions,
  targetFrequencyFor,
  isPlayableSwaraForProfile,
  westernNoteForSwara,
  type FluteProfile,
  type FluteRegister,
  type DetectedSwara,
  type OctaveName,
  type SwaraName,
  type SwaraTarget,
  type TonicName,
} from "@/lib/swara";
import type { LessonStep } from "@/data/lesson-plan";
import { FluteFinder, readStoredFluteProfile, storeFluteProfile } from "@/components/flute-finder";
import { THEME } from "@/data/theme-colors";

type TrendPoint = {
  score: number | null;
  centsOffset: number | null;
  confidence: number | null;
  noise: number | null;
  energy: number | null;
  stability: number | null;
  sustainMs: number | null;
  active: boolean;
  timestamp: number;
  swara: string | null;
  octave: string | null;
};

type AnalysisState = {
  detected: DetectedSwara | null;
  transientDetected: DetectedSwara | null;
  rawFrequency: number | null;
  energy: number | null;
  noise: number | null;
  stability: number | null;
  sustainMs: number | null;
  centsOffset: number | null;
  confidence: number | null;
  status: string;
  trend: TrendPoint[];
};

type SequenceProgress = {
  checkpointId: string;
  stepIndex: number;
  repeatIndex: number;
  stepStartedAt: number | null;
};

type SequenceHandoff = {
  from: SwaraTarget;
  to: SwaraTarget;
  until: number;
};

type SequenceCarryoverBlock = {
  noteKey: string;
  checkpointId: string;
  stepIndex: number;
  repeatIndex: number;
};

type SequenceRearticulationGate = {
  checkpointId: string;
  stepIndex: number;
  repeatIndex: number;
  targetKey: string;
  openedAt: number;
  releaseSeenAt: number | null;
};

type CheckpointFocus = {
  target: SwaraTarget;
  sustainTargetMs: number;
  label: string;
  progressLabel: string;
  done: boolean;
  currentStep:
  | {
    target: SwaraTarget;
    sustainTargetMs: number;
    isAnchor?: boolean;
  }
  | null;
};

type SequenceLessonStep = LessonStep & {
  type: "sequence";
  steps: NonNullable<LessonStep["steps"]>;
  repeatCount: NonNullable<LessonStep["repeatCount"]>;
  sequenceRules: NonNullable<LessonStep["sequenceRules"]>;
};

type DebugLogEntry = {
  sessionId: string;
  timestamp: string;
  event:
  | "checkpoint_selected"
  | "analysis_started"
  | "analysis_stopped"
  | "note_change"
  | "sequence_advance"
  | "sequence_reset"
  | "checkpoint_cleared";
  checkpointId: string;
  checkpointTitle: string;
  expectedTarget: string;
  detectedTarget?: string | null;
  sequenceStepIndex?: number;
  sequenceRepeatIndex?: number;
  holdMs?: number | null;
  rawFrequency?: number | null;
  centsOffset?: number | null;
  confidence?: number | null;
  detectedKey?: string | null;
  detail?: string;
};

type SequenceStepRecord = {
  stepIndex: number;
  repeatIndex: number;
  target: SwaraTarget;
  detected: DetectedSwara | null;
  score: number;
  holdMs: number | null;
};

type SequenceRunResult = {
  kind: "success" | "failure";
  message: string;
  score: number | null;
  detail?: string;
};

type ClearedCheckpointState = {
  stepId: string;
  stepTitle: string;
  nextStepId: string | null;
  nextStepTitle: string | null;
  source: "manual" | "auto";
};

type SequenceLoopHistoryEntry = {
  repeatIndex: number;
  kind: "success" | "failure";
  score: number | null;
  message: string;
  stepScores: Array<number | null>;
};

type PitchDifficulty = "easy" | "medium" | "hard";
type PitchTrendWindowMs = 5000 | 15000 | 30000;
type FluteRoadPracticeMode = "rainfall" | "reverse";

type PitchDifficultyConfig = {
  label: string;
  description: string;
  noteToleranceCents: number;
  releaseToleranceCents: number;
  sequenceToleranceCents: number;
  scoreToleranceCents: number;
};

const allLessonSteps = foundationModules.flatMap((module) => module.steps);
// Default to the first checkpoint of the 13th module (index 12)
// const firstStep = allLessonSteps[0];
const firstStep = foundationModules[12]?.steps[0] ?? allLessonSteps[0];
const FALLBACK_TARGET: SwaraTarget = { swara: "Sa", octave: "Madhya" };
const UI_REFRESH_MS = 40;
const SILENCE_HOLD_MS = 320;
const NOTE_LOCK_MS = 320;
const SEQUENCE_NOTE_LOCK_MS = 150;
const SEQUENCE_RELEASE_GRACE_MS = 380;
const PRACTICE_HOLD_FLOOR_MS = 2400;
const SEQUENCE_BETWEEN_NOTES_TIMEOUT_MS = 1400;
const SEQUENCE_HANDOFF_GRACE_MS = 650;
const SEQUENCE_REARTICULATION_RELEASE_MS = 120;
const AUTO_CLEAR_HOLD_MS = 140;
const TARGET_HOLD_GRACE_MS = 220;
const ACTIVE_CONFIDENCE = 0.45;
const ACTIVE_ENERGY = 0.007;
const TREND_WINDOW_MS = 15000;
const TREND_SAMPLE_MS = 40;
const PITCH_TREND_WINDOW_STORAGE_KEY = "bansuri.pitchTrendWindow";
const DEBUG_LOG_STORAGE_KEY = "bansuri.trainerDebugLog";
const PITCH_DIFFICULTY_STORAGE_KEY = "bansuri.pitchDifficulty";
const FLUTE_ROAD_MODE_STORAGE_KEY = "bansuri.fluteRoadMode";
const DEBUG_LOG_LIMIT = 900;
const DEBUG_LOG_SINK_URL = "http://127.0.0.1:4010/log";
const SEQUENCE_MIN_PRACTICE_SCORE = 72;
const FLUTE_BOARD_WIDTH = 1020;
const FLUTE_BOARD_HEIGHT = 560;
const FLUTE_BODY_OFFSET_Y = 455;
const FLUTE_LANES = [
  { swara: "Ga", targetSwaras: ["Ga", "Ma"], x: 700, hole: "circle" as const, roadLabel: "Ga / Ma" },
  { swara: "Re", targetSwaras: ["Re"], x: 755, hole: "circle" as const, roadLabel: "Re" },
  { swara: "Sa", targetSwaras: ["Sa"], x: 810, hole: "circle" as const, roadLabel: "Sa" },
  { swara: "Ni", targetSwaras: ["Ni"], x: 865, hole: "circle" as const, roadLabel: "Ni" },
  { swara: "Dha", targetSwaras: ["Dha"], x: 920, hole: "circle" as const, roadLabel: "Dha" },
  { swara: "Pa", targetSwaras: ["Pa"], x: 975, hole: "circle" as const, roadLabel: "Pa" },
] satisfies Array<{ swara: SwaraName; targetSwaras: SwaraName[]; x: number; hole: "circle" | "ellipse"; roadLabel: string }>;

const TRAINER_OCTAVE_PALETTE: Record<OctaveName, { fill: string; glow: string; road: string; label: string }> = {
  Mandra: {
    fill: "#58b8ff",
    glow: "rgba(88,184,255,0.48)",
    road: "rgba(88,184,255,0.18)",
    label: "#d9efff",
  },
  Madhya: {
    fill: "#8be66a",
    glow: "rgba(139,230,106,0.48)",
    road: "rgba(139,230,106,0.18)",
    label: "#ecffe2",
  },
  Taar: {
    fill: "#e16cff",
    glow: "rgba(225,108,255,0.48)",
    road: "rgba(225,108,255,0.18)",
    label: "#fbebff",
  },
};
const canUsePersistentStorage = process.env.NODE_ENV === "production";

const pitchDifficultyOptions: Array<{ value: PitchDifficulty; label: string; description: string }> = [
  { value: "easy", label: "Easy", description: "Wider pitch band" },
  { value: "medium", label: "Medium", description: "Balanced trainer mode" },
  { value: "hard", label: "Hard", description: "Tighter pitch band" },
];

const pitchTrendWindowOptions: Array<{ value: PitchTrendWindowMs; label: string; description: string }> = [
  { value: 5000, label: "5s", description: "Most detail and most labels" },
  { value: 15000, label: "15s", description: "Balanced overview" },
  { value: 30000, label: "30s", description: "Wider history view" },
];

function readStoredPitchDifficulty(): PitchDifficulty {
  if (!canUsePersistentStorage) {
    return "easy";
  }

  try {
    if (typeof window === "undefined") {
      return "easy";
    }

    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return "easy";
    }

    const stored = storage.getItem(PITCH_DIFFICULTY_STORAGE_KEY);
    return stored === "easy" || stored === "medium" || stored === "hard" ? stored : "easy";
  } catch {
    return "easy";
  }
}

function storePitchDifficulty(value: PitchDifficulty) {
  if (!canUsePersistentStorage) {
    return;
  }

  try {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    if (typeof storage?.setItem !== "function") {
      return;
    }

    storage.setItem(PITCH_DIFFICULTY_STORAGE_KEY, value);
  } catch {
    // best-effort
  }
}

function readStoredFluteRoadMode(): FluteRoadPracticeMode {
  if (!canUsePersistentStorage) {
    return "rainfall";
  }

  try {
    if (typeof window === "undefined") {
      return "rainfall";
    }

    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return "rainfall";
    }

    const stored = storage.getItem(FLUTE_ROAD_MODE_STORAGE_KEY);
    return stored === "reverse" || stored === "rainfall" ? stored : "rainfall";
  } catch {
    return "rainfall";
  }
}

function storeFluteRoadMode(value: FluteRoadPracticeMode) {
  if (!canUsePersistentStorage) {
    return;
  }

  try {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    if (typeof storage?.setItem !== "function") {
      return;
    }

    storage.setItem(FLUTE_ROAD_MODE_STORAGE_KEY, value);
  } catch {
    // best-effort
  }
}

function readStoredPitchTrendWindow(): PitchTrendWindowMs {
  if (!canUsePersistentStorage) {
    return 15000;
  }

  try {
    if (typeof window === "undefined") {
      return 15000;
    }

    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return 15000;
    }

    const stored = storage.getItem(PITCH_TREND_WINDOW_STORAGE_KEY);
    if (stored === "5000" || stored === "15000" || stored === "30000") {
      return Number(stored) as PitchTrendWindowMs;
    }

    return 15000;
  } catch {
    return 15000;
  }
}

function storePitchTrendWindow(value: PitchTrendWindowMs) {
  if (!canUsePersistentStorage) {
    return;
  }

  try {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    if (typeof storage?.setItem !== "function") {
      return;
    }

    storage.setItem(PITCH_TREND_WINDOW_STORAGE_KEY, String(value));
  } catch {
    // best-effort
  }
}

function pitchDifficultyConfig(difficulty: PitchDifficulty): PitchDifficultyConfig {
  switch (difficulty) {
    case "easy":
      return {
        label: "Easy",
        description: "Forgiving pitch band for practice",
        noteToleranceCents: 40,
        releaseToleranceCents: 56,
        sequenceToleranceCents: 72,
        scoreToleranceCents: 40,
      };
    case "hard":
      return {
        label: "Hard",
        description: "Tighter pitch band for precision",
        noteToleranceCents: 12,
        releaseToleranceCents: 18,
        sequenceToleranceCents: 48,
        scoreToleranceCents: 12,
      };
    case "medium":
    default:
      return {
        label: "Medium",
        description: "Balanced pitch band",
        noteToleranceCents: 20,
        releaseToleranceCents: 28,
        sequenceToleranceCents: 60,
        scoreToleranceCents: 20,
      };
  }
}

function readStoredDebugLog() {
  if (!canUsePersistentStorage) {
    return [] as DebugLogEntry[];
  }

  try {
    if (typeof window === "undefined") {
      return [] as DebugLogEntry[];
    }

    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return [] as DebugLogEntry[];
    }

    const raw = storage.getItem(DEBUG_LOG_STORAGE_KEY);
    if (!raw) {
      return [] as DebugLogEntry[];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DebugLogEntry[]) : [];
  } catch {
    return [] as DebugLogEntry[];
  }
}

function writeStoredDebugLog(entries: DebugLogEntry[]) {
  if (!canUsePersistentStorage) {
    return;
  }

  try {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    if (typeof storage?.setItem !== "function") {
      return;
    }

    storage.setItem(DEBUG_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-DEBUG_LOG_LIMIT)));
  } catch {
    // best-effort
  }
}

async function sendDebugEventToSink(entry: DebugLogEntry) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = JSON.stringify(entry);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        DEBUG_LOG_SINK_URL,
        new Blob([payload], { type: "application/json" }),
      );
      if (sent) {
        return;
      }
    }

    await fetch(DEBUG_LOG_SINK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Local sink is best-effort only.
  }
}

function formatTargetLabel(target: SwaraTarget) {
  return `${target.octave} ${target.swara}${target.state && target.state !== "Shuddha" ? ` (${target.state})` : ""}`;
}

function summarizeSequencePath(step: SequenceLessonStep, maxSteps = 6) {
  const labels = step.steps.map((entry) => entry.target.swara);
  if (labels.length <= maxSteps) {
    return labels.join(" - ");
  }

  return `${labels.slice(0, maxSteps).join(" - ")} - ...`;
}

function sequenceWindowMs(step: SequenceLessonStep, currentStep: SequenceLessonStep["steps"][number]) {
  return Math.max(step.sequenceRules.maxGapMs + 700, currentStep.sustainTargetMs + 1200);
}

function averageScore(values: number[]) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function buildLoopHistoryEntry(params: {
  repeatIndex: number;
  kind: "success" | "failure";
  message: string;
  records: SequenceStepRecord[];
  totalSteps: number;
}): SequenceLoopHistoryEntry {
  return {
    repeatIndex: params.repeatIndex,
    kind: params.kind,
    score: averageScore(params.records.map((record) => record.score)),
    message: params.message,
    stepScores: Array.from({ length: params.totalSteps }, (_, index) => {
      const record = params.records.find((entry) => entry.stepIndex === index && entry.repeatIndex === params.repeatIndex) ?? null;
      return record?.score ?? null;
    }),
  };
}

function noteKeyForTarget(target: SwaraTarget) {
  return `${target.swara}-${target.octave}`;
}

function describeSequenceRecord(record: SequenceStepRecord, pitchToleranceCents: number, ragaGrammar: boolean) {
  if (!record.detected) {
    return `No stable ${formatTargetLabel(record.target)} landed`;
  }

  const scoreSummary = scoreSequenceStepAttempt({
    target: record.target,
    detected: record.detected,
    sustainMs: Math.round(record.holdMs ?? 0),
    stability: 0,
    noise: 0,
    pitchToleranceCents,
    sustainNormalizationMs: 650,
    ragaGrammar,
  }).summary;

  return scoreSummary;
}

function summarizeSequenceFailure(
  records: SequenceStepRecord[],
  target: SwaraTarget,
  reason: string,
  pitchToleranceCents: number,
  ragaGrammar: boolean,
) {
  const latest = [...records].reverse().find(Boolean);
  const phraseScore = averageScore(records.map((record) => record.score));
  if (!latest) {
    return {
      message: `Last run failed: ${reason}.`,
      score: phraseScore,
    };
  }

  return {
    message: `Last run failed: ${reason}. ${describeSequenceRecord(latest, pitchToleranceCents, ragaGrammar)}.`,
    score: phraseScore,
  };
}

function isSequenceStep(step: LessonStep | null | undefined): step is SequenceLessonStep {
  return Boolean(step && step.type === "sequence" && Array.isArray(step.steps) && typeof step.repeatCount === "number");
}

function isRagaGrammarSequence(step: SequenceLessonStep | null | undefined) {
  return Boolean(step && (step.checkpointGroupId.startsWith("raga-") || step.ragaRules));
}

function scoreSequenceStepAttempt(params: {
  target: SwaraTarget;
  detected: DetectedSwara | null;
  sustainMs: number;
  stability: number;
  noise: number;
  pitchToleranceCents: number;
  sustainNormalizationMs: number;
  ragaGrammar: boolean;
}) {
  if (!params.ragaGrammar) {
    return scoreAttempt({
      target: params.target,
      detected: params.detected,
      sustainMs: params.sustainMs,
      stability: params.stability,
      noise: params.noise,
      pitchToleranceCents: params.pitchToleranceCents,
      sustainNormalizationMs: params.sustainNormalizationMs,
    });
  }

  const { target, detected, sustainMs, stability, noise, pitchToleranceCents, sustainNormalizationMs } = params;
  if (!detected) {
    return {
      score: 0,
      summary: "No stable flute tone detected yet.",
    };
  }

  const targetState = target.state ?? "Shuddha";
  const detectedState = detected.state ?? "Shuddha";
  const swaraScore = (detected.swara === target.swara && detectedState === targetState) ? 100 : 0;
  const octaveScore = detected.octave === target.octave ? 100 : 0;

  const pitchWindow = Math.max(10, pitchToleranceCents * 1.5);
  const pitchPenalty = Math.min(Math.abs(detected.centsOffset), pitchWindow * 2);
  const pitchScore = Math.max(0, 100 - (pitchPenalty / (pitchWindow * 2)) * 100);

  const sustainScore = Math.min(100, (sustainMs / sustainNormalizationMs) * 100);
  const stabilityScore = Math.max(0, Math.min(100, stability));
  const noiseScore = Math.max(0, Math.min(100, 100 - noise));

  // High weightage to correct note, octave and being in the pitch range (total 90% weightage)
  const score =
    swaraScore * 0.50 +
    octaveScore * 0.20 +
    pitchScore * 0.20 +
    sustainScore * 0.05 +
    stabilityScore * 0.03 +
    noiseScore * 0.02;

  let summary = "Good phrase shape. Keep the contour steady.";

  if (detected.swara !== target.swara || detectedState !== targetState) {
    const expectedLabel = targetState === "Teevra" ? `Teevra ${target.swara}` : targetState === "Komal" ? `Komal ${target.swara}` : target.swara;
    const playedLabel = detectedState === "Teevra" ? `Teevra ${detected.swara}` : detectedState === "Komal" ? `Komal ${detected.swara}` : detected.swara;
    summary = `You played ${playedLabel} instead of ${expectedLabel}.`;
  } else if (detected.octave !== target.octave) {
    summary = `Correct swara, but the octave is ${detected.octave} instead of ${target.octave}.`;
  } else if (Math.abs(detected.centsOffset) > pitchWindow * 1.4) {
    summary = detected.centsOffset > 0 ? "A little high for the phrase." : "A little low for the phrase.";
  } else if (Math.abs(detected.centsOffset) > pitchWindow * 0.8) {
    summary = detected.centsOffset > 0 ? "Close, but still a touch high." : "Close, but still a touch low.";
  } else if (sustainMs < sustainNormalizationMs * 0.7) {
    summary = "Phrase contour is fine. Let the note settle a little longer.";
  } else if (stability < 70) {
    summary = "The phrase is right, but airflow stability still needs work.";
  }

  return {
    score: Math.round(score),
    summary,
  };
}

function checkpointTargets(step: LessonStep | null | undefined, progress: SequenceProgress): CheckpointFocus {
  if (!step) {
    return {
      target: FALLBACK_TARGET,
      sustainTargetMs: 0,
      label: "Choose a checkpoint",
      progressLabel: "",
      done: false,
      currentStep: null,
    };
  }

  if (isSequenceStep(step)) {
    const steps = step.steps ?? [];
    if (!steps.length) {
      return {
        target: FALLBACK_TARGET,
        sustainTargetMs: 0,
        label: step.title,
        progressLabel: "Sequence unavailable",
        done: true,
        currentStep: null,
      };
    }

    const currentIndex = Math.min(progress.stepIndex, Math.max(0, steps.length - 1));
    const currentStep = steps[currentIndex] ?? steps[0];
    const repeatCount = step.repeatCount ?? 1;

    return {
      target: currentStep.target,
      sustainTargetMs: currentStep.sustainTargetMs,
      label: step.title,
      progressLabel: `Phrase ${Math.min(progress.repeatIndex + 1, repeatCount)} of ${repeatCount}`,
      done: progress.repeatIndex >= repeatCount && progress.stepIndex >= steps.length,
      currentStep,
    };
  }

  return {
    target: step.target ?? FALLBACK_TARGET,
    sustainTargetMs: step.sustainTargetMs,
    label: step.title,
    progressLabel: "Single note",
    done: false,
    currentStep: null,
  };
}

function isCheckpointPlayable(step: LessonStep, fluteProfile: FluteProfile) {
  if (!isSequenceStep(step)) {
    return step.target ? isPlayableSwaraForProfile(fluteProfile, step.target) : false;
  }

  return step.steps.every((sequenceStep) => isPlayableSwaraForProfile(fluteProfile, sequenceStep.target));
}

interface RoadStepResult {
  status: "green" | "yellow" | "red";
  correctFrames: number;
  totalFrames: number;
  ratio: number;
  targetSwara: string;
  targetOctave: string;
  targetState: string;
  lastDetectedSwara?: string;
  lastDetectedOctave?: string;
  lastDetectedState?: string;
  lastCentsOffset?: number;
  avgCentsOffset?: number;
  avgNoise?: number;
  avgStability?: number;
}

interface AggregatedNoteResult {
  key: string;
  swara: string;
  octave: string;
  state: string;
  correctFrames: number;
  totalFrames: number;
  ratio: number;
  avgCentsOffset: number | null;
  avgNoise: number | null;
  avgStability: number | null;
  missedCount: number;
  totalOccurrences: number;
}

function analyzeCheckpointPerformance(
  results: Record<number, RoadStepResult>,
  step: SequenceLessonStep,
  pitchConfig: PitchDifficultyConfig
) {
  const distinctNotes: Record<string, {
    key: string;
    swara: string;
    octave: string;
    state: string;
    correctFrames: number;
    totalFrames: number;
    centsSum: number;
    centsFrames: number;
    noiseSum: number;
    noiseFrames: number;
    stabilitySum: number;
    stabilityFrames: number;
    missedCount: number;
    totalOccurrences: number;
  }> = {};

  Object.entries(results).forEach(([idxStr, res]) => {
    const idx = Number(idxStr);
    const stepTarget = step.steps[idx].target;
    // Format noteKey strictly as the dot notation glyph
    const noteKey = step.steps[idx].glyph ?? stepTarget.swara;

    if (!distinctNotes[noteKey]) {
      distinctNotes[noteKey] = {
        key: noteKey,
        swara: stepTarget.swara,
        octave: stepTarget.octave,
        state: stepTarget.state ?? "Shuddha",
        correctFrames: 0,
        totalFrames: 0,
        centsSum: 0,
        centsFrames: 0,
        noiseSum: 0,
        noiseFrames: 0,
        stabilitySum: 0,
        stabilityFrames: 0,
        missedCount: 0,
        totalOccurrences: 0,
      };
    }

    const stats = distinctNotes[noteKey];
    stats.totalOccurrences += 1;
    stats.correctFrames += res.correctFrames;
    stats.totalFrames += res.totalFrames;

    if (res.totalFrames === 0) {
      stats.missedCount += 1;
    }

    if (res.avgCentsOffset != null) {
      stats.centsSum += Math.abs(res.avgCentsOffset);
      stats.centsFrames += 1;
    }
    if (res.avgNoise != null) {
      stats.noiseSum += res.avgNoise;
      stats.noiseFrames += 1;
    }
    if (res.avgStability != null) {
      stats.stabilitySum += res.avgStability;
      stats.stabilityFrames += 1;
    }
  });

  const aggregatedList: AggregatedNoteResult[] = Object.values(distinctNotes).map((n) => {
    const ratio = n.totalFrames > 0 ? n.correctFrames / n.totalFrames : 0;
    const avgCentsOffset = n.centsFrames > 0 ? n.centsSum / n.centsFrames : null;
    const avgNoise = n.noiseFrames > 0 ? n.noiseSum / n.noiseFrames : null;
    const avgStability = n.stabilityFrames > 0 ? n.stabilitySum / n.stabilityFrames : null;

    return {
      key: n.key,
      swara: n.swara,
      octave: n.octave,
      state: n.state,
      correctFrames: n.correctFrames,
      totalFrames: n.totalFrames,
      ratio,
      avgCentsOffset,
      avgNoise,
      avgStability,
      missedCount: n.missedCount,
      totalOccurrences: n.totalOccurrences,
    };
  });

  if (aggregatedList.length === 0) {
    return {
      poorest: [],
      primaryIssue: "No note performance data was collected. Please make sure your microphone is enabled and working.",
    };
  }

  // Sort by ratio (mean accuracy) ascending
  const poorest = [...aggregatedList].sort((a, b) => a.ratio - b.ratio).slice(0, 3);
  const worst = poorest[0];

  let primaryIssue = "";
  const totalMissedOccurrences = aggregatedList.reduce((acc, curr) => acc + curr.missedCount, 0);
  const totalOccurrencesCount = aggregatedList.reduce((acc, curr) => acc + curr.totalOccurrences, 0);

  if (totalMissedOccurrences === totalOccurrencesCount) {
    primaryIssue = "You did not play any notes during this attempt. Make sure you are blowing directly into the microphone at the correct time.";
  } else if (totalMissedOccurrences > totalOccurrencesCount * 0.5) {
    primaryIssue = "You missed more than half of the notes in this phrase. Try to follow the falling note tiles on the road and match their timing.";
  } else if (worst) {
    const targetLabel = `${worst.state === "Teevra" ? "Teevra " : worst.state === "Komal" ? "Komal " : ""}${worst.swara} (${worst.octave})`;

    if (worst.missedCount === worst.totalOccurrences) {
      primaryIssue = `The note "${targetLabel}" was completely missed across all ${worst.totalOccurrences} occurrences. Try to anticipate it as it falls down the road.`;
    } else if (worst.avgCentsOffset != null && Math.abs(worst.avgCentsOffset) > pitchConfig.noteToleranceCents) {
      const centsLabel = `${worst.avgCentsOffset > 0 ? "+" : ""}${Math.round(worst.avgCentsOffset)}¢`;
      primaryIssue = `Your average pitch offset for "${targetLabel}" was out of bounds (${centsLabel}). ${worst.avgCentsOffset > 0
        ? "Try easing your blowing strength slightly to bring the pitch down."
        : "Blow slightly stronger to support the note and raise the pitch."
        }`;
    } else if (worst.avgNoise != null && worst.avgNoise > 25) {
      primaryIssue = `Your tone for "${targetLabel}" was average of ${Math.round(worst.avgNoise)}% breath noise. Focus on centering the air stream into the embouchure hole.`;
    } else if (worst.avgStability != null && worst.avgStability < 75) {
      primaryIssue = `Your note "${targetLabel}" was unstable (average stability: ${Math.round(worst.avgStability)}%). Keep your breathing steady and column supported.`;
    } else {
      primaryIssue = `You played "${targetLabel}" but could not hold it long enough. Work on sustaining your airflow across all repetitions.`;
    }
  } else {
    primaryIssue = "Your performance was very close! Try again to lock in your score.";
  }

  return {
    poorest,
    primaryIssue,
  };
}

export function SwaraTrainer() {
  const [selectedStepId, setSelectedStepId] = useState<string>(firstStep?.id ?? "");
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [target, setTarget] = useState<SwaraTarget>(firstStep?.target ?? FALLBACK_TARGET);
  const [sequenceProgress, setSequenceProgress] = useState<SequenceProgress>({
    checkpointId: firstStep?.id ?? "",
    stepIndex: 0,
    repeatIndex: 0,
    stepStartedAt: null,
  });
  const [selectedTonic, setSelectedTonic] = useState<TonicName>(defaultFluteProfile.tonic);
  const [selectedRegister, setSelectedRegister] = useState<FluteRegister>(defaultFluteProfile.register);
  const [pitchDifficulty, setPitchDifficulty] = useState<PitchDifficulty>("easy");
  const [pitchTrendWindowMs, setPitchTrendWindowMs] = useState<PitchTrendWindowMs>(15000);
  const [fluteRoadMode, setFluteRoadMode] = useState<FluteRoadPracticeMode>("rainfall");
  const [isLiveCardFullscreen, setIsLiveCardFullscreen] = useState(false);
  const [boardWrapperWidth, setBoardWrapperWidth] = useState(880);
  const [micStatusToast, setMicStatusToast] = useState<string | null>(null);
  const [fluteMenuOpen, setFluteMenuOpen] = useState(false);
  const [fluteDetectOpen, setFluteDetectOpen] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState<boolean>(true);
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [metronomeActive, setMetronomeActive] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(60);
  const [metronomeBeatsPerNote, setMetronomeBeatsPerNote] = useState(4);
  const metronomeRef = useRef<HTMLDivElement | null>(null);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [beatsPerNote, setBeatsPerNote] = useState(1);
  const speedRef = useRef<HTMLDivElement | null>(null);

  const beatsPerNoteRef = useRef(beatsPerNote);
  const metronomeBpmRef = useRef(metronomeBpm);

  useEffect(() => {
    beatsPerNoteRef.current = beatsPerNote;
  }, [beatsPerNote]);

  useEffect(() => {
    metronomeBpmRef.current = metronomeBpm;
  }, [metronomeBpm]);

  const handleToggleLeftRail = () => {
    setLeftRailOpen((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("flute-left-rail-open", String(next));
        } catch { }
      }
      return next;
    });
  };
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkpointNotice, setCheckpointNotice] = useState<string | null>(null);
  const [clearedCheckpoint, setClearedCheckpoint] = useState<ClearedCheckpointState | null>(null);
  const [sequenceRunResult, setSequenceRunResult] = useState<SequenceRunResult | null>(null);
  const [sequenceLoopHistory, setSequenceLoopHistory] = useState<SequenceLoopHistoryEntry[]>([]);
  const [bonusTokens, setBonusTokens] = useState(0);
  const [celebrationPieces, setCelebrationPieces] = useState<Array<{ id: string; left: number; delay: number; duration: number; drift: number; hue: number }>>([]);
  const [sequenceStepDurationsMs, setSequenceStepDurationsMs] = useState<number[]>([]);
  const [sequenceLiveScore, setSequenceLiveScore] = useState<number | null>(null);
  const [fluteViewTick, setFluteViewTick] = useState(() => Date.now());
  const [fluteViewStartedAt, setFluteViewStartedAt] = useState(() => Date.now());
  const fluteViewStartedAtRef = useRef<number>(fluteViewStartedAt);
  useEffect(() => {
    fluteViewStartedAtRef.current = fluteViewStartedAt;
  }, [fluteViewStartedAt]);
  const [hoveredNoteTooltip, setHoveredNoteTooltip] = useState<{ rect: DOMRect; content: React.ReactNode } | null>(null);
  const [roadStepResults, setRoadStepResults] = useState<Record<number, RoadStepResult>>({});
  const roadStepAccumulatorRef = useRef<Record<number, {
    correct: number;
    total: number;
    lastDetectedSwara?: string;
    lastDetectedOctave?: string;
    lastDetectedState?: string;
    lastCentsOffset?: number;
    totalCentsOffset: number;
    totalNoise: number;
    totalStability: number;
    pitchFrames: number;
  }>>({});
  const isSequenceEvaluatedRef = useRef(false);
  const [isFluteRoadPaused, setIsFluteRoadPaused] = useState(false);
  const isFluteRoadPausedRef = useRef(false);
  const pauseStartRef = useRef<number | null>(null);

  const [showCheckpointSummaryPopup, setShowCheckpointSummaryPopup] = useState(false);
  const [checkpointSummaryData, setCheckpointSummaryData] = useState<{
    step: SequenceLessonStep;
    score: number;
    passed: boolean;
    results: Record<number, RoadStepResult>;
    trend: TrendPoint[];
    fluteViewStartedAt: number;
  } | null>(null);
  const sequenceTrendPointsRef = useRef<TrendPoint[]>([]);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [isFluteRoadLooping, setIsFluteRoadLooping] = useState(false);
  const isFluteRoadLoopingRef = useRef(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({
    detected: null,
    transientDetected: null,
    rawFrequency: null,
    energy: null,
    noise: null,
    stability: null,
    sustainMs: null,
    centsOffset: null,
    confidence: null,
    status: "Waiting to start microphone analysis.",
    trend: [],
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const sustainStartRef = useRef<number | null>(null);
  const sustainGraceSinceRef = useRef<number | null>(null);
  const recentCentsRef = useRef<number[]>([]);
  const previousReadingRef = useRef<DetectedSwara | null>(null);
  const lastUiCommitRef = useRef(0);
  const silenceSinceRef = useRef<number | null>(null);
  const trendRef = useRef<TrendPoint[]>([]);
  const lastTrendSampleRef = useRef(0);
  const visibleReadingRef = useRef<DetectedSwara | null>(null);
  const noteLockRef = useRef<{ key: string; startedAt: number; reading: DetectedSwara } | null>(null);
  const autoClearArmedRef = useRef<{ stepId: string; startedAt: number } | null>(null);
  const autoClearDoneRef = useRef<string | null>(null);
  const sequenceTransitionUntilRef = useRef<number | null>(null);
  const sequenceHandoffRef = useRef<SequenceHandoff | null>(null);
  const sequenceCarryoverBlockRef = useRef<SequenceCarryoverBlock | null>(null);
  const sequenceRearticulationGateRef = useRef<SequenceRearticulationGate | null>(null);
  const sequenceStepRecordsRef = useRef<Array<SequenceStepRecord | null>>([]);
  const sequenceStepDurationsRef = useRef<number[]>([]);
  const sequenceLoopHistoryRef = useRef<SequenceLoopHistoryEntry[]>([]);
  const sequenceLiveScoreRef = useRef<number | null>(null);
  const debugLogRef = useRef<DebugLogEntry[]>([]);
  const debugSessionIdRef = useRef(`session-${Date.now()}`);
  const liveCardRef = useRef<HTMLDivElement | null>(null);
  const boardWrapperRef = useRef<HTMLDivElement | null>(null);
  const fluteMenuRef = useRef<HTMLDivElement | null>(null);
  const autoStartAttemptedRef = useRef(false);
  const lastDebugNoteKeyRef = useRef<string | null>(null);
  const lastDebugStepRef = useRef<string>("");
  const checkpointNoticeTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const micStatusTimerRef = useRef<number | null>(null);
  const sequenceProgressRef = useRef<SequenceProgress>(sequenceProgress);
  const smoothedMetricsRef = useRef({
    score: 0,
    centsOffset: 0,
    confidence: 0,
    energy: 0,
    stability: 0,
    sustainMs: 0,
    noise: 0,
  });

  const selectedStep = useMemo(
    () => allLessonSteps.find((step) => step.id === selectedStepId) ?? firstStep,
    [selectedStepId],
  );

  const sequenceDrill = selectedStep && isSequenceStep(selectedStep) ? selectedStep : null;

  const sequenceVisualStates = useMemo(() => {
    if (!sequenceDrill) return [];

    const countdownDelayMs = (60 / metronomeBpm) * 1000;
    const dynamicSustainMs = beatsPerNote * (60 / metronomeBpm) * 1000;
    const TILE_PX_PER_MS = 0.10;
    const SPAWN_MARGIN = 58;

    // Countdown tile params
    const countdownHeight = Math.max(40, Math.round(countdownDelayMs * TILE_PX_PER_MS));
    const countdownSpawnY = -countdownHeight - SPAWN_MARGIN;
    const countdownMsToFlute = Math.round((515 - countdownSpawnY) / TILE_PX_PER_MS);

    // Note tile params
    const noteHeight = Math.round(dynamicSustainMs * TILE_PX_PER_MS);
    const noteSpawnY = -noteHeight - SPAWN_MARGIN;
    const noteMsToFlute = Math.round((515 - noteSpawnY) / TILE_PX_PER_MS);

    const firstNoteArrivalAt = fluteViewStartedAt + countdownMsToFlute + 2 * countdownDelayMs + dynamicSustainMs;
    let noteCursor = firstNoteArrivalAt - noteMsToFlute;

    const now = fluteViewTick;

    return sequenceDrill.steps.map((step) => {
      const timeArrivalTrailing = noteCursor + noteMsToFlute;
      const timeArrivalLeading = timeArrivalTrailing - dynamicSustainMs;

      // Advance cursor for next step. Gap between groups = exactly 1 beat.
      noteCursor += dynamicSustainMs + (step.hasSpaceAfter ? countdownDelayMs : 0);

      const isPassed = now > timeArrivalTrailing;
      // Highlight the note group 1 beat before the tile arrives at the flute so the player has visual advance notice.
      const isActive = now >= (timeArrivalLeading - countdownDelayMs) && now <= timeArrivalTrailing;
      return {
        isPassed,
        isActive,
      };
    });
  }, [sequenceDrill, fluteViewStartedAt, fluteViewTick, beatsPerNote, metronomeBpm]);

  function triggerConfetti(stepId: string) {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }
    setCelebrationPieces(
      Array.from({ length: 36 }, (_, index) => ({
        id: `${stepId}-${Date.now()}-${index}`,
        left: Math.random() * 100,
        delay: Math.random() * 180,
        duration: 900 + Math.random() * 600,
        drift: -70 + Math.random() * 140,
        hue: [103, 117, 255, 47, 30, 200][index % 6],
      })),
    );
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebrationPieces([]);
      celebrationTimerRef.current = null;
    }, 1800);
    playSuccessChime();
  }

  useEffect(() => {
    if (!showCheckpointSummaryPopup || !checkpointSummaryData) return;
    setAnimatedScore(0);
    const end = checkpointSummaryData.score;
    if (end === 0) {
      return;
    }
    const duration = 1200;
    const startTime = performance.now();
    let animFrameId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = progress * (2 - progress);
      const current = Math.round(easedProgress * end);
      setAnimatedScore(current);

      if (progress < 1) {
        animFrameId = requestAnimationFrame(animate);
      } else {
        if (checkpointSummaryData.passed) {
          triggerConfetti(checkpointSummaryData.step.id);
        }
      }
    };

    animFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [showCheckpointSummaryPopup, checkpointSummaryData]);

  const activeVisualIndex = sequenceVisualStates.findIndex((state) => state.isActive);
  const fluteProfile = useMemo(
    () => fluteProfileForSelection(selectedTonic, selectedRegister),
    [selectedRegister, selectedTonic],
  );
  const pitchConfig = useMemo(() => pitchDifficultyConfig(pitchDifficulty), [pitchDifficulty]);

  useEffect(() => {
    roadStepAccumulatorRef.current = {};
    setRoadStepResults({});
    isSequenceEvaluatedRef.current = false;
  }, [fluteViewStartedAt]);

  // Real-time accumulation is now handled inside the tick() animation frame loop to bypass React render/state lag.

  const selectedStepRef = useRef<LessonStep | null>(selectedStep ?? null);
  const targetRef = useRef<SwaraTarget>(selectedStep?.target ?? target);
  const fluteProfileRef = useRef<FluteProfile>(fluteProfile);
  const pitchConfigRef = useRef<PitchDifficultyConfig>(pitchConfig);
  const analysisRef = useRef<AnalysisState>({
    detected: null,
    transientDetected: null,
    rawFrequency: null,
    energy: null,
    noise: null,
    stability: null,
    sustainMs: null,
    centsOffset: null,
    confidence: null,
    status: "Waiting to start microphone analysis.",
    trend: [],
  });

  const unlockedStepIds = useMemo(() => {
    const unlocked = new Set<string>();

    allLessonSteps.forEach((step, index) => {
      if (index === 0 || completedStepIds.includes(allLessonSteps[index - 1].id)) {
        unlocked.add(step.id);
      }
    });

    return unlocked;
  }, [completedStepIds]);

  const result = useMemo(
    () =>
      scoreAttempt({
        target,
        detected: analysis.detected,
        sustainMs: analysis.sustainMs ?? 0,
        stability: analysis.stability ?? 0,
        noise: analysis.noise ?? 100,
        pitchToleranceCents: pitchConfig.scoreToleranceCents,
      }),
    [analysis.detected, analysis.noise, analysis.stability, analysis.sustainMs, pitchConfig.scoreToleranceCents, target],
  );

  const masteryReady = useMemo(() => {
    if (!selectedStep || !analysis.detected) {
      return false;
    }

    if (isSequenceStep(selectedStep)) {
      return (
        sequenceProgress.stepIndex >= selectedStep.steps.length &&
        sequenceProgress.repeatIndex >= selectedStep.repeatCount
      );
    }

    return (
      result.score >= selectedStep.minimumScore &&
      (analysis.sustainMs ?? 0) >= selectedStep.sustainTargetMs &&
      selectedStep.target != null &&
      analysis.detected.swara === selectedStep.target.swara &&
      analysis.detected.octave === selectedStep.target.octave &&
      (analysis.detected.state ?? "Shuddha") === (selectedStep.target.state ?? "Shuddha") &&
      Math.abs(analysis.detected.centsOffset) <= pitchConfig.noteToleranceCents
    );
  }, [analysis.detected, analysis.sustainMs, pitchConfig.noteToleranceCents, result.score, selectedStep, sequenceProgress]);

  useEffect(() => {
    return () => {
      if (checkpointNoticeTimerRef.current !== null) {
        window.clearTimeout(checkpointNoticeTimerRef.current);
      }
      stopAnalysis();
    };
  }, []);

  useEffect(() => {
    const storedProfile = readStoredFluteProfile();
    setSelectedTonic(storedProfile.tonic);
    setSelectedRegister(storedProfile.register);
  }, []);

  useEffect(() => {
    debugLogRef.current = readStoredDebugLog();
  }, []);

  useEffect(() => {
    setPitchDifficulty(readStoredPitchDifficulty());
  }, []);

  useEffect(() => {
    setPitchTrendWindowMs(readStoredPitchTrendWindow());
  }, []);

  useEffect(() => {
    setFluteRoadMode(readStoredFluteRoadMode());
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("flute-left-rail-open");
      if (stored != null) {
        setLeftRailOpen(stored === "true");
      }
    } catch { }
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "m") {
        event.preventDefault();
        event.stopPropagation();
        if (running) {
          stopAnalysis();
          setMicStatusToast("Mic muted");
        } else {
          void startAnalysis();
          setMicStatusToast("Mic unmuted");
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "f") {
        event.preventDefault();
        event.stopPropagation();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void liveCardRef.current?.requestFullscreen?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [running]);

  useEffect(() => {
    if (micStatusToast === null) {
      return;
    }

    if (micStatusTimerRef.current !== null) {
      window.clearTimeout(micStatusTimerRef.current);
    }

    micStatusTimerRef.current = window.setTimeout(() => {
      setMicStatusToast(null);
      micStatusTimerRef.current = null;
    }, 1100);

    return () => {
      if (micStatusTimerRef.current !== null) {
        window.clearTimeout(micStatusTimerRef.current);
      }
    };
  }, [micStatusToast]);

  useEffect(() => {
    if (autoStartAttemptedRef.current) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void startAnalysis();
  }, []);

  useEffect(() => {
    if (selectedStep) {
      resetLiveState(selectedStep);
    }
  }, [selectedStep]);

  useEffect(() => {
    const focus = checkpointTargets(selectedStep, sequenceProgress);
    setTarget(focus.target);
  }, [selectedStep, sequenceProgress]);

  useEffect(() => {
    selectedStepRef.current = selectedStep ?? null;
  }, [selectedStep]);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    fluteProfileRef.current = fluteProfile;
  }, [fluteProfile]);

  useEffect(() => {
    pitchConfigRef.current = pitchConfig;
  }, [pitchConfig]);

  useEffect(() => {
    storeFluteProfile(fluteProfile);
  }, [fluteProfile]);

  useEffect(() => {
    storePitchDifficulty(pitchDifficulty);
  }, [pitchDifficulty]);

  useEffect(() => {
    storePitchTrendWindow(pitchTrendWindowMs);
  }, [pitchTrendWindowMs]);

  useEffect(() => {
    storeFluteRoadMode(fluteRoadMode);
  }, [fluteRoadMode]);

  useEffect(() => {
    setFluteViewStartedAt(Date.now());
  }, [selectedStepId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isFluteRoadPausedRef.current) {
        setFluteViewTick(Date.now());
      }
    }, 80);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    if (isLiveCardFullscreen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLiveCardFullscreen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!fluteMenuOpen) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (fluteMenuRef.current?.contains(target)) {
        return;
      }

      setFluteMenuOpen(false);
      setFluteDetectOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFluteMenuOpen(false);
        setFluteDetectOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fluteMenuOpen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleFullscreenChange = () => {
      setIsLiveCardFullscreen(document.fullscreenElement === liveCardRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const el = boardWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setBoardWrapperWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setBoardWrapperWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const metronomeAudioCtxRef = useRef<AudioContext | null>(null);
  const metronomeBeatCountRef = useRef(0);

  useEffect(() => {
    if (!metronomeActive || isFluteRoadPaused) {
      if (metronomeAudioCtxRef.current) {
        void metronomeAudioCtxRef.current.close().catch(() => { });
        metronomeAudioCtxRef.current = null;
      }
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    metronomeAudioCtxRef.current = ctx;

    const secondsPerBeat = 60.0 / metronomeBpm;
    let nextBeatTime = ctx.currentTime;
    let currentBeat = 0;

    const scheduleAheadTime = 0.1; // seconds
    const lookaheadIntervalMs = 25.0; // milliseconds

    const scheduleBeat = (_beatNumber: number, time: number) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(800, time);
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        osc.start(time);
        osc.stop(time + 0.06);
      } catch (e) {
        console.error("Metronome audio scheduling error:", e);
      }
    };

    const scheduler = () => {
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => { });
      }

      while (nextBeatTime < ctx.currentTime + scheduleAheadTime) {
        scheduleBeat(currentBeat, nextBeatTime);
        nextBeatTime += secondsPerBeat;
        currentBeat += 1;
      }
    };

    const timer = setInterval(scheduler, lookaheadIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [metronomeActive, metronomeBpm, metronomeBeatsPerNote, isFluteRoadPaused]);

  // Metronome dropdown click outside & Escape key listeners
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!metronomeOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (metronomeRef.current?.contains(target)) return;
      setMetronomeOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMetronomeOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [metronomeOpen]);

  // Speed dropdown click outside & Escape key listeners
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!speedOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (speedRef.current?.contains(target)) return;
      setSpeedOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSpeedOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [speedOpen]);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    sequenceProgressRef.current = sequenceProgress;
  }, [sequenceProgress]);

  useEffect(() => {
    sequenceStepDurationsRef.current = sequenceStepDurationsMs;
  }, [sequenceStepDurationsMs]);

  useEffect(() => {
    sequenceLoopHistoryRef.current = sequenceLoopHistory;
  }, [sequenceLoopHistory]);

  useEffect(() => {
    sequenceLiveScoreRef.current = sequenceLiveScore;
  }, [sequenceLiveScore]);

  useEffect(() => {
    if (!selectedStep) {
      return;
    }

    pushDebugEvent({
      event: "checkpoint_selected",
      checkpointId: selectedStep.id,
      checkpointTitle: selectedStep.title,
      expectedTarget: formatTargetLabel(checkpointTargets(selectedStep, sequenceProgressRef.current).target),
      sequenceStepIndex: sequenceProgressRef.current.stepIndex,
      sequenceRepeatIndex: sequenceProgressRef.current.repeatIndex,
      detail: "User selected checkpoint",
    });
  }, [selectedStepId]);

  useEffect(() => {
    if (clearedCheckpoint && clearedCheckpoint.stepId !== selectedStepId) {
      setClearedCheckpoint(null);
      setCheckpointNotice(null);
    }
  }, [clearedCheckpoint, selectedStepId]);

  const noteLines = useMemo(() => {
    if (!sequenceDrill) return [];

    const lines: Array<{
      lineIndex: number;
      groups: Array<{
        startIndex: number;
        endIndex: number;
        steps: typeof sequenceDrill.steps;
      }>;
    }> = [];

    let currentLineGroups: Array<{
      startIndex: number;
      endIndex: number;
      steps: typeof sequenceDrill.steps;
    }> = [];

    let currentGroupSteps: typeof sequenceDrill.steps = [];
    let groupStartIdx = 0;

    sequenceDrill.steps.forEach((step, idx) => {
      currentGroupSteps.push(step);

      const isLastStep = idx === sequenceDrill.steps.length - 1;
      const shouldCloseGroup = step.hasSpaceAfter || step.hasNewlineAfter || isLastStep;
      const shouldCloseLine = step.hasNewlineAfter || isLastStep;

      if (shouldCloseGroup) {
        currentLineGroups.push({
          startIndex: groupStartIdx,
          endIndex: idx,
          steps: currentGroupSteps,
        });
        currentGroupSteps = [];
        groupStartIdx = idx + 1;
      }

      if (shouldCloseLine) {
        lines.push({
          lineIndex: lines.length,
          groups: currentLineGroups,
        });
        currentLineGroups = [];
      }
    });

    return lines;
  }, [sequenceDrill]);

  const [activeLineIndex, setActiveLineIndex] = useState(0);

  useEffect(() => {
    if (activeVisualIndex >= 0) {
      const foundIdx = noteLines.findIndex((line) => {
        const start = line.groups[0].startIndex;
        const end = line.groups[line.groups.length - 1].endIndex;
        return activeVisualIndex >= start && activeVisualIndex <= end;
      });
      if (foundIdx >= 0) {
        setActiveLineIndex(foundIdx);
      }
    }
  }, [activeVisualIndex, noteLines]);

  const headerViewportRef = useRef<HTMLDivElement>(null);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef(false);
  const [magnifiedLineIndex, setMagnifiedLineIndex] = useState(0);

  const updateMagnifiedLine = useCallback(() => {
    const viewport = headerViewportRef.current;
    if (!viewport) return;
    const scrollTop = viewport.scrollTop;
    const viewportCenter = scrollTop + viewport.clientHeight / 2;

    const lines = viewport.querySelectorAll(".prompter-line");
    let closestIdx = 0;
    let minDistance = Infinity;

    lines.forEach((line, idx) => {
      if (line instanceof HTMLElement) {
        const lineCenter = line.offsetTop + line.offsetHeight / 2;
        const dist = Math.abs(lineCenter - viewportCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      }
    });

    setMagnifiedLineIndex(closestIdx);
  }, []);

  const triggerAutoscroll = useCallback(() => {
    const viewport = headerViewportRef.current;
    if (!viewport) return;
    const activeLine = viewport.querySelector(".active-line");
    if (activeLine instanceof HTMLElement) {
      const viewportHeight = viewport.clientHeight;
      const lineCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
      viewport.scrollTo({
        top: lineCenter - viewportHeight / 2,
        behavior: "smooth"
      });
    }
  }, []);

  const handleHeaderScroll = () => {
    updateMagnifiedLine();
  };

  const handleUserScrollInteraction = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      triggerAutoscroll();
    }, 2000);
  }, [triggerAutoscroll]);

  useEffect(() => {
    if (!isUserScrollingRef.current) {
      triggerAutoscroll();
    }
  }, [activeLineIndex, triggerAutoscroll]);

  useEffect(() => {
    updateMagnifiedLine();
  }, [noteLines, activeLineIndex, updateMagnifiedLine]);

  function noteKeyForReading(reading: DetectedSwara | null | undefined) {
    return reading ? `${reading.swara}-${reading.octave}` : null;
  }

  function resetLiveState(stepForCarryover?: LessonStep | null) {
    const carriedKey = noteKeyForReading(analysisRef.current.detected);

    sustainStartRef.current = null;
    sustainGraceSinceRef.current = null;
    recentCentsRef.current = [];
    previousReadingRef.current = null;
    visibleReadingRef.current = null;
    trendRef.current = [];
    lastTrendSampleRef.current = 0;
    lastUiCommitRef.current = 0;
    silenceSinceRef.current = null;
    noteLockRef.current = null;
    autoClearArmedRef.current = null;
    autoClearDoneRef.current = null;
    sequenceTransitionUntilRef.current = null;
    sequenceHandoffRef.current = null;
    sequenceCarryoverBlockRef.current =
      stepForCarryover && isSequenceStep(stepForCarryover) && carriedKey
        ? {
          noteKey: carriedKey,
          checkpointId: stepForCarryover.id,
          stepIndex: 0,
          repeatIndex: 0,
        }
        : null;
    sequenceRearticulationGateRef.current = null;
    sequenceStepRecordsRef.current = [];
    sequenceStepDurationsRef.current = [];
    lastDebugNoteKeyRef.current = null;
    lastDebugStepRef.current = "";
    setSequenceRunResult(null);
    setSequenceLoopHistory([]);
    setSequenceLiveScore(null);
    setSequenceStepDurationsMs([]);
    setSequenceProgress({
      checkpointId: selectedStepId,
      stepIndex: 0,
      repeatIndex: 0,
      stepStartedAt: null,
    });
    smoothedMetricsRef.current = {
      score: 0,
      centsOffset: 0,
      confidence: 0,
      energy: 0,
      stability: 0,
      sustainMs: 0,
      noise: 0,
    };
  }

  function resetSequenceAttempt(step: SequenceLessonStep, repeatIndex: number, result?: SequenceRunResult) {
    const resetProgress = {
      checkpointId: step.id,
      stepIndex: 0,
      repeatIndex,
      stepStartedAt: null,
    };
    sequenceProgressRef.current = resetProgress;
    setSequenceProgress(resetProgress);
    setTarget(step.steps[0].target);
    targetRef.current = step.steps[0].target;
    previousReadingRef.current = null;
    sustainStartRef.current = null;
    sustainGraceSinceRef.current = null;
    recentCentsRef.current = [];
    visibleReadingRef.current = null;
    noteLockRef.current = null;
    sequenceTransitionUntilRef.current = null;
    sequenceHandoffRef.current = null;
    sequenceCarryoverBlockRef.current = null;
    sequenceRearticulationGateRef.current = null;
    sequenceStepRecordsRef.current = [];
    sequenceStepDurationsRef.current = [];
    sequenceTrendPointsRef.current = [];
    setSequenceLiveScore(null);
    if (result) {
      setSequenceRunResult(result);
    }
    setSequenceStepDurationsMs([]);
  }

  function handleToggleFluteRoadPause() {
    setIsFluteRoadPaused(prev => {
      const next = !prev;
      isFluteRoadPausedRef.current = next;
      if (!next && pauseStartRef.current) {
        const pauseDuration = Date.now() - pauseStartRef.current;
        setFluteViewStartedAt(start => start + pauseDuration);
        pauseStartRef.current = null;
      } else if (next) {
        pauseStartRef.current = Date.now();
      }
      return next;
    });
  }

  function handleRetryFluteRoad() {
    const drill = selectedStep && isSequenceStep(selectedStep) ? selectedStep : null;
    if (drill) {
      resetSequenceAttempt(drill, 0);
    }
    setFluteViewStartedAt(Date.now());
    if (isFluteRoadPausedRef.current) {
      handleToggleFluteRoadPause();
    }
  }

  function handleToggleFluteRoadLoop() {
    setIsFluteRoadLooping(prev => {
      const next = !prev;
      isFluteRoadLoopingRef.current = next;
      return next;
    });
  }

  function recordSequenceStepResult(params: {
    step: SequenceLessonStep["steps"][number];
    detected: DetectedSwara | null;
    score: number;
    holdMs: number | null;
    stepIndex: number;
    repeatIndex: number;
    totalSteps: number;
  }) {
    const { step, detected, score, holdMs, stepIndex, repeatIndex, totalSteps } = params;
    const nextRecords = [...sequenceStepRecordsRef.current];
    const recordIndex = repeatIndex * totalSteps + stepIndex;
    nextRecords[recordIndex] = {
      stepIndex,
      repeatIndex,
      target: step.target,
      detected,
      score,
      holdMs,
    };
    sequenceStepRecordsRef.current = nextRecords;
  }

  function pushDebugEvent(entry: Omit<DebugLogEntry, "sessionId" | "timestamp">) {
    const nextEntry: DebugLogEntry = {
      sessionId: debugSessionIdRef.current,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const nextLog = [...debugLogRef.current, nextEntry].slice(-DEBUG_LOG_LIMIT);
    debugLogRef.current = nextLog;
    writeStoredDebugLog(nextLog);
    void sendDebugEventToSink(nextEntry);
  }

  async function startAnalysis() {
    setError(null);
    stopAnalysis();
    debugSessionIdRef.current = `session-${Date.now()}`;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.05;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      resetLiveState();
      setRunning(true);
      if (selectedStep) {
        pushDebugEvent({
          event: "analysis_started",
          checkpointId: selectedStep.id,
          checkpointTitle: selectedStep.title,
          expectedTarget: formatTargetLabel(checkpointTargets(selectedStep, sequenceProgressRef.current).target),
          sequenceStepIndex: sequenceProgressRef.current.stepIndex,
          sequenceRepeatIndex: sequenceProgressRef.current.repeatIndex,
          detail: "Microphone analysis started",
        });
      }
      tick();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Microphone access failed. Please allow the mic and try again.",
      );
    }
  }

  function stopAnalysis() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    if (running && selectedStepRef.current) {
      pushDebugEvent({
        event: "analysis_stopped",
        checkpointId: selectedStepRef.current.id,
        checkpointTitle: selectedStepRef.current.title,
        expectedTarget: formatTargetLabel(checkpointTargets(selectedStepRef.current, sequenceProgressRef.current).target),
        sequenceStepIndex: sequenceProgressRef.current.stepIndex,
        sequenceRepeatIndex: sequenceProgressRef.current.repeatIndex,
        detail: "Microphone analysis stopped",
      });
    }
    resetLiveState();
    setRunning(false);
    setAnalysis({
      detected: null,
      transientDetected: null,
      rawFrequency: null,
      energy: null,
      noise: null,
      stability: null,
      sustainMs: null,
      centsOffset: null,
      confidence: null,
      status: "Waiting to start microphone analysis.",
      trend: [],
    });
  }

  function tick() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    const liveStep = selectedStepRef.current;
    const liveProgress = sequenceProgressRef.current;
    const liveFocus = checkpointTargets(liveStep, liveProgress);
    const liveTarget = targetRef.current;
    const liveSequenceStep = liveStep && isSequenceStep(liveStep) ? liveStep : null;
    const liveFluteProfile = fluteProfileRef.current;
    const livePitchConfig = pitchConfigRef.current;
    const livePitchZoneCents = livePitchConfig.noteToleranceCents;
    const livePitchReleaseCents = livePitchConfig.releaseToleranceCents;
    const liveSequenceRagaGrammar = isRagaGrammarSequence(liveSequenceStep);
    const liveDynamicSustainMs = beatsPerNoteRef.current * (60 / metronomeBpmRef.current) * 1000;
    const liveSequenceIndex = liveSequenceStep
      ? Math.min(liveProgress.stepIndex, Math.max(0, liveSequenceStep.steps.length - 1))
      : 0;

    if (!analyser || !audioContext) {
      return;
    }

    if (isFluteRoadPausedRef.current) {
      frameRef.current = requestAnimationFrame(tick);
      return;
    }

    const now = performance.now();
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(spectrum);

    const energy = rms(buffer);
    const pitch = detectPitch(buffer, audioContext.sampleRate);
    const isValidFluteFrequency =
      pitch.frequency > 0 &&
      pitch.frequency >= liveFluteProfile.saFrequency * 0.63 &&
      pitch.frequency <= liveFluteProfile.saFrequency * 4.5;

    const rawReading =
      isValidFluteFrequency
        ? classifySwara(pitch.frequency, liveFluteProfile.saFrequency, pitch.confidence)
        : null;

    const harmonicReading =
      isValidFluteFrequency
        ? resolveSwaraReading({
          frequency: pitch.frequency,
          tonicFrequency: liveFluteProfile.saFrequency,
          confidence: pitch.confidence,
          target: liveTarget,
          previous: previousReadingRef.current,
          spectrum,
          sampleRate: audioContext.sampleRate,
        })
        : null;
    const detected = rawReading ?? harmonicReading;
    const energyPercent = Math.min(100, energy * 5000);
    const preliminaryNoise = detected
      ? estimateNoiseLevel({
        spectrum,
        frequency: pitch.frequency,
        confidence: pitch.confidence,
        energy: energyPercent,
        stability: null,
        sampleRate: audioContext.sampleRate,
      })
      : 100;

    const isActiveCandidate = Boolean(
      detected &&
      pitch.confidence >= ACTIVE_CONFIDENCE &&
      energy >= ACTIVE_ENERGY &&
      preliminaryNoise <= 58,
    );
    let hissPercent = 0;

    let sustainMs: number | null = null;
    let stability: number | null = null;
    let visibleReading: DetectedSwara | null = visibleReadingRef.current;
    let status = "Blow a clean note to begin.";
    const carryoverBlock = sequenceCarryoverBlockRef.current;
    const rearticulationGate = sequenceRearticulationGateRef.current;
    const detectedKey = noteKeyForReading(detected);
    const isCarryoverBlocked =
      Boolean(
        liveSequenceStep &&
        carryoverBlock &&
        carryoverBlock.checkpointId === liveSequenceStep.id &&
        carryoverBlock.stepIndex === liveProgress.stepIndex &&
        carryoverBlock.repeatIndex === liveProgress.repeatIndex &&
        detectedKey &&
        detectedKey === carryoverBlock.noteKey,
      );
    const isRearticulationBlocked =
      Boolean(
        liveSequenceStep &&
        rearticulationGate &&
        rearticulationGate.checkpointId === liveSequenceStep.id &&
        rearticulationGate.stepIndex === liveProgress.stepIndex &&
        rearticulationGate.repeatIndex === liveProgress.repeatIndex &&
        detectedKey &&
        detectedKey === rearticulationGate.targetKey &&
        rearticulationGate.releaseSeenAt == null,
      );

    if (isActiveCandidate && detected) {
      silenceSinceRef.current = null;
      const noteKey = `${detected.swara}-${detected.octave}`;

      if (!noteLockRef.current || noteLockRef.current.key !== noteKey) {
        noteLockRef.current = { key: noteKey, startedAt: now, reading: detected };
      } else {
        noteLockRef.current.reading = detected;
      }

      const lockAge = now - noteLockRef.current.startedAt;
      const noteLockThresholdMs = liveSequenceStep ? SEQUENCE_NOTE_LOCK_MS : NOTE_LOCK_MS;
      if (lockAge >= noteLockThresholdMs) {
        visibleReading = noteLockRef.current.reading;
        visibleReadingRef.current = noteLockRef.current.reading;
      }

      if (!isCarryoverBlocked) {
        previousReadingRef.current = detected;
      }

      if (
        rearticulationGate &&
        rearticulationGate.checkpointId === liveSequenceStep?.id &&
        rearticulationGate.stepIndex === liveProgress.stepIndex &&
        rearticulationGate.repeatIndex === liveProgress.repeatIndex &&
        detectedKey === rearticulationGate.targetKey &&
        rearticulationGate.releaseSeenAt != null
      ) {
        sequenceRearticulationGateRef.current = null;
      }

      const sustainReading =
        liveSequenceStep
          ? isCarryoverBlocked || isRearticulationBlocked
            ? null
            : detected ?? visibleReading
          : visibleReading;
      const noteIsOnTarget =
        Boolean(
          sustainReading &&
          sustainReading.swara === liveTarget.swara &&
          sustainReading.octave === liveTarget.octave &&
          (sustainReading.state ?? "Shuddha") === (liveTarget.state ?? "Shuddha") &&
          Math.abs(sustainReading.centsOffset) <= livePitchZoneCents,
        );

      const noteIsInReleaseZone =
        Boolean(
          sustainReading &&
          sustainReading.swara === liveTarget.swara &&
          sustainReading.octave === liveTarget.octave &&
          (sustainReading.state ?? "Shuddha") === (liveTarget.state ?? "Shuddha") &&
          Math.abs(sustainReading.centsOffset) <= livePitchReleaseCents,
        );

      if (noteIsOnTarget) {
        if (!sustainStartRef.current) {
          sustainStartRef.current = now;
        }

        sustainGraceSinceRef.current = null;
        sustainMs = now - sustainStartRef.current;
      } else if (noteIsInReleaseZone && sustainStartRef.current) {
        if (!sustainGraceSinceRef.current) {
          sustainGraceSinceRef.current = now;
        }

        if (now - sustainGraceSinceRef.current <= TARGET_HOLD_GRACE_MS) {
          sustainMs = now - sustainStartRef.current;
        } else {
          sustainStartRef.current = null;
          sustainGraceSinceRef.current = null;
        }
      } else {
        sustainStartRef.current = null;
        sustainGraceSinceRef.current = null;
      }

      if (liveSequenceStep && sustainMs != null) {
        const nextDurations = [...sequenceStepDurationsRef.current];
        const previousDuration = nextDurations[liveSequenceIndex] ?? 0;
        if (sustainMs > previousDuration + 35) {
          nextDurations[liveSequenceIndex] = sustainMs;
          sequenceStepDurationsRef.current = nextDurations;
          setSequenceStepDurationsMs(nextDurations);
        }
      }

      const centsToTrack = visibleReading?.centsOffset ?? detected.centsOffset;
      recentCentsRef.current = [...recentCentsRef.current.slice(-24), centsToTrack];
      const variance = stdDev(recentCentsRef.current);
      stability = Math.max(0, 100 - variance * 2.8);
      hissPercent = estimateNoiseLevel({
        spectrum,
        frequency: pitch.frequency,
        confidence: pitch.confidence,
        energy: energyPercent,
        stability,
        sampleRate: audioContext.sampleRate,
      });
      status = visibleReading
        ? noteIsOnTarget
          ? `Locked ${visibleReading.octave} ${visibleReading.swara}`
          : `${visibleReading.octave} ${visibleReading.swara} · ${describePitchOffset(visibleReading.centsOffset)}`
        : "Locking stable note...";

      if (liveSequenceStep) {
        status = isCarryoverBlocked
          ? `Release the previous note, then replay ${formatTargetLabel(liveTarget)}.`
          : isRearticulationBlocked
            ? `Release ${formatTargetLabel(liveTarget)} once, then replay it.`
            : visibleReading
              ? `${formatTargetLabel(liveTarget)} now · ${liveFocus.progressLabel}`
              : `Hold ${formatTargetLabel(liveTarget)} to move through the phrase`;
      }
      pushTrendPoint(
        {
          reading: visibleReading ?? detected,
          score: null,
          noise: hissPercent,
          energy: energyPercent,
          stability,
          sustainMs,
          confidence: pitch.confidence,
          active: true,
        },
        now,
      );
    } else {
      if (!silenceSinceRef.current) {
        silenceSinceRef.current = now;
      }

      const silenceAge = now - silenceSinceRef.current;
      const shouldClear = silenceAge > SILENCE_HOLD_MS;
      hissPercent = estimateNoiseLevel({
        spectrum,
        frequency: pitch.frequency,
        confidence: pitch.confidence,
        energy: energyPercent,
        stability: 0,
        sampleRate: audioContext.sampleRate,
      });

      if (shouldClear) {
        visibleReading = null;
        visibleReadingRef.current = null;
        sustainStartRef.current = null;
        sustainGraceSinceRef.current = null;
        recentCentsRef.current = [];
        noteLockRef.current = null;
      }

      if (
        liveSequenceStep &&
        sequenceRearticulationGateRef.current &&
        sequenceRearticulationGateRef.current.checkpointId === liveSequenceStep.id &&
        sequenceRearticulationGateRef.current.stepIndex === liveProgress.stepIndex &&
        sequenceRearticulationGateRef.current.repeatIndex === liveProgress.repeatIndex &&
        silenceAge >= SEQUENCE_REARTICULATION_RELEASE_MS
      ) {
        sequenceRearticulationGateRef.current = {
          ...sequenceRearticulationGateRef.current,
          releaseSeenAt: now,
        };
      }

      if (
        liveSequenceStep &&
        liveProgress.stepIndex > 0 &&
        liveProgress.stepStartedAt != null &&
        silenceAge >= SEQUENCE_BETWEEN_NOTES_TIMEOUT_MS &&
        !(sequenceTransitionUntilRef.current != null && now <= sequenceTransitionUntilRef.current)
      ) {
        const result = summarizeSequenceFailure(
          sequenceStepRecordsRef.current.filter((record): record is SequenceStepRecord => Boolean(record)),
          liveTarget,
          `timed out waiting for ${formatTargetLabel(liveTarget)}`,
          livePitchConfig.scoreToleranceCents,
          liveSequenceRagaGrammar,
        );
        const historyEntry = buildLoopHistoryEntry({
          repeatIndex: liveProgress.repeatIndex,
          kind: "failure",
          message: result.message,
          records: sequenceStepRecordsRef.current.filter((record): record is SequenceStepRecord => Boolean(record)),
          totalSteps: liveSequenceStep.steps.length,
        });
        setSequenceLoopHistory((current) => [...current, historyEntry].slice(-4));
        pushDebugEvent({
          event: "sequence_reset",
          checkpointId: liveSequenceStep.id,
          checkpointTitle: liveSequenceStep.title,
          expectedTarget: formatTargetLabel(liveSequenceStep.steps[0].target),
          sequenceStepIndex: liveProgress.stepIndex,
          sequenceRepeatIndex: liveProgress.repeatIndex,
          detail: result.message,
        });
        resetSequenceAttempt(liveSequenceStep, liveProgress.repeatIndex, {
          kind: "failure",
          message: result.message,
          score: result.score,
        });
        status = `Restart the phrase from ${formatTargetLabel(liveSequenceStep.steps[0].target)}.`;
      } else {
        status = shouldClear ? "Silence detected. Blow a note to begin." : "Holding the last tone briefly.";
      }
      pushTrendPoint(
        {
          reading: null,
          score: null,
          noise: null,
          energy: null,
          stability: null,
          sustainMs: null,
          confidence: null,
          active: false,
        },
        now,
      );
    }

    const rawScore = visibleReading
      ? scoreSequenceStepAttempt({
        target: liveTarget,
        detected: visibleReading,
        sustainMs: Math.round(sustainMs ?? 0),
        stability: Math.round(stability ?? 0),
        noise: Math.round(hissPercent),
        pitchToleranceCents: livePitchConfig.scoreToleranceCents,
        sustainNormalizationMs: Math.max(500, liveDynamicSustainMs * 4),
        ragaGrammar: liveSequenceRagaGrammar,
      }).score
      : 0;

    const compactDetected = visibleReading ?? (isActiveCandidate ? detected : null);
    const compactDetectedKey = noteKeyForReading(compactDetected);
    const sustainBucket = compactDetected ? Math.floor(Math.max(0, sustainMs ?? 0) / 600) : -1;
    const debugStepKey = liveStep
      ? `${liveStep.id}:${liveProgress.stepIndex}:${liveProgress.repeatIndex}:${compactDetectedKey ?? "none"}:${sustainBucket}`
      : "";

    if (
      liveStep &&
      compactDetected &&
      (debugStepKey !== lastDebugStepRef.current || compactDetectedKey !== lastDebugNoteKeyRef.current)
    ) {
      lastDebugStepRef.current = debugStepKey;
      lastDebugNoteKeyRef.current = compactDetectedKey;
      pushDebugEvent({
        event: "note_change",
        checkpointId: liveStep.id,
        checkpointTitle: liveStep.title,
        expectedTarget: formatTargetLabel(liveTarget),
        detectedTarget: formatTargetLabel(compactDetected),
        sequenceStepIndex: liveProgress.stepIndex,
        sequenceRepeatIndex: liveProgress.repeatIndex,
        holdMs: sustainMs,
        rawFrequency: pitch.frequency > 0 ? pitch.frequency : null,
        centsOffset: compactDetected.centsOffset,
        confidence: pitch.confidence,
        detectedKey: compactDetectedKey,
        detail: compactDetected === visibleReading ? "Locked note changed" : "Detected note changed",
      });
    }

    const sequenceStep =
      liveSequenceStep
        ? liveSequenceStep.steps[Math.min(liveProgress.stepIndex, Math.max(0, liveSequenceStep.steps.length - 1))] ?? null
        : null;

    if (liveSequenceStep && sequenceStep && (visibleReading || detected)) {
      const activeSequenceReading = isCarryoverBlocked ? null : (detected ?? visibleReading);
      if (!activeSequenceReading) {
        // Carryover from the previous checkpoint is intentionally ignored until the note is re-articulated.
      } else {
        const sequencePitchToleranceCents = Math.max(liveSequenceStep.pitchToleranceCents, livePitchConfig.sequenceToleranceCents);
        const expectedPitchMatches =
          activeSequenceReading.swara === liveTarget.swara &&
          activeSequenceReading.octave === liveTarget.octave &&
          (activeSequenceReading.state ?? "Shuddha") === (liveTarget.state ?? "Shuddha") &&
          Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;
        const sustainReady = (sustainMs ?? 0) >= Math.max(liveDynamicSustainMs, PRACTICE_HOLD_FLOOR_MS);
        const lockAge = noteLockRef.current ? now - noteLockRef.current.startedAt : 0;
        const noteLockThresholdMs = SEQUENCE_NOTE_LOCK_MS;
        const inTransitionGrace =
          sequenceTransitionUntilRef.current != null && now <= sequenceTransitionUntilRef.current;
        const handoff = sequenceHandoffRef.current;
        const isHandoffFromPreviousStep =
          handoff != null &&
          now <= handoff.until &&
          activeSequenceReading.swara === handoff.from.swara &&
          activeSequenceReading.octave === handoff.from.octave &&
          (activeSequenceReading.state ?? "Shuddha") === (handoff.from.state ?? "Shuddha") &&
          Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;
        const isCurrentTarget =
          activeSequenceReading.swara === liveTarget.swara &&
          activeSequenceReading.octave === liveTarget.octave &&
          (activeSequenceReading.state ?? "Shuddha") === (liveTarget.state ?? "Shuddha") &&
          Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;

        if (expectedPitchMatches && sustainReady) {
          const stepScore = scoreSequenceStepAttempt({
            target: sequenceStep.target,
            detected: activeSequenceReading,
            sustainMs: Math.round(sustainMs ?? 0),
            stability: Math.round(stability ?? 0),
            noise: Math.round(hissPercent),
            pitchToleranceCents: livePitchConfig.scoreToleranceCents,
            sustainNormalizationMs: Math.max(500, liveDynamicSustainMs * 4),
            ragaGrammar: liveSequenceRagaGrammar,
          }).score;
          recordSequenceStepResult({
            step: sequenceStep,
            detected: activeSequenceReading,
            score: stepScore,
            holdMs: sustainMs,
            stepIndex: liveProgress.stepIndex,
            repeatIndex: liveProgress.repeatIndex,
            totalSteps: liveSequenceStep.steps.length,
          });
          sequenceTransitionUntilRef.current = now + SEQUENCE_RELEASE_GRACE_MS;
          if (liveProgress.stepIndex >= liveSequenceStep.steps.length - 1) {
            const phraseScores = sequenceStepRecordsRef.current
              .filter((record): record is SequenceStepRecord => Boolean(record))
              .map((record) => record.score);
            const phraseScore = averageScore(phraseScores);
            const passThreshold = Math.max(liveSequenceStep.minimumScore, SEQUENCE_MIN_PRACTICE_SCORE);
            // A loop passes only if score meets threshold AND no individual note is red (ratio < 0.3)
            const hasAnyRedNote = liveSequenceStep.steps.some((_, idx) => {
              const accum = roadStepAccumulatorRef.current[idx];
              if (!accum || accum.total === 0) return true; // no data = red
              return accum.correct / accum.total < 0.30;
            });
            const loopPassed = phraseScore != null && phraseScore >= passThreshold && !hasAnyRedNote;
            const historyEntry = buildLoopHistoryEntry({
              repeatIndex: liveProgress.repeatIndex,
              kind: loopPassed ? "success" : "failure",
              message: loopPassed
                ? `Loop ${liveProgress.repeatIndex + 1} passed with ${phraseScore}/100.`
                : `Loop ${liveProgress.repeatIndex + 1} failed with ${phraseScore ?? 0}/${passThreshold}.`,
              records: sequenceStepRecordsRef.current.filter((record): record is SequenceStepRecord => Boolean(record)),
              totalSteps: liveSequenceStep.steps.length,
            });
            setSequenceLoopHistory((current) => [...current, historyEntry].slice(-4));

            if (loopPassed) {
              if (liveProgress.repeatIndex + 1 >= liveSequenceStep.repeatCount) {
                const finalResults = { ...roadStepResults };
                setCheckpointSummaryData({
                  step: liveSequenceStep,
                  score: phraseScore ?? 0,
                  passed: true,
                  results: finalResults,
                  trend: sequenceTrendPointsRef.current.length > 0 ? sequenceTrendPointsRef.current.slice() : trendRef.current.slice(),
                  fluteViewStartedAt: fluteViewStartedAtRef.current,
                });
                setShowCheckpointSummaryPopup(true);
                setMetronomeActive(false);

                setSequenceRunResult({
                  kind: "success",
                  message: `Phrase passed with ${phraseScore}/100.`,
                  score: phraseScore,
                });
                completeStep(liveSequenceStep, "auto");
              } else {
                pushDebugEvent({
                  event: "sequence_advance",
                  checkpointId: liveSequenceStep.id,
                  checkpointTitle: liveSequenceStep.title,
                  expectedTarget: formatTargetLabel(liveSequenceStep.steps[0].target),
                  detectedTarget: formatTargetLabel(activeSequenceReading),
                  sequenceStepIndex: 0,
                  sequenceRepeatIndex: liveProgress.repeatIndex + 1,
                  holdMs: sustainMs,
                  rawFrequency: activeSequenceReading.frequency,
                  centsOffset: activeSequenceReading.centsOffset,
                  detail: "Completed phrase loop and restarted",
                });
                setSequenceRunResult({
                  kind: "success",
                  message: phraseScore != null ? `Loop ${liveProgress.repeatIndex + 1} passed with ${phraseScore}/100.` : "Loop passed.",
                  score: phraseScore,
                });
                const nextProgress = {
                  checkpointId: liveSequenceStep.id,
                  stepIndex: 0,
                  repeatIndex: liveProgress.repeatIndex + 1,
                  stepStartedAt: now,
                };
                sequenceHandoffRef.current = null;
                sequenceCarryoverBlockRef.current = {
                  noteKey: noteKeyForReading(activeSequenceReading) ?? "",
                  checkpointId: liveSequenceStep.id,
                  stepIndex: 0,
                  repeatIndex: liveProgress.repeatIndex + 1,
                };
                sequenceProgressRef.current = nextProgress;
                setSequenceProgress(nextProgress);
                setTarget(liveSequenceStep.steps[0].target);
                targetRef.current = liveSequenceStep.steps[0].target;
                previousReadingRef.current = null;
                sustainStartRef.current = null;
                sustainGraceSinceRef.current = null;
                recentCentsRef.current = [];
                visibleReadingRef.current = null;
                noteLockRef.current = null;
                sequenceStepDurationsRef.current = [];
                setSequenceStepDurationsMs([]);
                setSequenceLiveScore(null);
              }
            } else {
              const result = summarizeSequenceFailure(
                sequenceStepRecordsRef.current.filter((record): record is SequenceStepRecord => Boolean(record)),
                liveTarget,
                `loop score ${phraseScore ?? 0}/${passThreshold} was below the pass mark`,
                livePitchConfig.scoreToleranceCents,
                liveSequenceRagaGrammar,
              );
              pushDebugEvent({
                event: "sequence_reset",
                checkpointId: liveSequenceStep.id,
                checkpointTitle: liveSequenceStep.title,
                expectedTarget: formatTargetLabel(liveSequenceStep.steps[0].target),
                sequenceStepIndex: liveProgress.stepIndex,
                sequenceRepeatIndex: liveProgress.repeatIndex,
                detail: result.message,
              });

              const finalResults = { ...roadStepResults };
              setCheckpointSummaryData({
                step: liveSequenceStep,
                score: result.score ?? 0,
                passed: false,
                results: finalResults,
                trend: sequenceTrendPointsRef.current.length > 0 ? sequenceTrendPointsRef.current.slice() : trendRef.current.slice(),
                fluteViewStartedAt: fluteViewStartedAtRef.current,
              });
              setShowCheckpointSummaryPopup(true);
              setMetronomeActive(false);

              resetSequenceAttempt(liveSequenceStep, liveProgress.repeatIndex, {
                kind: "failure",
                message: result.message,
                score: result.score,
              });
              setSequenceRunResult({
                kind: "failure",
                message: result.message,
                score: result.score,
              });
            }
          } else {
            const currentStepTarget = liveSequenceStep.steps[liveProgress.stepIndex].target;
            const nextStepTarget = liveSequenceStep.steps[liveProgress.stepIndex + 1].target;
            pushDebugEvent({
              event: "sequence_advance",
              checkpointId: liveSequenceStep.id,
              checkpointTitle: liveSequenceStep.title,
              expectedTarget: formatTargetLabel(nextStepTarget),
              detectedTarget: formatTargetLabel(activeSequenceReading),
              sequenceStepIndex: liveProgress.stepIndex + 1,
              sequenceRepeatIndex: liveProgress.repeatIndex,
              holdMs: sustainMs,
              rawFrequency: activeSequenceReading.frequency,
              centsOffset: activeSequenceReading.centsOffset,
              detail: "Advanced to next compound note",
            });
            const nextProgress = {
              checkpointId: liveSequenceStep.id,
              stepIndex: liveProgress.stepIndex + 1,
              repeatIndex: liveProgress.repeatIndex,
              stepStartedAt: now,
            };
            sequenceHandoffRef.current = {
              from: currentStepTarget,
              to: nextStepTarget,
              until: now + SEQUENCE_HANDOFF_GRACE_MS,
            };
            sequenceCarryoverBlockRef.current = {
              noteKey: noteKeyForReading(activeSequenceReading) ?? "",
              checkpointId: liveSequenceStep.id,
              stepIndex: nextProgress.stepIndex,
              repeatIndex: nextProgress.repeatIndex,
            };
            if (noteKeyForTarget(currentStepTarget) === noteKeyForTarget(nextStepTarget)) {
              sequenceRearticulationGateRef.current = {
                checkpointId: liveSequenceStep.id,
                stepIndex: nextProgress.stepIndex,
                repeatIndex: nextProgress.repeatIndex,
                targetKey: noteKeyForTarget(nextStepTarget),
                openedAt: now,
                releaseSeenAt: null,
              };
              sequenceCarryoverBlockRef.current = null;
            } else {
              sequenceRearticulationGateRef.current = null;
            }
            sequenceProgressRef.current = nextProgress;
            setSequenceProgress(nextProgress);
            setTarget(nextStepTarget);
            targetRef.current = nextStepTarget;
            previousReadingRef.current = null;
            sustainStartRef.current = null;
            sustainGraceSinceRef.current = null;
            recentCentsRef.current = [];
            visibleReadingRef.current = null;
            noteLockRef.current = null;
          }
        } else if (!expectedPitchMatches && lockAge >= noteLockThresholdMs && !inTransitionGrace) {
          if (isHandoffFromPreviousStep) {
            status = `Allowing ${formatTargetLabel(handoff.from)} to ring into ${formatTargetLabel(handoff.to)}`;
          } else if (liveProgress.stepIndex > 0) {
            status = `Waiting for ${formatTargetLabel(liveTarget)}. Restart only if the phrase goes silent.`;
          } else {
            sustainStartRef.current = null;
            sustainGraceSinceRef.current = null;
            recentCentsRef.current = [];
          }
        }
      }
    } else if (liveStep) {
      const checkpointClearable =
        Boolean(visibleReading) &&
        rawScore >= Math.max(0, (liveStep?.minimumScore ?? 0) - 8) &&
        (sustainMs ?? 0) >= liveDynamicSustainMs &&
        visibleReading?.swara === liveTarget.swara &&
        visibleReading?.octave === liveTarget.octave &&
        Math.abs(visibleReading?.centsOffset ?? 999) <= livePitchZoneCents;

      if (checkpointClearable) {
        if (!autoClearArmedRef.current || autoClearArmedRef.current.stepId !== liveStep.id) {
          autoClearArmedRef.current = { stepId: liveStep.id, startedAt: now };
        } else if (
          now - autoClearArmedRef.current.startedAt >= AUTO_CLEAR_HOLD_MS &&
          autoClearDoneRef.current !== liveStep.id
        ) {
          autoClearDoneRef.current = liveStep.id;
          completeStep(liveStep, "auto");
        }
      } else {
        autoClearArmedRef.current = null;
        if (!liveStep) {
          autoClearDoneRef.current = null;
        }
      }
    }

    if (liveSequenceStep) {
      const countdownDelayMs = (60 / metronomeBpmRef.current) * 1000;
      const dynamicSustainMs = beatsPerNoteRef.current * (60 / metronomeBpmRef.current) * 1000;
      const TILE_PX_PER_MS = 0.10;
      const SPAWN_MARGIN = 58;

      const countdownHeight = Math.max(40, Math.round(countdownDelayMs * TILE_PX_PER_MS));
      const countdownSpawnY = -countdownHeight - SPAWN_MARGIN;
      const countdownMsToFlute = Math.round((515 - countdownSpawnY) / TILE_PX_PER_MS);

      const noteHeight = Math.round(dynamicSustainMs * TILE_PX_PER_MS);
      const noteSpawnY = -noteHeight - SPAWN_MARGIN;
      const noteMsToFlute = Math.round((515 - noteSpawnY) / TILE_PX_PER_MS);

      const firstNoteArrivalAt = fluteViewStartedAtRef.current + countdownMsToFlute + 2 * countdownDelayMs + dynamicSustainMs;
      let noteCursor = firstNoteArrivalAt - noteMsToFlute;

      const currentTimestamp = Date.now();

      liveSequenceStep.steps.forEach((step, index) => {
        const timeArrivalTrailing = noteCursor + noteMsToFlute;
        const timeArrivalLeading = timeArrivalTrailing - dynamicSustainMs;

        noteCursor += dynamicSustainMs + (step.hasSpaceAfter ? countdownDelayMs : 0);

        const isPassed = currentTimestamp > timeArrivalTrailing;
        const isActiveForScoring = currentTimestamp >= timeArrivalLeading && currentTimestamp <= timeArrivalTrailing;

        if (isActiveForScoring) {
          const accum = roadStepAccumulatorRef.current[index] ?? {
            correct: 0,
            total: 0,
            totalCentsOffset: 0,
            totalNoise: 0,
            totalStability: 0,
            pitchFrames: 0,
          };
          accum.total += 1;

          const activeReading = detected;

          if (activeReading) {
            accum.totalCentsOffset += Math.abs(activeReading.centsOffset);
            accum.pitchFrames += 1;
          }
          if (hissPercent != null) {
            accum.totalNoise += hissPercent;
          }
          if (stability != null) {
            accum.totalStability += stability;
          }

          if (activeReading) {
            const sequencePitchToleranceCents = Math.max(liveSequenceStep.pitchToleranceCents, livePitchConfig.sequenceToleranceCents);
            const expectedPitchMatches =
              activeReading.swara === step.target.swara &&
              activeReading.octave === step.target.octave &&
              (activeReading.state ?? "Shuddha") === (step.target.state ?? "Shuddha") &&
              Math.abs(activeReading.centsOffset) <= sequencePitchToleranceCents;

            if (expectedPitchMatches) {
              accum.correct += 1;
            }

            accum.lastDetectedSwara = activeReading.swara;
            accum.lastDetectedOctave = activeReading.octave;
            accum.lastDetectedState = activeReading.state ?? "Shuddha";
            accum.lastCentsOffset = activeReading.centsOffset;
          }
          roadStepAccumulatorRef.current[index] = accum;
        } else if (isPassed) {
          setRoadStepResults((prev) => {
            if (prev[index]) return prev;

            const accum = roadStepAccumulatorRef.current[index];
            let status: "green" | "yellow" | "red" = "red";
            let ratio = 0;

            if (accum && accum.total > 0) {
              ratio = accum.correct / accum.total;
              if (ratio >= 0.70) {
                status = "green";
              } else if (ratio >= 0.30) {
                status = "yellow";
              }
            }

            const avgCentsOffset = accum && accum.pitchFrames > 0 ? accum.totalCentsOffset / accum.pitchFrames : undefined;
            const avgNoise = accum && accum.total > 0 ? accum.totalNoise / accum.total : undefined;
            const avgStability = accum && accum.total > 0 ? accum.totalStability / accum.total : undefined;

            return {
              ...prev,
              [index]: {
                status,
                correctFrames: accum?.correct ?? 0,
                totalFrames: accum?.total ?? 0,
                ratio,
                targetSwara: step.target.swara,
                targetOctave: step.target.octave,
                targetState: step.target.state ?? "Shuddha",
                lastDetectedSwara: accum?.lastDetectedSwara,
                lastDetectedOctave: accum?.lastDetectedOctave,
                lastDetectedState: accum?.lastDetectedState,
                lastCentsOffset: accum?.lastCentsOffset,
                avgCentsOffset,
                avgNoise,
                avgStability,
              },
            };
          });
        }
      });

      const allPassed = liveSequenceStep.steps.every((_, idx) => {
        let cursor = firstNoteArrivalAt - noteMsToFlute;
        for (let i = 0; i <= idx; i++) {
          const s = liveSequenceStep.steps[i];
          if (i === idx) {
            const trailing = cursor + noteMsToFlute;
            return currentTimestamp > trailing;
          }
          cursor += dynamicSustainMs + (s.hasSpaceAfter ? countdownDelayMs : 0);
        }
        return false;
      });

      if (allPassed && !isSequenceEvaluatedRef.current) {
        isSequenceEvaluatedRef.current = true;

        const compiledResults: Record<number, RoadStepResult> = {};
        const phraseScores: number[] = [];

        liveSequenceStep.steps.forEach((step, idx) => {
          const accum = roadStepAccumulatorRef.current[idx];
          let status: "green" | "yellow" | "red" = "red";
          let ratio = 0;

          if (accum && accum.total > 0) {
            ratio = accum.correct / accum.total;
            if (ratio >= 0.70) {
              status = "green";
            } else if (ratio >= 0.30) {
              status = "yellow";
            }
          }

          const avgCentsOffset = accum && accum.pitchFrames > 0 ? accum.totalCentsOffset / accum.pitchFrames : undefined;
          const avgNoise = accum && accum.total > 0 ? accum.totalNoise / accum.total : undefined;
          const avgStability = accum && accum.total > 0 ? accum.totalStability / accum.total : undefined;

          compiledResults[idx] = {
            status,
            correctFrames: accum?.correct ?? 0,
            totalFrames: accum?.total ?? 0,
            ratio,
            targetSwara: step.target.swara,
            targetOctave: step.target.octave,
            targetState: step.target.state ?? "Shuddha",
            lastDetectedSwara: accum?.lastDetectedSwara,
            lastDetectedOctave: accum?.lastDetectedOctave,
            lastDetectedState: accum?.lastDetectedState,
            lastCentsOffset: accum?.lastCentsOffset,
            avgCentsOffset,
            avgNoise,
            avgStability,
          };

          phraseScores.push(ratio * 100);
        });

        const phraseScore = averageScore(phraseScores);
        const passThreshold = Math.max(liveSequenceStep.minimumScore, SEQUENCE_MIN_PRACTICE_SCORE);
        // Fails if score below threshold OR any note is red (ratio < 0.3 → status === "red")
        const hasAnyRedNoteInResults = Object.values(compiledResults).some((r) => r.status === "red");
        const passed = (phraseScore ?? 0) >= passThreshold && !hasAnyRedNoteInResults;

        setRoadStepResults(compiledResults);

        setCheckpointSummaryData({
          step: liveSequenceStep,
          score: Math.round(phraseScore ?? 0),
          passed,
          results: compiledResults,
          trend: sequenceTrendPointsRef.current.length > 0 ? sequenceTrendPointsRef.current.slice() : trendRef.current.slice(),
          fluteViewStartedAt: fluteViewStartedAtRef.current,
        });
        setShowCheckpointSummaryPopup(true);

        if (passed) {
          completeStep(liveSequenceStep, "auto");
        }
      }
    }

    const alpha = 0.2;
    const smooth = smoothedMetricsRef.current;
    smooth.energy = visibleReading ? lerp(smooth.energy, energyPercent, alpha) : 0;
    smooth.noise = visibleReading ? lerp(smooth.noise, hissPercent, alpha) : 0;
    smooth.stability = visibleReading ? lerp(smooth.stability, stability ?? 0, alpha) : 0;
    smooth.sustainMs = visibleReading ? lerp(smooth.sustainMs, sustainMs ?? 0, alpha) : 0;
    smooth.confidence = visibleReading ? lerp(smooth.confidence, pitch.confidence * 100, alpha) : 0;
    smooth.centsOffset = visibleReading ? lerp(smooth.centsOffset, visibleReading.centsOffset, alpha) : 0;
    smooth.score = visibleReading ? lerp(smooth.score, rawScore, alpha) : 0;

    const previousAnalysis = analysisRef.current;
    const activeStateChanged = Boolean(previousAnalysis.detected) !== Boolean(visibleReading);
    const shouldCommit = now - lastUiCommitRef.current >= UI_REFRESH_MS || activeStateChanged;

    if (shouldCommit) {
      lastUiCommitRef.current = now;
      const nextAnalysis = {
        detected: visibleReading,
        transientDetected: compactDetected,
        rawFrequency: pitch.frequency > 0 ? pitch.frequency : null,
        energy: visibleReading ? Math.round(smooth.energy) : null,
        noise: visibleReading ? Math.round(smooth.noise) : null,
        stability: visibleReading ? Math.round(smooth.stability) : null,
        sustainMs: visibleReading ? Math.round(smooth.sustainMs) : null,
        centsOffset: visibleReading ? Math.round(smooth.centsOffset) : null,
        confidence: visibleReading ? smooth.confidence / 100 : null,
        status,
        trend: trendRef.current.slice(),
      };
      analysisRef.current = nextAnalysis;
      if (liveSequenceStep) {
        setSequenceLiveScore(visibleReading ? Math.round(rawScore) : null);
      } else {
        setSequenceLiveScore(null);
      }
      setAnalysis(nextAnalysis);
    }

    frameRef.current = requestAnimationFrame(tick);
  }

  function pushTrendPoint(
    point: {
      reading: DetectedSwara | null;
      score: number | null;
      energy: number | null;
      stability: number | null;
      sustainMs: number | null;
      confidence: number | null;
      noise: number | null;
      active: boolean;
    },
    now: number,
  ) {
    if (now - lastTrendSampleRef.current < TREND_SAMPLE_MS) {
      return;
    }

    lastTrendSampleRef.current = now;
    const timestamp = Date.now();
    const newPoint = {
      centsOffset: point.reading ? point.reading.centsOffset : null,
      confidence: point.confidence,
      noise: point.noise,
      energy: point.energy,
      stability: point.stability,
      sustainMs: point.sustainMs,
      score: point.score,
      active: point.active,
      timestamp,
      swara: point.reading ? point.reading.swara : null,
      octave: point.reading ? point.reading.octave : null,
    };
    trendRef.current = [
      ...trendRef.current.filter((entry) => timestamp - entry.timestamp <= TREND_WINDOW_MS),
      newPoint,
    ];
    // Also accumulate into sequence history for the summary popup
    if (sequenceProgressRef.current.checkpointId) {
      sequenceTrendPointsRef.current.push(newPoint);
    }
  }

  function completeStep(step: LessonStep, source: "manual" | "auto") {
    if (isFluteRoadLoopingRef.current && source === "auto") {
      if (isSequenceStep(step)) {
        resetSequenceAttempt(step, 0);
      }
      setFluteViewStartedAt(Date.now());
      return;
    }

    if (clearedCheckpoint?.stepId === step.id) {
      return;
    }

    pushDebugEvent({
      event: "checkpoint_cleared",
      checkpointId: step.id,
      checkpointTitle: step.title,
      expectedTarget: formatTargetLabel(checkpointTargets(step, sequenceProgressRef.current).target),
      sequenceStepIndex: sequenceProgressRef.current.stepIndex,
      sequenceRepeatIndex: sequenceProgressRef.current.repeatIndex,
      holdMs: analysisRef.current.sustainMs,
      rawFrequency: analysisRef.current.rawFrequency,
      centsOffset: analysisRef.current.centsOffset,
      confidence: analysisRef.current.confidence,
      detail: source === "auto" ? "Checkpoint cleared automatically" : "Checkpoint cleared manually",
    });
    setCompletedStepIds((current) => (current.includes(step.id) ? current : [...current, step.id]));
    setBonusTokens((current) => current + 1);

    if (checkpointNoticeTimerRef.current !== null) {
      window.clearTimeout(checkpointNoticeTimerRef.current);
    }
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }

    const currentIndex = allLessonSteps.findIndex((lessonStep) => lessonStep.id === step.id);
    const nextStep = allLessonSteps[currentIndex + 1];
    const nextMessage = nextStep ? `Next: ${nextStep.title}` : "Path complete.";
    setCheckpointNotice(
      `${source === "auto" ? "Checkpoint cleared" : "Manual clear"}: ${step.title}. ${nextMessage}`,
    );
    setClearedCheckpoint({
      stepId: step.id,
      stepTitle: step.title,
      nextStepId: nextStep?.id ?? null,
      nextStepTitle: nextStep?.title ?? null,
      source,
    });
    checkpointNoticeTimerRef.current = null;

    setCelebrationPieces(
      Array.from({ length: 28 }, (_, index) => ({
        id: `${step.id}-${Date.now()}-${index}`,
        left: Math.random() * 100,
        delay: Math.random() * 180,
        duration: 900 + Math.random() * 600,
        drift: -70 + Math.random() * 140,
        hue: [103, 117, 255, 47][index % 4],
      })),
    );
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebrationPieces([]);
      celebrationTimerRef.current = null;
    }, 1800);

    playSuccessChime();
  }

  function markStepComplete() {
    if (!selectedStep || !masteryReady) {
      return;
    }

    completeStep(selectedStep, "manual");
  }

  function retryClearedCheckpoint() {
    if (!clearedCheckpoint || !selectedStep || selectedStep.id !== clearedCheckpoint.stepId) {
      return;
    }

    setCheckpointNotice(null);
    setClearedCheckpoint(null);
    setFluteViewStartedAt(Date.now());
    resetLiveState(selectedStep);
  }

  function proceedToNextCheckpoint() {
    if (!clearedCheckpoint) {
      return;
    }

    setCheckpointNotice(null);
    const nextStepId = clearedCheckpoint.nextStepId;
    setClearedCheckpoint(null);

    if (nextStepId) {
      setSelectedStepId(nextStepId);
    }
  }

  function handleSelectStep(stepId: string) {
    setCheckpointNotice(null);
    setClearedCheckpoint(null);
    setSelectedStepId(stepId);
  }

  function playSuccessChime() {
    if (typeof window === "undefined") {
      return;
    }

    const existingContext = audioContextRef.current;
    const audioContext = existingContext ?? new window.AudioContext();
    void audioContext.resume().catch(() => { });

    const master = audioContext.createGain();
    master.gain.value = 0.18;
    master.connect(audioContext.destination);

    const playTone = (frequency: number, startTime: number, duration: number, amplitude: number) => {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.exponentialRampToValueAtTime(amplitude, startTime + 0.03);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    };

    const now = audioContext.currentTime;
    playTone(784, now, 0.16, 0.6);
    playTone(988, now + 0.11, 0.2, 0.42);

    if (!existingContext) {
      window.setTimeout(() => {
        audioContext.close().catch(() => { });
      }, 450);
    }
  }

  const scoreValue = analysis.detected ? result.score : null;
  const sequenceRagaGrammar = isRagaGrammarSequence(sequenceDrill);
  const sequenceCurrentIndex = sequenceDrill
    ? Math.min(sequenceProgress.stepIndex, Math.max(0, sequenceDrill.steps.length - 1))
    : 0;
  const sequenceCurrentStep = sequenceDrill ? sequenceDrill.steps[sequenceCurrentIndex] ?? null : null;
  const sequenceNextStep = sequenceDrill
    ? sequenceDrill.steps[Math.min(sequenceCurrentIndex + 1, sequenceDrill.steps.length - 1)] ?? null
    : null;
  const currentLoopRecords = sequenceDrill
    ? sequenceStepRecordsRef.current.filter(
      (record): record is SequenceStepRecord => record != null && record.repeatIndex === sequenceProgress.repeatIndex,
    )
    : [];
  const currentLoopCompletedScores = currentLoopRecords.map((record) => record.score);
  const currentLoopScore = averageScore(
    sequenceLiveScore != null ? [...currentLoopCompletedScores, sequenceLiveScore] : currentLoopCompletedScores,
  );
  const currentLoopStepScores = sequenceDrill
    ? sequenceDrill.steps.map((_, index) => {
      const record = currentLoopRecords.find((entry) => entry.stepIndex === index) ?? null;
      if (record) {
        return record.score;
      }

      return index === sequenceCurrentIndex && sequenceLiveScore != null ? sequenceLiveScore : null;
    })
    : [];
  const latestLoopHistoryEntry = sequenceLoopHistory.at(-1) ?? null;
  const sequenceLoopsCompleted = sequenceDrill ? sequenceProgress.repeatIndex : 0;
  const sequenceLoopNumber = sequenceDrill ? Math.min(sequenceProgress.repeatIndex + 1, sequenceDrill.repeatCount) : 0;
  const sequenceProgressCount = sequenceDrill
    ? sequenceProgress.repeatIndex * sequenceDrill.steps.length + Math.min(sequenceProgress.stepIndex, sequenceDrill.steps.length)
    : 0;
  const sequenceProgressTotal = sequenceDrill ? sequenceDrill.steps.length * sequenceDrill.repeatCount : 0;
  const sequenceProgressPercent = sequenceDrill && sequenceProgressTotal
    ? clamp(sequenceProgressCount / sequenceProgressTotal, 0, 1) * 100
    : 0;
  const currentModuleIndex = foundationModules.findIndex((module) =>
    module.steps.some((step) => step.id === selectedStepId),
  );
  const currentModule = currentModuleIndex >= 0 ? foundationModules[currentModuleIndex] : null;
  const overallProgress = allLessonSteps.length
    ? Math.round((completedStepIds.length / allLessonSteps.length) * 100)
    : 0;
  const checkpointFocus = checkpointTargets(selectedStep, sequenceProgress);
  const pitchZoneCents = pitchConfig.noteToleranceCents;
  const pitchReleaseCents = pitchConfig.releaseToleranceCents;
  const currentCheckpointCleared = completedStepIds.includes(selectedStepId);
  const detectedIsCorrect =
    Boolean(
      analysis.detected &&
      analysis.detected &&
      analysis.detected.swara === checkpointFocus.target.swara &&
      analysis.detected.octave === checkpointFocus.target.octave &&
      Math.abs(analysis.detected.centsOffset) <= pitchZoneCents,
    );
  const goalProgress = scoreValue != null && selectedStep
    ? clamp(scoreValue / Math.max(1, selectedStep.minimumScore), 0, 1)
    : 0;
  const dynamicSustainMs = beatsPerNote * (60 / metronomeBpm) * 1000;
  const sustainProgress =
    analysis.sustainMs != null && selectedStep
      ? clamp(analysis.sustainMs / Math.max(1, dynamicSustainMs), 0, 1)
      : 0;
  const tonicLabel = fluteProfile.tonicLabel;
  const liveTargetTitle = sequenceDrill ? sequenceDrill.title : formatTargetLabel(checkpointFocus.target);
  const sequenceCoachText = sequenceDrill
    ? `Play the phrase ${summarizeSequencePath(sequenceDrill)}. Aim for clean swara order and steadier pitch; the final phrase score matters more than exact timing.`
    : "The detector now judges the checkpoint only when note, octave, pitch band, and sustain all agree.";
  const swaraReference = swaraTargets.map((entry) => ({
    ...entry,
    frequency: targetFrequencyFor(entry, fluteProfile.saFrequency),
  }));

  // Compute dynamic scale and offset in both normal and fullscreen modes for layout choices
  const currentBoardMaxHeight = (!isLiveCardFullscreen && boardWrapperWidth > 1150) ? 610 : FLUTE_BOARD_HEIGHT;
  const maxScale = currentBoardMaxHeight / FLUTE_BOARD_HEIGHT;
  let layoutSvgScale = 1;
  if (isLiveCardFullscreen) {
    const containerHeight = typeof window !== "undefined" ? window.innerHeight - 120 : 560;
    layoutSvgScale = Math.min(boardWrapperWidth / FLUTE_BOARD_WIDTH, containerHeight / FLUTE_BOARD_HEIGHT);
  } else {
    layoutSvgScale = Math.min(boardWrapperWidth / FLUTE_BOARD_WIDTH, maxScale);
  }
  const layoutSvgRenderedWidth = FLUTE_BOARD_WIDTH * layoutSvgScale;
  const layoutSvgLeftOffset = boardWrapperWidth - layoutSvgRenderedWidth; // xMaxYMid alignment
  const layoutFirstLaneScreenX = layoutSvgLeftOffset + FLUTE_LANES[0].x * layoutSvgScale;
  // 20px gap on left, 45px gap on right (before the first lane Ga/Ma center at layoutFirstLaneScreenX)
  const computedOverlayWidth = layoutFirstLaneScreenX - 65;
  const useTwoColMetrics = computedOverlayWidth < 470;

  const layoutSvgRenderedHeight = isLiveCardFullscreen
    ? (typeof window !== "undefined" ? window.innerHeight - 120 : 560)
    : Math.min(boardWrapperWidth * (currentBoardMaxHeight / FLUTE_BOARD_WIDTH), currentBoardMaxHeight);
  const layoutFluteBodyScreenY = FLUTE_BODY_OFFSET_Y * layoutSvgScale;
  const computedOverlayHeight = isLiveCardFullscreen
    ? (typeof window !== "undefined" ? window.innerHeight - 160 : 400)
    : Math.min(layoutFluteBodyScreenY - 15, layoutSvgRenderedHeight - 15);

  // Reserve space for metric cards: 80px for 4-col row, 144px for 2-col grid (2x rows)
  const metricCardReservedHeight = useTwoColMetrics ? 144 : 80;
  // Account for non-SVG height in SignalTrace card (108px) + overlay gap (10px) + margins (30px)
  const bottomSectionHeight = sequenceDrill ? 100 : 80;
  const computedPitchTrackerHeight = isLiveCardFullscreen
    ? 340
    : Math.max(220, computedOverlayHeight - bottomSectionHeight - 48);

  return (
    <main className="shell trainer-page" style={{ width: "min(1560px, calc(100vw - 24px))", paddingTop: 20, paddingBottom: 20 }}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 180px, 0) rotate(540deg); opacity: 0; }
        }
        @keyframes confetti-pop {
          0% { transform: scale(0.65); opacity: 0; }
          20% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes modal-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes modal-scale-in {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .modal-overlay-animate {
          animation: modal-fade-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .modal-card-animate {
          animation: modal-scale-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      {celebrationPieces.length ? (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
          {celebrationPieces.map((piece) => (
            <span
              key={piece.id}
              style={{
                position: "absolute",
                top: "18%",
                left: `${piece.left}%`,
                width: 10,
                height: 16,
                borderRadius: 5,
                background: `hsl(${piece.hue} 100% 72%)`,
                boxShadow: `0 0 14px hsla(${piece.hue}, 100%, 72%, 0.9)`,
                transform: "translate3d(0, 0, 0)",
                animation: `confetti-pop 220ms ease-out ${piece.delay}ms both, confetti-fall ${piece.duration}ms ease-out ${piece.delay}ms forwards`,
                ["--drift" as string]: `${piece.drift}px`,
              }}
            />
          ))}
        </div>
      ) : null}
      {micStatusToast ? (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 10000,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 999,
            border: THEME.cardStrong.border,
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), " + THEME.background.medium + ")",
            boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
            backdropFilter: "blur(18px)",
            color: "var(--text)",
            fontSize: 13,
            fontWeight: 650,
            letterSpacing: "-0.02em",
            pointerEvents: "none",
          }}
        >
          <MicToggleIcon active={micStatusToast === "Mic unmuted"} />
          {micStatusToast}
        </div>
      ) : null}
      <div
        className="trainer-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(230px, 0.58fr) minmax(0, 2.42fr)",
          gap: 24,
          alignItems: "start",
          minHeight: "calc(100vh - 260px)",
        }}
      >
        {true && (
          <aside
            className="trainer-rail"
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignSelf: "start",
            }}
          >

            <JourneySummary
              overallProgress={overallProgress}
              completedCount={completedStepIds.length}
              totalCount={allLessonSteps.length}
              completedStepIds={completedStepIds}
              currentStepTitle={selectedStep?.title ?? "Choose a checkpoint"}
              modules={foundationModules.map((module) => ({
                id: module.id,
                title: module.title,
                description: module.description,
                steps: module.steps.map((step) => ({
                  id: step.id,
                  title: step.title,
                })),
                completedCount: module.steps.filter((step) => completedStepIds.includes(step.id)).length,
                isCurrent: module.id === currentModule?.id,
              }))}
              onSelectStep={handleSelectStep}
            />

            <div style={{ flexShrink: 0 }}>
              <SwaraReferencePanel
                tonicLabel={tonicLabel}
                registerLabel={fluteProfile.registerLabel}
                tonicFrequency={fluteProfile.saFrequency}
                profile={fluteProfile}
                rows={swaraReference}
              />
            </div>
          </aside>
        )}

        <section className="trainer-main" style={{ minWidth: 0, display: "grid", gap: 12, position: "relative", overflowX: "auto" }}>

          {checkpointNotice ? (
            <div
              className="trainer-checkpoint-notice"
              style={{
                borderRadius: 16,
                padding: "8px 16px",
                background: "rgba(46, 213, 115, 0.08)",
                border: "1px solid rgba(46, 213, 115, 0.2)",
                color: "var(--text)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 30,
                    background: "rgba(46, 213, 115, 0.15)",
                    color: "#2ed573",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#2ed573" }}></span>
                  Cleared
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {checkpointNotice.replace(/^Checkpoint cleared:\s*/i, "")}
                </div>
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 30,
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--muted)",
                  }}
                >
                  🪙 +1 Token (Total: {bonusTokens})
                </div>
              </div>
              {clearedCheckpoint?.stepId === selectedStepId ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="button button-secondary"
                    onClick={retryClearedCheckpoint}
                    style={{ padding: "6px 14px", fontSize: 13, height: "auto" }}
                  >
                    Retry
                  </button>
                  <button
                    className="button button-primary"
                    onClick={proceedToNextCheckpoint}
                    disabled={!clearedCheckpoint.nextStepId}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      height: "auto",
                      background: "linear-gradient(135deg, #2ed573 0%, #1abc9c 100%)",
                      border: "none",
                      color: "#fff",
                    }}
                  >
                    {clearedCheckpoint.nextStepId ? "Proceed to next" : "Path complete"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="trainer-stage"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <div
              className="trainer-live-card glass"
              style={{
                borderRadius: isLiveCardFullscreen ? 0 : 28,
                padding: isLiveCardFullscreen ? "12px 20px" : 16,
                background: THEME.card.bg,
                border: THEME.card.border,
                display: "grid",
                gap: isLiveCardFullscreen ? 8 : 12,
                minWidth: 880,
                ...(isLiveCardFullscreen ? {
                  position: "fixed" as const,
                  inset: 0,
                  zIndex: 9000,
                  background: THEME.background.dark,
                  height: "100dvh",
                  boxSizing: "border-box" as const,
                  overflowY: "hidden" as const,
                } : {}),
              }}
              ref={liveCardRef}
            >
              <div
                className="trainer-live-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "start",
                  flexWrap: "wrap",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    {currentModule && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                        <span>Module {currentModuleIndex + 1} of {foundationModules.length}</span>
                        {(() => {
                          const stepIdx = currentModule.steps.findIndex((s) => s.id === selectedStep.id);
                          if (stepIdx >= 0) {
                            return (
                              <>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span>Checkpoint {stepIdx + 1} of {currentModule.steps.length}</span>
                              </>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    <div style={{ fontSize: 28, fontWeight: 750, letterSpacing: "-0.05em", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      {currentModule ? (
                        <>
                          <span>{currentModule.title}</span>
                          <span style={{ opacity: 0.28, fontWeight: 400 }}>•</span>
                          <span style={{ color: THEME.text.gray }}>{liveTargetTitle}</span>
                        </>
                      ) : (
                        liveTargetTitle
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {/* Speed Configure Button & Popup */}
                  <div style={{ position: "relative" }} ref={speedRef}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setSpeedOpen((current) => !current)}
                      aria-expanded={speedOpen}
                      aria-haspopup="dialog"
                      title="Falling note speed"
                      style={{
                        minHeight: 28,
                        minWidth: 28,
                        padding: "0 8px",
                        borderRadius: 999,
                        display: "inline-flex",
                        gap: 5,
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 650,
                        background: THEME.controls.btnBg,
                        border: THEME.controls.btnBorder,
                        color: THEME.controls.btnColor,
                        cursor: "pointer",
                      }}
                    >
                      <Gauge size={13} />
                      <span>{beatsPerNote}×</span>
                    </button>

                    {speedOpen && (
                      <div
                        role="dialog"
                        aria-label="Speed settings"
                        style={{
                          position: "absolute",
                          top: 36,
                          right: 0,
                          zIndex: 100,
                          width: 250,
                          padding: 16,
                          borderRadius: 20,
                          border: "1px solid var(--border-soft)",
                          background: "var(--card)",
                          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          display: "grid",
                          gap: 14,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>Falling Speed</span>

                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>
                            <span>Beats per note</span>
                            <span style={{ color: "var(--text)", fontWeight: 700 }}>{beatsPerNote}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setBeatsPerNote((v) => Math.max(1, v - 1))}
                              style={{
                                width: 24, height: 24, borderRadius: "50%",
                                border: "1px solid var(--border-soft)",
                                background: "rgba(255,255,255,0.05)",
                                color: "var(--text)", display: "grid", placeItems: "center",
                                cursor: "pointer", fontSize: 14, fontWeight: "bold",
                              }}
                            >−</button>
                            <input
                              type="range"
                              min={1}
                              max={8}
                              step={1}
                              value={beatsPerNote}
                              onChange={(e) => setBeatsPerNote(Number(e.target.value))}
                              style={{ flex: 1, accentColor: "var(--accent)" }}
                            />
                            <button
                              type="button"
                              onClick={() => setBeatsPerNote((v) => Math.min(8, v + 1))}
                              style={{
                                width: 24, height: 24, borderRadius: "50%",
                                border: "1px solid var(--border-soft)",
                                background: "rgba(255,255,255,0.05)",
                                color: "var(--text)", display: "grid", placeItems: "center",
                                cursor: "pointer", fontSize: 14, fontWeight: "bold",
                              }}
                            >+</button>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                            <span>⚡ Faster (1)</span>
                            <span>Slower (8) 🐢</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Metronome Configure Button & Popup */}
                  <div style={{ position: "relative" }} ref={metronomeRef}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setMetronomeOpen((current) => !current)}
                      aria-expanded={metronomeOpen}
                      aria-haspopup="dialog"
                      style={{
                        minHeight: 28,
                        minWidth: 28,
                        padding: metronomeActive ? "0 10px" : 0,
                        borderRadius: 999,
                        display: "inline-flex",
                        gap: 6,
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 11.5,
                        fontWeight: 650,
                        background: metronomeActive ? "rgba(48, 209, 88, 0.15)" : THEME.controls.btnBg,
                        border: metronomeActive ? "1px solid rgba(48, 209, 88, 0.3)" : THEME.controls.btnBorder,
                        color: metronomeActive ? "var(--success)" : THEME.controls.btnColor,
                        cursor: "pointer",
                      }}
                    >
                      <Timer size={14} style={{ color: metronomeActive ? "var(--success)" : "inherit" }} />
                      {metronomeActive && (
                        <span style={{ fontSize: 9.5, opacity: 0.8, padding: "1px 4px", borderRadius: 4, background: "rgba(48, 209, 88, 0.2)", color: "var(--success)" }}>
                          {metronomeBpm}
                        </span>
                      )}
                    </button>

                    {metronomeOpen && (
                      <div
                        role="dialog"
                        aria-label="Metronome settings"
                        style={{
                          position: "absolute",
                          top: 36,
                          right: 0,
                          zIndex: 100,
                          width: 250,
                          padding: 16,
                          borderRadius: 20,
                          border: "1px solid var(--border-soft)",
                          background: "var(--card)",
                          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          display: "grid",
                          gap: 14,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>Metronome</span>
                          <button
                            type="button"
                            onClick={() => setMetronomeActive((active) => !active)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              border: "none",
                              background: metronomeActive ? "var(--danger)" : "var(--accent)",
                              color: "#fff",
                              transition: "background 0.2s",
                            }}
                          >
                            {metronomeActive ? "Stop" : "Start"}
                          </button>
                        </div>

                        {/* BPM Slider */}
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                            <span>TEMPO</span>
                            <span style={{ color: "var(--text)", fontWeight: 700 }}>{metronomeBpm} BPM</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setMetronomeBpm((bpm) => Math.max(30, bpm - 5))}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                border: "1px solid var(--border-soft)",
                                background: "rgba(255,255,255,0.05)",
                                color: "var(--text)",
                                display: "grid",
                                placeItems: "center",
                                cursor: "pointer",
                                fontSize: 14,
                                fontWeight: "bold"
                              }}
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={30}
                              max={240}
                              step={5}
                              value={metronomeBpm}
                              onChange={(e) => setMetronomeBpm(Number(e.target.value))}
                              style={{ flex: 1, accentColor: "var(--accent)" }}
                            />
                            <button
                              type="button"
                              onClick={() => setMetronomeBpm((bpm) => Math.min(240, bpm + 5))}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                border: "1px solid var(--border-soft)",
                                background: "rgba(255,255,255,0.05)",
                                color: "var(--text)",
                                display: "grid",
                                placeItems: "center",
                                cursor: "pointer",
                                fontSize: 14,
                                fontWeight: "bold"
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Beats — hidden for now; all ticks are uniform */}
                        {false && (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>
                              Beats
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
                              {[2, 3, 4, 6, 8].map((beats) => {
                                const active = metronomeBeatsPerNote === beats;
                                return (
                                  <button
                                    key={beats}
                                    type="button"
                                    onClick={() => setMetronomeBeatsPerNote(beats)}
                                    style={{
                                      height: 24,
                                      borderRadius: 6,
                                      border: "1px solid var(--border-soft)",
                                      background: active ? "var(--accent)" : "rgba(255,255,255,0.05)",
                                      color: active ? "#fff" : "var(--text)",
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {beats}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        void document.exitFullscreen();
                      } else {
                        void liveCardRef.current?.requestFullscreen?.();
                      }
                    }}
                    style={{
                      minHeight: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 650,
                      background: THEME.controls.btnBg,
                      border: THEME.controls.btnBorder,
                      color: THEME.controls.btnColor,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {isLiveCardFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    <span>{isLiveCardFullscreen ? "Exit" : "Fullscreen"}</span>
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleToggleFluteRoadLoop}
                    style={{
                      minHeight: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 650,
                      background: isFluteRoadLooping ? THEME.controls.btnActiveBg : THEME.controls.btnBg,
                      border: THEME.controls.btnBorder,
                      color: THEME.controls.btnColor,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Repeat size={12} />
                    <span>Loop</span>
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleToggleFluteRoadPause}
                    aria-label={isFluteRoadPaused ? "Resume" : "Pause"}
                    title={isFluteRoadPaused ? "Resume" : "Pause"}
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                      minHeight: 28,
                      padding: 0,
                      borderRadius: "50%",
                      background: isFluteRoadPaused ? THEME.controls.btnActiveBg : THEME.controls.btnBg,
                      border: THEME.controls.btnBorder,
                      color: THEME.controls.btnColor,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {isFluteRoadPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleRetryFluteRoad}
                    aria-label="Retry"
                    title="Retry"
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                      minHeight: 28,
                      padding: 0,
                      borderRadius: "50%",
                      background: THEME.controls.btnBg,
                      border: THEME.controls.btnBorder,
                      color: THEME.controls.btnColor,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>

                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setFluteMenuOpen((current) => !current)}
                      aria-expanded={fluteMenuOpen}
                      aria-haspopup="dialog"
                      style={{
                        minHeight: 28,
                        padding: "0 10px",
                        borderRadius: 999,
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        fontSize: 11.5,
                        fontWeight: 650,
                        background: THEME.controls.btnBg,
                        border: THEME.controls.btnBorder,
                        color: THEME.controls.btnColor,
                        cursor: "pointer",
                      }}
                    >
                      <Music size={12} />
                      <span style={{ opacity: 0.72 }}>Flute</span>
                      <span>{`${tonicLabel}-${fluteProfile.registerLabel}`}</span>
                      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" style={{ opacity: 0.8 }}>
                        <path
                          d="M11.2 2.8l2 2L6 12h-2v-2l7.2-7.2zM2 13h12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {fluteMenuOpen ? (
                      <div
                        ref={fluteMenuRef}
                        role="dialog"
                        aria-label="Flute selection"
                        style={{
                          position: "absolute",
                          top: 46,
                          right: 0,
                          zIndex: 40,
                          width: "min(380px, calc(100vw - 24px))",
                          display: "grid",
                          gap: 12,
                          borderRadius: 24,
                          padding: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(7, 14, 24, 0.96)",
                          boxShadow: "0 28px 60px rgba(0,0,0,0.45)",
                          backdropFilter: "blur(18px)",
                        }}
                      >
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                            <label className="label">
                              Tonic
                              <select
                                className="select"
                                value={selectedTonic}
                                disabled={fluteDetectOpen}
                                onChange={(event) => setSelectedTonic(event.target.value as TonicName)}
                                style={{ opacity: fluteDetectOpen ? 0.55 : 1, cursor: fluteDetectOpen ? "not-allowed" : "pointer" }}
                              >
                                {tonicOptions.map((option) => (
                                  <option key={option.tonic} value={option.tonic}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="label">
                              Register
                              <select
                                className="select"
                                value={selectedRegister}
                                disabled={fluteDetectOpen}
                                onChange={(event) => setSelectedRegister(event.target.value as FluteRegister)}
                                style={{ opacity: fluteDetectOpen ? 0.55 : 1, cursor: fluteDetectOpen ? "not-allowed" : "pointer" }}
                              >
                                {fluteRegisterOptions.map((option) => (
                                  <option key={option.register} value={option.register}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <button
                              className="button button-primary"
                              disabled={fluteDetectOpen}
                              onClick={() => {
                                setFluteMenuOpen(false);
                                setFluteDetectOpen(false);
                              }}
                              style={{ minHeight: 32, padding: "0 10px", fontSize: 12.5, opacity: fluteDetectOpen ? 0.5 : 1 }}
                            >
                              Use this flute
                            </button>
                            <span style={{ color: "var(--muted)", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em" }}>OR</span>
                            <button
                              className="button button-secondary"
                              onClick={() => setFluteDetectOpen((current) => !current)}
                              aria-expanded={fluteDetectOpen}
                              style={{ minHeight: 32, padding: "0 10px", fontSize: 12.5 }}
                            >
                              {fluteDetectOpen ? "Stop" : "Detect flute"}
                            </button>
                          </div>
                        </div>

                        {fluteDetectOpen ? (
                          <div style={{ paddingTop: 2 }}>
                            <FluteFinder
                              inline
                              autoStart
                              onDetected={(profile: FluteProfile) => {
                                setSelectedTonic(profile.tonic);
                                setSelectedRegister(profile.register);
                                setFluteMenuOpen(false);
                                setFluteDetectOpen(false);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

              </div>

              <div style={{ position: "relative", width: "100%" }} ref={boardWrapperRef}>
                <FluteRoadView
                  now={fluteViewTick}
                  startedAt={fluteViewStartedAt}
                  analysis={analysis}
                  checkpointFocus={checkpointFocus}
                  fluteRoadMode={fluteRoadMode}
                  onFluteRoadModeChange={setFluteRoadMode}
                  sequenceDrill={sequenceDrill}
                  sequenceCurrentIndex={sequenceCurrentIndex}
                  sequenceCurrentStep={sequenceCurrentStep}
                  sequenceNextStep={sequenceNextStep}
                  pitchToleranceCents={pitchZoneCents}
                  isPaused={isFluteRoadPaused}
                  onTogglePause={handleToggleFluteRoadPause}
                  onRetry={handleRetryFluteRoad}
                  isLooping={isFluteRoadLooping}
                  onToggleLoop={handleToggleFluteRoadLoop}
                  isFullscreen={isLiveCardFullscreen}
                  boardMaxHeight={currentBoardMaxHeight}
                  beatsPerNote={beatsPerNote}
                  metronomeBpm={metronomeBpm}
                />

                <div
                  className="trainer-live-pitch-overlay"
                  style={{
                    position: "absolute",
                    left: 20,
                    width: computedOverlayWidth + "px",
                    top: isLiveCardFullscreen
                      ? ((typeof window !== "undefined" ? window.innerHeight - 20 : 560) - (FLUTE_BOARD_HEIGHT * layoutSvgScale)) / 2 + 20
                      : 20,
                    bottom: isLiveCardFullscreen
                      ? (typeof window !== "undefined" ? window.innerHeight - 190 : 400) / 2 + (FLUTE_BOARD_HEIGHT / 2 - FLUTE_BODY_OFFSET_Y) * layoutSvgScale + 15
                      : layoutSvgRenderedHeight - layoutFluteBodyScreenY - 40,
                    zIndex: 10,
                    pointerEvents: "none",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "centre",
                    gap: isLiveCardFullscreen ? 16 : 10,
                    padding: "0 8px",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ pointerEvents: "auto" }}>
                    <SignalTrace
                      className="trainer-signal-trace"
                      points={analysis.trend}
                      detected={analysis.detected}
                      target={checkpointFocus.target}
                      pitchToleranceCents={pitchZoneCents}
                      pitchReleaseCents={pitchReleaseCents}
                      height={computedPitchTrackerHeight}
                      fullscreen={false}
                      running={running}
                      pitchTrendWindowMs={pitchTrendWindowMs}
                      pitchDifficulty={pitchDifficulty}
                      pitchDifficultyOptions={pitchDifficultyOptions}
                      pitchTrendWindowOptions={pitchTrendWindowOptions}
                      onPitchDifficultyChange={setPitchDifficulty}
                      onPitchTrendWindowChange={setPitchTrendWindowMs}
                      onToggleFullscreen={() => {
                        if (document.fullscreenElement) {
                          void document.exitFullscreen();
                        } else {
                          void liveCardRef.current?.requestFullscreen?.();
                        }
                      }}
                      onToggleMic={() => (running ? stopAnalysis() : void startAnalysis())}
                      sequenceDrill={sequenceDrill}
                      beatsPerNote={beatsPerNote}
                      metronomeBpm={metronomeBpm}
                      fluteViewStartedAt={fluteViewStartedAtRef.current}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 3fr",
                      gap: 12,
                      pointerEvents: "auto",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: 8,
                      }}
                    >
                      <MetricCard
                        label="Stability"
                        value={analysis.stability != null ? `${Math.round(analysis.stability)}` : null}
                        subvalue={analysis.detected ? describeStability(analysis.stability ?? 0) : "—"}
                        hint="Less wobble is better"
                        trend={analysis.trend}
                        sparkMetric="stability"
                        range={[0, 100]}
                        sparkMode="high"
                      />
                      <MetricCard
                        label="Tone clarity"
                        value={analysis.confidence != null ? `${Math.round((analysis.confidence ?? 0) * 100)}%` : null}
                        subvalue={analysis.detected ? describeConfidence(analysis.confidence ?? 0) : "—"}
                        hint="Airy vs clear tone"
                        trend={analysis.trend}
                        sparkMetric="confidence"
                        range={[0, 100]}
                        sparkMode="high"
                      />
                      <MetricCard
                        label="Noise"
                        value={analysis.noise != null ? `${Math.round(analysis.noise)}%` : null}
                        subvalue={analysis.detected ? "Lower is cleaner" : "—"}
                        hint="Background noise"
                        trend={analysis.trend}
                        sparkMetric="noise"
                        range={[0, 100]}
                        sparkMode="low"
                      />
                      <MetricCard
                        label="Blow strength"
                        value={analysis.energy != null ? `${Math.round(analysis.energy)}` : null}
                        subvalue={analysis.detected ? describeEnergy(analysis.energy ?? 0) : "—"}
                        hint="Blow strength"
                        trend={analysis.trend}
                        sparkMetric="energy"
                        range={[0, 100]}
                        sparkMode="high"
                      />
                    </div>

                    <div
                      style={{
                        position: "relative",
                        background: THEME.noteGroup.bg,
                        border: THEME.noteGroup.border,
                        borderRadius: 12,
                        padding: "5px 6px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        overflow: "hidden",
                        minHeight: 80,
                        height: "100%",
                      }}
                    >
                      {/* Top subtle gradient overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 18,
                          background: THEME.noteGroup.topOverlay,
                          pointerEvents: "none",
                          zIndex: 5,
                        }}
                      />
                      {/* Bottom subtle gradient overlay */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: 18,
                          background: THEME.noteGroup.bottomOverlay,
                          pointerEvents: "none",
                          zIndex: 5,
                        }}
                      />

                      {sequenceDrill ? (
                        <div
                          ref={headerViewportRef}
                          onScroll={handleHeaderScroll}
                          onWheel={handleUserScrollInteraction}
                          onTouchStart={handleUserScrollInteraction}
                          style={{
                            height: 130,
                            overflowY: "auto",
                            position: "relative",
                            width: "100%",
                            maskImage: "linear-gradient(to bottom, transparent, white 20%, white 80%, transparent)",
                            WebkitMaskImage: "linear-gradient(to bottom, transparent, white 20%, white 80%, transparent)",
                          }}
                          className="hide-scrollbar"
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              padding: "52px 0",
                            }}
                          >
                            {noteLines.map((line, lineIdx) => {
                              const isLineActive = lineIdx === activeLineIndex;
                              const distance = Math.abs(lineIdx - magnifiedLineIndex);

                              let lineScale = 0.88;
                              let lineOpacity = 0.70;

                              if (distance === 0) {
                                lineScale = 1.08;
                                lineOpacity = 1.0;
                              } else if (distance === 1) {
                                lineScale = 0.98;
                                lineOpacity = 0.85;
                              }

                              return (
                                <div
                                  key={lineIdx}
                                  className={isLineActive ? "active-line prompter-line" : "prompter-line"}
                                  style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    padding: "2px 7px",
                                    opacity: lineOpacity,
                                    transform: `scale(${lineScale})`,
                                    transformOrigin: "center center",
                                    transition: "opacity 0.4s cubic-bezier(0.25, 1, 0.25, 1), transform 0.4s cubic-bezier(0.25, 1, 0.25, 1)",
                                  }}
                                >
                                  {line.groups.map((group, groupIdx) => {
                                    let isGroupActive = false;
                                    let isGroupPassed = true;

                                    for (let idx = group.startIndex; idx <= group.endIndex; idx++) {
                                      const visual = sequenceVisualStates[idx];
                                      if (visual) {
                                        if (visual.isActive) isGroupActive = true;
                                        if (!visual.isPassed) isGroupPassed = false;
                                      } else {
                                        isGroupPassed = false;
                                      }
                                    }

                                    const groupStyle = isGroupPassed
                                      ? THEME.noteGroup.donePill
                                      : isGroupActive
                                        ? THEME.noteGroup.activePill
                                        : THEME.noteGroup.defaultPill;

                                    return (
                                      <div
                                        key={groupIdx}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          padding: "3px 5px",
                                          borderRadius: 8,
                                          background: groupStyle.bg,
                                          border: groupStyle.border,
                                          gap: 2,
                                          flexShrink: 0,
                                          transition: "all 0.25s ease",
                                        }}
                                      >
                                        {group.steps.map((step, stepIdx) => {
                                          const globalIdx = group.startIndex + stepIdx;
                                          const visual = sequenceVisualStates[globalIdx];
                                          const isPassed = visual ? visual.isPassed : false;
                                          const isActive = visual ? visual.isActive : false;

                                          const stepStyle = isPassed
                                            ? THEME.noteGroup.donePill
                                            : isActive
                                              ? THEME.noteGroup.activePill
                                              : THEME.noteGroup.defaultPill;

                                          const resultInfo = roadStepResults[globalIdx];
                                          const finalStatus = resultInfo?.status;
                                          const color = isPassed
                                            ? finalStatus === "green"
                                              ? "rgba(46, 213, 115, 1)"
                                              : finalStatus === "yellow"
                                                ? "rgba(255, 159, 67, 1)"
                                                : "rgba(255, 99, 99, 0.75)"
                                            : stepStyle.text;
                                          const fontWeight = isActive ? 750 : 500;
                                          const scale = isActive ? 1.1 : 1;

                                          return (
                                            <span
                                              key={`${step.target.swara}-${globalIdx}`}
                                              className={`group relative ${isActive ? "active-note" : ""}`}
                                              style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                minWidth: 16,
                                                height: 16,
                                                fontSize: 11,
                                                fontWeight,
                                                color,
                                                transform: `scale(${scale})`,
                                                transition: "all 0.2s ease",
                                                flexShrink: 0,
                                                cursor: isPassed && resultInfo ? "help" : "default",
                                              }}
                                              onMouseEnter={(e) => {
                                                if (isPassed && resultInfo) {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  setHoveredNoteTooltip({
                                                    rect,
                                                    content: (
                                                      <>
                                                        <div>Played: {resultInfo.lastDetectedSwara ? `${resultInfo.lastDetectedState === "Teevra" ? "Teevra " : resultInfo.lastDetectedState === "Komal" ? "Komal " : ""}${resultInfo.lastDetectedSwara} (${resultInfo.lastDetectedOctave})` : "None"}</div>
                                                        <div>Offset: {resultInfo.lastCentsOffset != null ? `${resultInfo.lastCentsOffset > 0 ? "+" : ""}${Math.round(resultInfo.lastCentsOffset)}¢` : "N/A"}</div>
                                                        <div style={{ marginTop: 4, fontWeight: 700, color: resultInfo.status === "green" ? "#2ed573" : resultInfo.status === "yellow" ? "#ff9f43" : "#ff4757" }}>
                                                          Accuracy: {Math.round(resultInfo.ratio * 100)}% ({((resultInfo.correctFrames * 16.67) / 1000).toFixed(2)}s / {((resultInfo.totalFrames * 16.67) / 1000).toFixed(2)}s)
                                                        </div>
                                                      </>
                                                    ),
                                                  });
                                                }
                                              }}
                                              onMouseLeave={() => setHoveredNoteTooltip(null)}
                                            >
                                              {renderSwaraGlyph(step.glyph ?? step.target.swara)}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 11.5, fontWeight: 600 }}>
                          Select an Alankar sequence to view notes
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </section>

        {showCheckpointSummaryPopup && checkpointSummaryData && (() => {
          const { poorest, primaryIssue } = analyzeCheckpointPerformance(
            checkpointSummaryData.results,
            checkpointSummaryData.step,
            pitchConfig
          );
          const minScore = Math.max(checkpointSummaryData.step.minimumScore, SEQUENCE_MIN_PRACTICE_SCORE);
          const hasRedNote = Object.values(checkpointSummaryData.results).some((res) => res.status === "red");
          const currentStepIndex = allLessonSteps.findIndex((s) => s.id === selectedStepId);
          const nextStep = currentStepIndex !== -1 ? allLessonSteps[currentStepIndex + 1] : null;
          const steps = checkpointSummaryData.step.steps;

          const trendPoints = checkpointSummaryData.trend ?? [];
          const hasTrendData = trendPoints.length >= 2;
          const firstPointTimestamp = hasTrendData ? trendPoints[0].timestamp : 0;
          const lastPointTimestamp = hasTrendData ? trendPoints[trendPoints.length - 1].timestamp : 0;
          const totalDurationMs = hasTrendData
            ? Math.max(1000, lastPointTimestamp - firstPointTimestamp)
            : Math.max(1000, checkpointSummaryData.step.steps.length * (beatsPerNote * (60 / metronomeBpm) * 1000));

          // Map scrollable width: 85px per second of duration, min 580px, max 2000px
          const scrollWidth = hasTrendData
            ? Math.min(2000, Math.max(580, Math.round((totalDurationMs / 1000) * 85)))
            : 580;

          const popupLines: Array<{
            lineIndex: number;
            groups: Array<{
              startIndex: number;
              endIndex: number;
              steps: typeof checkpointSummaryData.step.steps;
            }>;
          }> = [];
          let currentLineGroups: Array<{
            startIndex: number;
            endIndex: number;
            steps: typeof checkpointSummaryData.step.steps;
          }> = [];
          let currentGroupSteps: typeof checkpointSummaryData.step.steps = [];
          let groupStartIdx = 0;

          checkpointSummaryData.step.steps.forEach((step, idx) => {
            currentGroupSteps.push(step);
            const isLastStep = idx === checkpointSummaryData.step.steps.length - 1;
            const shouldCloseGroup = step.hasSpaceAfter || step.hasNewlineAfter || isLastStep;
            const shouldCloseLine = step.hasNewlineAfter || isLastStep;

            if (shouldCloseGroup) {
              currentLineGroups.push({
                startIndex: groupStartIdx,
                endIndex: idx,
                steps: currentGroupSteps,
              });
              currentGroupSteps = [];
              groupStartIdx = idx + 1;
            }

            if (shouldCloseLine) {
              popupLines.push({
                lineIndex: popupLines.length,
                groups: currentLineGroups,
              });
              currentLineGroups = [];
            }
          });

          return (
            <div
              className="absolute inset-0 z-[10000] flex items-center justify-center p-4 modal-overlay-animate"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(5, 10, 20, 0.88)",
                backdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10000,
              }}
            >
              <div
                className="modal-card-animate"
                style={{
                  width: "min(640px, 95vw)",
                  background: "linear-gradient(180deg, #18233c 0%, #0d1527 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 20,
                  boxShadow: "0 18px 45px rgba(0, 0, 0, 0.5)",
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  color: "#fff",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em" }}>
                      Checkpoint Complete
                    </div>
                    <h2 style={{ fontSize: "18px", fontWeight: 800, margin: "0", color: "#fff", letterSpacing: "-0.03em" }}>
                      {checkpointSummaryData.step.title}
                    </h2>
                  </div>
                </div>

                {/* Row 1: Score Card + Notes Needing Improvement */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "stretch" }}>
                  {/* Score section */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "8px 12px" }}>
                    <div
                      style={{
                        position: "relative",
                        width: 50,
                        height: 50,
                        borderRadius: 999,
                        background: checkpointSummaryData.passed
                          ? "radial-gradient(circle, rgba(46,213,115,0.15) 0%, rgba(46,213,115,0.02) 100%)"
                          : "radial-gradient(circle, rgba(255,71,87,0.15) 0%, rgba(255,71,87,0.02) 100%)",
                        border: `3px solid ${checkpointSummaryData.passed ? "rgba(46,213,115,0.25)" : "rgba(255,71,87,0.25)"}`,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <div style={{ fontSize: "18px", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.04em", color: checkpointSummaryData.passed ? "#2ed573" : "#ff4757" }}>
                        {animatedScore}
                      </div>
                      <div style={{ fontSize: "8px", fontWeight: 700, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                        / 100
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: 999,
                            fontSize: "9px",
                            fontWeight: 800,
                            background: checkpointSummaryData.passed ? "rgba(46, 213, 115, 0.14)" : "rgba(255, 71, 87, 0.14)",
                            color: checkpointSummaryData.passed ? "#2ed573" : "#ff4757"
                          }}
                        >
                          {checkpointSummaryData.passed ? "PASSED" : "FAILED"}
                        </span>
                        <span style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
                          Min ≥ {minScore}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "10.5px", lineHeight: "1.3", color: "rgba(255,255,255,0.7)" }}>
                        {checkpointSummaryData.passed
                          ? "Congratulations! You've matched the phrase contours."
                          : hasRedNote
                            ? "All notes must pass (no red notes under 30% accuracy)."
                            : `Did not pass the minimum threshold score of ${minScore}.`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Notes needing improvement (right panel of row 1) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "8px 12px" }}>
                    <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Notes Needing Improvement
                    </div>
                    {poorest.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {poorest.map((p, pIdx) => {
                          const color = p.ratio >= 0.70 ? "#2ed573" : p.ratio >= 0.30 ? "#ff9f43" : "#ff4757";
                          return (
                            <div key={pIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                              <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>• {p.key}</span>
                              <span style={{ color, fontWeight: 700, marginLeft: 8, whiteSpace: "nowrap" }}>
                                {p.totalFrames === 0 ? "Missed" : `${Math.round(p.ratio * 100)}% (${((p.correctFrames * 16.67) / 1000).toFixed(1)}s)`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "rgba(46,213,115,0.9)", fontWeight: 600 }}>✓ All notes passed!</div>
                    )}
                  </div>
                </div>

                {/* Row 2: Coaching Feedback (single row) */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", paddingTop: 1 }}>
                    Coaching:
                  </div>
                  <div style={{ fontSize: "11px", lineHeight: "1.35", color: "rgba(255,255,255,0.82)" }}>
                    {primaryIssue}
                  </div>
                </div>

                {/* Row 3: Pitch Trajectory Chart */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Pitch Trajectory (Scroll ➔)
                  </div>
                  <div
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.06)",
                      overflowX: "auto",
                    }}
                  >
                    <SignalTrace
                      points={trendPoints}
                      detected={null}
                      target={checkpointSummaryData.step.steps[0].target}
                      pitchToleranceCents={checkpointSummaryData.step.pitchToleranceCents}
                      pitchReleaseCents={checkpointSummaryData.step.pitchToleranceCents * 1.5}
                      height={200}
                      fullscreen={false}
                      running={false}
                      pitchTrendWindowMs={15000}
                      pitchDifficulty="medium"
                      pitchDifficultyOptions={[]}
                      pitchTrendWindowOptions={[]}
                      onPitchDifficultyChange={() => {}}
                      onPitchTrendWindowChange={() => {}}
                      onToggleFullscreen={() => {}}
                      onToggleMic={() => {}}
                      sequenceDrill={checkpointSummaryData.step}
                      beatsPerNote={beatsPerNote}
                      metronomeBpm={metronomeBpm}
                      fluteViewStartedAt={checkpointSummaryData.fluteViewStartedAt}
                      staticView={true}
                    />
                  </div>
                </div>


                {/* Row 4: Sequence Notes Summary */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: "9.5px", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Sequence Notes Summary
                  </div>
                  <div
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.06)",
                      padding: "6px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    {popupLines.map((line, lineIdx) => (
                      <div
                        key={lineIdx}
                        style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-start", alignItems: "center" }}
                      >
                        {line.groups.map((group, groupIdx) => {
                          let isGroupPassed = true;
                          for (let idx = group.startIndex; idx <= group.endIndex; idx++) {
                            const res = checkpointSummaryData.results[idx];
                            if (!res || res.status !== "green") isGroupPassed = false;
                          }
                          return (
                            <div
                              key={groupIdx}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "1px 4px",
                                borderRadius: 5,
                                background: isGroupPassed ? "rgba(46, 213, 115, 0.05)" : "rgba(255, 255, 255, 0.02)",
                                border: `1px solid ${isGroupPassed ? "rgba(46, 213, 115, 0.12)" : "rgba(255, 255, 255, 0.05)"}`,
                                gap: 3,
                              }}
                            >
                              {group.steps.map((step: any, stepIdx: number) => {
                                const globalIdx = group.startIndex + stepIdx;
                                const res = checkpointSummaryData.results[globalIdx];
                                const finalStatus = res?.status ?? "red";
                                const color = finalStatus === "green" ? "rgba(46, 213, 115, 1)" : finalStatus === "yellow" ? "rgba(255, 159, 67, 1)" : "rgba(255, 99, 99, 0.75)";
                                const glyph = step.glyph ?? step.target.swara;
                                return (
                                  <span
                                    key={stepIdx}
                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, fontSize: 10, fontWeight: 750, color, cursor: "help" }}
                                    onMouseEnter={(e) => {
                                      if (res) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoveredNoteTooltip({
                                          rect,
                                          content: (
                                            <>
                                              <div>Played: {res.lastDetectedSwara ? `${res.lastDetectedState === "Teevra" ? "Teevra " : res.lastDetectedState === "Komal" ? "Komal " : ""}${res.lastDetectedSwara} (${res.lastDetectedOctave})` : "None"}</div>
                                              <div>Offset: {res.lastCentsOffset != null ? `${res.lastCentsOffset > 0 ? "+" : ""}${Math.round(res.lastCentsOffset)}¢` : "N/A"}</div>
                                              <div style={{ marginTop: 4, fontWeight: 700, color }}>Accuracy: {Math.round(res.ratio * 100)}% ({((res.correctFrames * 16.67) / 1000).toFixed(2)}s / {((res.totalFrames * 16.67) / 1000).toFixed(2)}s)</div>
                                            </>
                                          ),
                                        });
                                      }
                                    }}
                                    onMouseLeave={() => setHoveredNoteTooltip(null)}
                                  >
                                    {renderSwaraGlyph(glyph)}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
                  <button
                    onClick={() => {
                      handleRetryFluteRoad();
                      setShowCheckpointSummaryPopup(false);
                    }}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: 12,
                      color: "#fff",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    className="hover:bg-white/12 active:scale-[0.98]"
                  >
                    Retry Checkpoint
                  </button>
                  {nextStep && (
                    <button
                      disabled={!checkpointSummaryData.passed}
                      onClick={() => {
                        handleSelectStep(nextStep.id);
                        setShowCheckpointSummaryPopup(false);
                      }}
                      style={{
                        background: checkpointSummaryData.passed ? "#2ed573" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${checkpointSummaryData.passed ? "rgba(46,213,115,0.15)" : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 12,
                        color: checkpointSummaryData.passed ? "#050a12" : "rgba(255,255,255,0.35)",
                        padding: "8px 16px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: checkpointSummaryData.passed ? "pointer" : "not-allowed",
                        transition: "all 0.2s ease",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      className={checkpointSummaryData.passed ? "hover:brightness-105 active:scale-[0.98]" : ""}
                    >
                      Next Checkpoint &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {typeof window !== "undefined" && hoveredNoteTooltip && createPortal(
        <div
          style={{
            position: "fixed",
            left: hoveredNoteTooltip.rect.left + hoveredNoteTooltip.rect.width / 2,
            top: hoveredNoteTooltip.rect.top - 8,
            transform: "translate(-50%, -100%)",
            background: "rgba(15, 23, 42, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
            borderRadius: 8,
            padding: "8px 10px",
            color: "#fff",
            fontSize: "10px",
            fontWeight: 500,
            lineHeight: "1.4",
            textAlign: "left",
            zIndex: 99999999,
            pointerEvents: "none",
          }}
        >
          {hoveredNoteTooltip.content}
        </div>,
        document.body
      )}
    </main>
  );
}

function renderSwaraGlyph(glyph: string) {
  const isPaMandra = glyph === "P̣" || glyph === "P\u0323" || glyph === "\u1E56";
  if (isPaMandra) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", width: "0.85em", height: "100%", verticalAlign: "middle" }}>
        <span style={{ marginTop: "-2px" }}>P</span>
        <span style={{
          position: "absolute",
          bottom: "0.5px",
          width: "2.5px",
          height: "2.5px",
          borderRadius: "50%",
          background: "currentColor",
        }} />
      </span>
    );
  }
  return glyph;
}

function MetricCard(props: {
  label: string;
  value: string | null;
  subvalue: string;
  hint: string;
  trend: TrendPoint[];
  sparkMetric: "centsOffset" | "confidence" | "noise" | "energy" | "stability" | "sustainMs" | "score";
  range: [number, number];
  sparkMode: "center" | "high" | "low";
  highlight?: boolean;
}) {
  const points = filterTrendWindow(props.trend);
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  const latestPoint = [...points].reverse().find((point) => point[props.sparkMetric] != null);
  const latestValue = latestPoint ? latestPoint[props.sparkMetric] : null;
  const normalizedValue =
    latestValue != null
      ? clamp((latestValue - props.range[0]) / (props.range[1] - props.range[0]), 0, 1) * 100
      : null;
  const showLinearMeter = props.label !== "Current checkpoint" && props.label !== "Mapped note" && props.sparkMetric !== "centsOffset";
  const showDial = props.sparkMetric === "centsOffset" && props.label === "Pitch Offset";
  const showTextDetails = props.label !== "Pitch Offset";
  const sparkline = points
    .map((point) => {
      const rawValue = point[props.sparkMetric];
      if (rawValue == null) {
        return null;
      }

      const x = clamp(1 - (latestTimestamp - point.timestamp) / TREND_WINDOW_MS, 0, 1);
      const normalized = clamp(
        (rawValue - props.range[0]) / (props.range[1] - props.range[0]),
        0,
        1,
      );
      const y = 1 - normalized;
      return { x, y, active: point.active };
    })
    .filter(Boolean) as Array<{ x: number; y: number; active: boolean }>;

  const hasCurrentReading = props.value !== null;
  const lastRecordedPoint = [...props.trend].reverse().find((point) => point[props.sparkMetric] != null);
  const lastRecordedRawValue = lastRecordedPoint ? lastRecordedPoint[props.sparkMetric] : null;

  let displayValue = props.value;
  if (!hasCurrentReading) {
    if (lastRecordedRawValue !== null) {
      if (props.sparkMetric === "confidence") {
        displayValue = `${Math.round(lastRecordedRawValue * 100)}%`;
      } else if (props.sparkMetric === "noise") {
        displayValue = `${Math.round(lastRecordedRawValue)}%`;
      } else {
        displayValue = `${Math.round(lastRecordedRawValue)}`;
      }
    } else {
      displayValue = "—";
    }
  }

  return (
    <article
      className="glass"
      style={{
        borderRadius: 12,
        padding: 10,
        position: "relative",
        overflow: "hidden",
        border: props.highlight ? "1px solid " + THEME.success.glow : undefined,
        // boxShadow: props.highlight
        //   ? "0 0 0 1px " + THEME.primary.light + " inset, 0 1px 2px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.4)"
        //   : "0 1px 2px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: hasCurrentReading ? 0.14 : 0.04, pointerEvents: "none", transition: "opacity 0.25s ease" }}>
        <Sparkline points={sparkline} mode={props.sparkMode} />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
          <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 650 }}>{props.label}</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              opacity: hasCurrentReading ? 1 : 0.35,
              filter: hasCurrentReading ? "none" : "grayscale(1)",
              transition: "opacity 0.25s ease, filter 0.25s ease",
            }}
          >
            {displayValue}
          </div>
        </div>
        {showDial ? (
          <PitchOffsetDial value={latestValue as number | null} />
        ) : showLinearMeter ? (
          <div
            style={{
              marginTop: 10,
              height: 10,
              borderRadius: 999,
              background: THEME.metrics.barBg,
              overflow: "hidden",
              position: "relative",
              opacity: hasCurrentReading ? 1 : 0.3,
              filter: hasCurrentReading ? "none" : "grayscale(1)",
              transition: "opacity 0.25s ease, filter 0.25s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  props.sparkMetric === "noise"
                    ? THEME.metrics.noiseBar
                    : THEME.metrics.defaultBar,
                opacity: 0.45,
              }}
            />
            {normalizedValue != null ? (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: `${100 - normalizedValue}%`,
                  borderRadius: 999,
                  background:
                    props.sparkMetric === "noise"
                      ? THEME.metrics.noiseFill
                      : THEME.metrics.defaultFill,
                  boxShadow: THEME.metrics.barShadow,
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function JourneySummary(props: {
  overallProgress: number;
  completedCount: number;
  totalCount: number;
  completedStepIds: string[];
  currentStepTitle: string;
  modules: Array<{
    id: string;
    title: string;
    description: string;
    steps: Array<{ id: string; title: string }>;
    completedCount: number;
    isCurrent: boolean;
  }>;
  onSelectStep?: (stepId: string) => void;
}) {
  return (
    <div
      className="glass"
      style={{
        borderRadius: 24,
        padding: 14,
        background: THEME.card.bg,
        border: THEME.card.border,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: 520,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 99, background: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Practice map</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-0.05em" }}>{props.overallProgress}%</div>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>
          {props.completedCount} of {props.totalCount} checkpoints cleared
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", flexShrink: 0 }}>
        <div
          style={{
            width: `${clamp(props.overallProgress, 0, 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
          }}
        />
      </div>

      <div
        style={{
          overflowY: "auto",
          flex: "1 1 0%",
          minHeight: 0,
          paddingRight: 4,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          {props.modules.map((module) => (
            <details
              key={module.id}
              open={module.isCurrent}
              style={{
                borderRadius: 18,
                border: module.isCurrent
                  ? THEME.practiceMap.moduleCurrent.border
                  : THEME.practiceMap.moduleDefault.border,
                boxShadow: module.isCurrent
                  ? THEME.practiceMap.moduleCurrent.boxShadow
                  : undefined,
                background: module.isCurrent
                  ? THEME.practiceMap.moduleCurrent.background
                  : THEME.practiceMap.moduleDefault.background,
                overflow: "hidden",
              }}
            >
              <summary style={{ cursor: "pointer", listStyle: "none", padding: 12 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="pill" style={{ padding: "5px 10px", fontSize: 10.5 }}>
                          {props.modules.findIndex((entry) => entry.id === module.id) + 1}
                        </span>
                        <span
                          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.03em" }}
                          title={module.description}
                        >
                          {module.title}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>
                        {module.completedCount}/{module.steps.length} cleared
                      </div>
                      {module.isCurrent ? (
                        <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.45, maxWidth: 320 }}>
                          {module.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${module.steps.length ? (module.completedCount / module.steps.length) * 100 : 0}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: module.isCurrent
                          ? "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))"
                          : "linear-gradient(90deg, rgba(255,99,99,0.72), rgba(117,184,255,0.88))",
                      }}
                    />
                  </div>
                </div>
              </summary>
              <div style={{ padding: "0 12px 12px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {module.steps.map((step) => {
                    const isDone = props.completedStepIds.includes(step.id);
                    const isCurrentStep = module.isCurrent && step.title === props.currentStepTitle;
                    const tone = isCurrentStep ? "current" : isDone ? "done" : "upcoming";

                    const pillStyle =
                      tone === "current"
                        ? THEME.practiceMap.pillCurrent
                        : tone === "done"
                          ? THEME.practiceMap.pillDone
                          : THEME.practiceMap.pillDefault;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => props.onSelectStep?.(step.id)}
                        className="pill"
                        style={{
                          padding: "6px 10px",
                          fontSize: 10.5,
                          background: pillStyle.bg,
                          border: pillStyle.border,
                          color: pillStyle.color,
                          cursor: "pointer",
                          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                          outline: "none",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = "brightness(1.18)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = "none";
                          e.currentTarget.style.transform = "none";
                        }}
                      >
                        <span style={{ color: pillStyle.dot, marginRight: 4, fontWeight: 800 }}>
                          {isDone ? "✓ " : "• "}
                        </span>
                        {step.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function JourneyTile(props: { label: string; title: string; detail: string; tone: "muted" | "accent" | "success" }) {
  const tileStyle =
    props.tone === "accent"
      ? THEME.journey.accent
      : props.tone === "success"
        ? THEME.journey.success
        : THEME.journey.muted;

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: tileStyle.border,
        background: tileStyle.bg,
        display: "grid",
        gap: 6,
        minHeight: 92,
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 11.5, letterSpacing: "0.02em" }}>{props.label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{props.title}</div>
      <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.35 }}>{props.detail}</div>
    </div>
  );
}

function LiveStat(props: { label: string; value: string; detail?: string; background?: string }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: THEME.statsCard.border,
        background: props.background ?? THEME.statsCard.bg,
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em" }}>{props.value}</div>
      {props.detail ? (
        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.35 }}>{props.detail}</div>
      ) : null}
    </div>
  );
}

function PitchOffsetDial(props: { value: number | null }) {
  const value = props.value ?? 0;
  const clamped = clamp(value, -60, 60);
  const angle = (clamped / 60) * 75;
  const tickMarks = [-40, -20, 0, 20, 40];

  return (
    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
      <div style={{ position: "relative", height: 44 }}>
        <svg viewBox="0 0 180 90" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient id="offsetDial" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,99,99,0.85)" />
              <stop offset="50%" stopColor="rgba(103,240,202,0.9)" />
              <stop offset="100%" stopColor="rgba(255,99,99,0.85)" />
            </linearGradient>
          </defs>
          <path
            d="M 26 72 A 64 64 0 0 1 154 72"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 26 72 A 64 64 0 0 1 154 72"
            fill="none"
            stroke="url(#offsetDial)"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.72"
          />
          {tickMarks.map((tick) => {
            const tickAngle = ((tick / 60) * 75 * Math.PI) / 180;
            const outer = { x: 90 + Math.cos(tickAngle) * 60, y: 72 + Math.sin(tickAngle) * 60 };
            const inner = { x: 90 + Math.cos(tickAngle) * 52, y: 72 + Math.sin(tickAngle) * 52 };
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(255,255,255,0.42)"
                strokeWidth="1.5"
              />
            );
          })}
          <g transform={`rotate(${angle} 90 72)`}>
            <line x1="90" y1="72" x2="90" y2="24" stroke="rgba(255,255,255,0.96)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="90" y1="72" x2="90" y2="29" stroke="rgba(255,255,255,0.38)" strokeWidth="6" strokeLinecap="round" />
          </g>
          <circle cx="90" cy="72" r="4.5" fill="rgba(255,255,255,0.96)" />
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 11.5 }}>
        <span>-60¢</span>
        <span>0¢</span>
        <span>+60¢</span>
      </div>
    </div>
  );
}

function MiniProgressPanel(props: {
  label: string;
  value: string;
  caption: string;
  progress: number;
  target: number | null;
  active: boolean;
  mode: "goal" | "sustain";
}) {
  const bounded = clamp(props.progress, 0, 100);
  const complete = bounded >= 96;
  const background = THEME.attemptCard.bg;
  const border = props.active
    ? complete
      ? THEME.attemptCard.border.success
      : bounded >= 60
        ? THEME.attemptCard.border.warning
        : THEME.attemptCard.border.danger
    : THEME.attemptCard.border.default;

  const fill = props.active
    ? complete
      ? THEME.attemptCard.fill.success
      : bounded >= 60
        ? THEME.attemptCard.fill.warning
        : THEME.attemptCard.fill.danger
    : THEME.attemptCard.fill.default;

  const shadowColor = props.active
    ? complete
      ? THEME.success.glow
      : bounded >= 60
        ? THEME.primary.glow
        : THEME.danger.glow
    : "none";

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border,
        background,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>{props.label}</div>
        {props.target != null ? (
          <div className="pill" style={{ padding: "4px 10px", fontSize: 10.5 }}>
            Target {props.mode === "sustain" ? `${(props.target / 1000).toFixed(1)}s` : props.target}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em" }}>{props.value}</div>
      <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>{props.caption}</div>
      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 999,
          background: THEME.metrics.barBg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${bounded}%`,
            height: "100%",
            borderRadius: 999,
            background: fill,
            boxShadow: bounded > 0 ? `0 0 18px ${shadowColor}` : "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
            opacity: 0.4,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function SwaraReferencePanel(props: {
  tonicLabel: string;
  registerLabel: string;
  tonicFrequency: number;
  profile: FluteProfile;
  rows: Array<SwaraTarget & { frequency: number }>;
}) {
  const swaraOrder: SwaraTarget["swara"][] = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni"];
  const octaveOrder: SwaraTarget["octave"][] = ["Mandra", "Madhya", "Taar"];
  const rowsByKey = new Map(props.rows.map((row) => [`${row.swara}-${row.octave}`, row] as const));

  return (
    <details
      className="glass"
      style={{
        borderRadius: 24,
        padding: 14,
        background: THEME.card.bg,
        border: THEME.card.border,
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 16, borderRadius: 99, background: "var(--accent)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Swara reference</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {props.tonicLabel} {props.registerLabel} Frequency Map
            </div>
          </div>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>Open</span>
        </div>
      </summary>

      <div style={{ marginTop: 12 }}>
        <table
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 11.5,
          }}
        >
          <thead>
            <tr>
              {["Swara", "Western", "Mandra", "Madhya", "Taar"].map((heading, index) => (
                <th
                  key={heading}
                  style={{
                    width: ["16%", "20%", "21%", "21%", "22%"][index],
                    textAlign: "left",
                    padding: "8px 8px 8px 6px",
                    color: "var(--muted)",
                    fontWeight: 600,
                    fontSize: 10.5,
                    textTransform: "none",
                    letterSpacing: "0.06em",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    borderRight: index < 4 ? "1px solid rgba(255,255,255,0.08)" : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {swaraOrder.map((swara) => {
              const westernNote = westernNoteForSwara({ swara, octave: "Madhya" }, props.tonicFrequency);

              return (
                <tr key={swara}>
                  <td
                    style={{
                      padding: "8px 8px 8px 6px",
                      fontWeight: 700,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {swara}
                  </td>
                  <td
                    style={{
                      padding: "8px 8px 8px 6px",
                      color: "var(--muted)",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {westernNote}
                  </td>
                  {octaveOrder.map((octave, octIdx) => {
                    const row = rowsByKey.get(`${swara}-${octave}`);
                    const playable = row ? isPlayableSwaraForProfile(props.profile, row) : false;

                    return (
                      <td
                        key={octave}
                        style={{
                          padding: "8px 8px 8px 6px",
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          borderRight: octIdx < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                          color: row && playable ? "var(--text)" : "var(--muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row && playable ? `${Math.round(row.frequency)} Hz` : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8, display: "grid", gap: 6, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.45 }}>
          <div>A=440 Hz*  | dash(—) : not practical</div>
        </div>
      </div>
    </details>
  );
}

function Sparkline(props: { points: Array<{ x: number; y: number; active: boolean }>; mode: "center" | "high" | "low" }) {
  const width = 220;
  const height = 64;
  const path = props.points
    .map((point) => `${12 + point.x * (width - 24)},${8 + point.y * (height - 16)}`)
    .join(" ");

  const bandStyle = props.mode === "center"
    ? { top: "36%", middle: "28%", bottom: "36%" }
    : props.mode === "high"
      ? { top: "30%", middle: "30%", bottom: "40%" }
      : { top: "40%", middle: "30%", bottom: "30%" };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" aria-hidden="true">
      <rect x="0" y="0" width={width} height={height * parseFloat(bandStyle.top)} fill="rgba(255, 99, 99, 0.08)" />
      <rect
        x="0"
        y={height * parseFloat(bandStyle.top)}
        width={width}
        height={height * parseFloat(bandStyle.middle)}
        fill="rgba(103,240,202,0.08)"
      />
      <rect
        x="0"
        y={height * (parseFloat(bandStyle.top) + parseFloat(bandStyle.middle))}
        width={width}
        height={height * parseFloat(bandStyle.bottom)}
        fill="rgba(255, 189, 89, 0.08)"
      />
      <defs>
        <linearGradient id="cardSpark" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(117,184,255,0.95)" />
          <stop offset="100%" stopColor="rgba(103,240,202,0.95)" />
        </linearGradient>
      </defs>
      <polyline
        points={path}
        fill="none"
        stroke="url(#cardSpark)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
      {props.points.map((point, index) => (
        <circle
          key={index}
          cx={12 + point.x * (width - 24)}
          cy={8 + point.y * (height - 16)}
          r={point.active ? 2.6 : 1.9}
          fill="rgba(255,255,255,0.95)"
          opacity={point.active ? 0.75 : 0.3}
        />
      ))}
    </svg>
  );
}

function JourneyRibbon(props: {
  currentModule: { title: string; description: string; steps: Array<{ title: string; id: string }> } | null;
  currentStep: { title: string; coaching: string; id: string } | undefined;
  nextSteps: Array<{ title: string; id: string }>;
  nextModules: Array<{ title: string; description: string; id: string }>;
  completed: number;
  total: number;
  progress: number;
}) {
  return (
    <div
      className="glass"
      style={{
        borderRadius: 24,
        padding: 12,
        display: "grid",
        gap: 10,
        background: THEME.card.bg,
        border: THEME.card.border,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "1 1 220px" }}>
          <div className="pill">Progress overview</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em" }}>
            {props.progress}% complete
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>
            {props.completed} of {props.total} checkpoints cleared
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignSelf: "center" }}>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
            {props.currentModule?.title ?? "Foundation"}
          </span>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
            Step {props.currentStep?.title ?? "Center your first Sa"}
          </span>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
            Next {props.nextSteps[0]?.title ?? "Keep moving"}
          </span>
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: THEME.journey.barBg, overflow: "hidden" }}>
        <div
          style={{
            width: `${clamp(props.progress, 0, 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: THEME.journey.barFill,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted)", fontSize: 12.5 }}>
        <span>{props.currentModule?.description ?? "Start with the first breath and clean Sa."}</span>
        <span>•</span>
        <span>
          Next modules:{" "}
          {props.nextModules.length ? props.nextModules.map((module) => module.title).join(" · ") : "None"}
        </span>
      </div>
    </div>
  );
}

const SWARA_BASE_COLORS: Record<string, string> = {
  Sa: "#ff6d6d",
  Re: "#ff9f43",
  Ga: "#e8d34e",
  Ma: "#69d48a",
  Pa: "#59cfd6",
  Dha: "#6f9dff",
  Ni: "#d47bff",
};

/** Returns the Unicode combining diacritic for the given octave.
 *  Taar → combining dot above (U+0307)
 *  Mandra → combining dot below (U+0323)
 *  Madhya → empty string (no mark)
 */
function octaveSymbol(octave: string | null) {
  if (octave === "Mandra") return "\u0323"; // combining dot below  e.g. Ṣ
  if (octave === "Taar") return "\u0307";   // combining dot above   e.g. Ṡ
  return "";
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(a: string, b: string, ratio: number) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const mix = (start: number, end: number) => Math.round(start + (end - start) * ratio);
  return `#${[mix(left.r, right.r), mix(left.g, right.g), mix(left.b, right.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function noteVisual(swara: string | null, octave: string | null) {
  const baseHex = SWARA_BASE_COLORS[swara ?? "Sa"] ?? SWARA_BASE_COLORS.Sa;
  const tint = octave === "Taar"
    ? mixHex(baseHex, "#ffffff", 0.25)
    : octave === "Mandra"
      ? mixHex(baseHex, "#000000", 0.12)
      : baseHex;
  const fillAlpha = 0.96;
  const strokeAlpha = 0.98;
  const bandAlpha = octave === "Taar" ? 0.22 : octave === "Mandra" ? 0.14 : 0.18;

  return {
    fill: rgba(tint, fillAlpha),
    stroke: rgba(tint, strokeAlpha),
    band: rgba(tint, bandAlpha),
  };
}

function compactNoteLabel(swara: string, octave: string | null) {
  const head = swara.charAt(0);
  const dot = octaveSymbol(octave);
  // Combine dot diacritic directly onto the head letter then NFC-normalize.
  return dot ? (head + dot).normalize("NFC") : head;
}

function formatPitchWindowLabel(windowMs: number) {
  return `${windowMs / 1000}s`;
}

function SignalTrace(props: {
  className?: string;
  points: TrendPoint[];
  detected: DetectedSwara | null;
  target: SwaraTarget;
  pitchToleranceCents: number;
  pitchReleaseCents: number;
  height?: number;
  fullscreen: boolean;
  running: boolean;
  pitchTrendWindowMs: number;
  pitchDifficulty: PitchDifficulty;
  pitchDifficultyOptions: Array<{ value: PitchDifficulty; label: string; description: string }>;
  pitchTrendWindowOptions: Array<{ value: PitchTrendWindowMs; label: string; description: string }>;
  onPitchDifficultyChange: (value: PitchDifficulty) => void;
  onPitchTrendWindowChange: (value: PitchTrendWindowMs) => void;
  onToggleFullscreen: () => void;
  onToggleMic: () => void;
  sequenceDrill?: SequenceLessonStep | null;
  beatsPerNote?: number;
  metronomeBpm?: number;
  fluteViewStartedAt?: number;
  staticView?: boolean;
}) {
  const width = props.fullscreen ? 1440 : 860;
  const height = props.height ?? (props.fullscreen ? 420 : 132);
  const [segmentationEnabled, setSegmentationEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsOpen]);

  const minCents = -60;
  const maxCents = 60;
  const usableWidth = width - 24;
  const leftPad = 12;
  const points = props.staticView
    ? props.points
    : filterTrendWindow(props.points, props.pitchTrendWindowMs as PitchTrendWindowMs);
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  const traceSilenceGapMs = 2000;

  // Calculate target note timeline segments at the bottom
  const targetNoteBands: Array<{
    swara: string;
    octave: string;
    startX: number;
    endX: number;
    color: ReturnType<typeof noteVisual>;
  }> = [];

  if (props.sequenceDrill && props.beatsPerNote && props.metronomeBpm && props.fluteViewStartedAt) {
    const dynamicSustainMs = props.beatsPerNote * (60 / props.metronomeBpm) * 1000;
    const countdownDelayMs = (60 / props.metronomeBpm) * 1000;
    const TILE_PX_PER_MS = 0.10;
    const SPAWN_MARGIN = 58;

    const countdownHeight = Math.max(40, Math.round(countdownDelayMs * TILE_PX_PER_MS));
    const countdownSpawnY = -countdownHeight - SPAWN_MARGIN;
    const countdownMsToFlute = Math.round((515 - countdownSpawnY) / TILE_PX_PER_MS);

    const noteHeight = Math.round(dynamicSustainMs * TILE_PX_PER_MS);
    const noteSpawnY = -noteHeight - SPAWN_MARGIN;
    const noteMsToFlute = Math.round((515 - noteSpawnY) / TILE_PX_PER_MS);

    const firstNoteArrivalAt = props.fluteViewStartedAt + countdownMsToFlute + 2 * countdownDelayMs + dynamicSustainMs;
    let noteCursor = firstNoteArrivalAt - noteMsToFlute;

    props.sequenceDrill.steps.forEach((step) => {
      const timeArrivalTrailing = noteCursor + noteMsToFlute;
      const timeArrivalLeading = timeArrivalTrailing - dynamicSustainMs;

      noteCursor += dynamicSustainMs + (step.hasSpaceAfter ? countdownDelayMs : 0);

      const getX = (t: number) => {
        return leftPad + clamp(1 - (latestTimestamp - t) / props.pitchTrendWindowMs, 0, 1) * usableWidth;
      };

      const startX = getX(timeArrivalLeading);
      const endX = getX(timeArrivalTrailing);

      if (endX > 0 && startX < width) {
        targetNoteBands.push({
          swara: step.glyph ?? step.target.swara,
          octave: step.target.octave,
          startX,
          endX,
          color: noteVisual(step.target.swara, step.target.octave),
        });
      }
    });
  }
  const traceResampleStepPx = props.fullscreen ? 2.4 : 3.4;
  const centsToY = (cents: number) => height - 24 - clamp((cents - minCents) / (maxCents - minCents), 0, 1) * (height - 48);
  const highReleaseY = centsToY(props.pitchReleaseCents);
  const highLockY = centsToY(props.pitchToleranceCents);
  const lowLockY = centsToY(-props.pitchToleranceCents);
  const lowReleaseY = centsToY(-props.pitchReleaseCents);
  const centerY = centsToY(0);

  const tracePoints = points
    .map((point) => {
      if (point.centsOffset == null) return null;
      const x = leftPad + clamp(1 - (latestTimestamp - point.timestamp) / props.pitchTrendWindowMs, 0, 1) * usableWidth;
      const normalized = clamp((point.centsOffset - minCents) / (maxCents - minCents), 0, 1);
      const y = height - 24 - normalized * (height - 48);
      return {
        x,
        y,
        active: point.active,
        swara: point.swara,
        octave: point.octave,
        timestamp: point.timestamp,
      };
    })
    .filter(Boolean) as Array<{
      x: number;
      y: number;
      active: boolean;
      swara: string | null;
      octave: string | null;
      timestamp: number;
    }>;

  type Segment = {
    points: Array<{ x: number; y: number }>;
    swara: string | null;
    octave: string | null;
    startTime: number;
    endTime: number;
  };
  const segments: Segment[] = [];
  let currentSegment: Segment | null = null;
  let previousActiveTimestamp: number | null = null;
  for (const pt of tracePoints) {
    if (!pt.active || pt.swara == null) {
      currentSegment = null;
      previousActiveTimestamp = null;
      continue;
    }

    const shouldStartNewSegment =
      currentSegment == null ||
      currentSegment.swara !== pt.swara ||
      currentSegment.octave !== pt.octave ||
      (previousActiveTimestamp != null && pt.timestamp - previousActiveTimestamp > traceSilenceGapMs);

    if (shouldStartNewSegment) {
      const nextSegment: Segment = {
        points: [{ x: pt.x, y: pt.y }],
        swara: pt.swara,
        octave: pt.octave,
        startTime: pt.timestamp,
        endTime: pt.timestamp,
      };
      segments.push(nextSegment);
      currentSegment = nextSegment;
    } else {
      currentSegment!.points.push({ x: pt.x, y: pt.y });
      currentSegment!.endTime = pt.timestamp;
    }

    previousActiveTimestamp = pt.timestamp;
  }

  const latest = [...points].reverse().find((point) => point.centsOffset != null);

  type NoteBand = {
    key: string;
    swara: string;
    octave: string | null;
    startX: number;
    endX: number;
    startTime: number;
    endTime: number;
    color: ReturnType<typeof noteVisual>;
  };

  const noteBands: NoteBand[] = [];
  const sectionGapMs = props.fullscreen ? 280 : 420;
  const minBandDurationMs = props.fullscreen ? 70 : 160;

  const activeCurvePoints = tracePoints.filter((pt) => pt.active && pt.swara);

  for (const pt of activeCurvePoints) {
    const swara = pt.swara ?? "Sa";
    const octave = pt.octave ?? "Madhya";
    const key = `${swara}-${octave}`;
    const color = noteVisual(swara, octave);
    const existing = noteBands.at(-1);

    if (existing && existing.key === key && pt.timestamp - existing.endTime <= sectionGapMs) {
      existing.endX = pt.x;
      existing.endTime = pt.timestamp;
      existing.color = color;
      continue;
    }

    noteBands.push({
      key,
      swara,
      octave,
      startX: pt.x,
      endX: pt.x,
      startTime: pt.timestamp,
      endTime: pt.timestamp,
      color,
    });
  }

  const mergedNoteBands: NoteBand[] = [];
  for (const band of noteBands) {
    const prev = mergedNoteBands.at(-1);
    if (prev && prev.key === band.key && band.startTime - prev.endTime <= sectionGapMs) {
      prev.endX = band.endX;
      prev.endTime = band.endTime;
      prev.color = band.color;
    } else {
      mergedNoteBands.push({ ...band });
    }
  }

  const visibleNoteBands = mergedNoteBands.filter((band) => band.endTime - band.startTime >= minBandDurationMs);
  const labelThresholdPx = props.pitchTrendWindowMs === 5000 ? 24 : props.pitchTrendWindowMs === 15000 ? 36 : 46;
  const noteLegend = Array.from(
    new Map(
      ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni"].map((swara) => [
        swara,
        { swara, color: noteVisual(swara, "Madhya") },
      ]),
    ).values(),
  );

  if (props.staticView) {
    // Trim leading silence: start from the first point with actual pitch data
    const staticPoints = props.points;
    const firstPitchedIdx = staticPoints.findIndex(p => p.centsOffset != null);
    // If no pitch data at all, fall back to full array (will show empty state)
    const trimmedPoints = firstPitchedIdx > 0 ? staticPoints.slice(firstPitchedIdx) : staticPoints;
    const firstTs = trimmedPoints[0]?.timestamp ?? 0;
    const lastTs = trimmedPoints[trimmedPoints.length - 1]?.timestamp ?? (firstTs + 1000);
    const totalMs = Math.max(1000, lastTs - firstTs);

    // 80px per second → ~8 seconds visible in a 640px container
    const PX_PER_SEC = 80;
    const svgW = Math.max(640, Math.round((totalMs / 1000) * PX_PER_SEC));
    // SVG height excludes the bottom label strip — label strip lives in the container below SVG
    const tracePadB = 30; // bottom strip height (target note line + labels) inside the SVG
    const svgH = height;
    const padL = 14;
    const padR = 10;
    const usableW = svgW - padL - padR;

    // Direct linear timestamp → X mapping
    const tsToX = (ts: number) => padL + ((ts - firstTs) / totalMs) * usableW;

    // Match live-view centsToY EXACTLY: height - 24 - clamp(...) * (height - 48)
    // but we reserve the bottom tracePadB for the target note strip
    const traceH = svgH - tracePadB; // usable trace area
    const centsToYStatic = (cents: number) =>
      traceH - 24 - clamp((cents - minCents) / (maxCents - minCents), 0, 1) * (traceH - 48);

    const centerYS = centsToYStatic(0);
    const highLockYS = centsToYStatic(props.pitchToleranceCents);
    const lowLockYS = centsToYStatic(-props.pitchToleranceCents);
    const highRelYS = centsToYStatic(props.pitchReleaseCents);
    const lowRelYS = centsToYStatic(-props.pitchReleaseCents);

    // Build trace segments + played-note bands
    type StaticSeg = { points: { x: number; y: number }[]; swara: string; octave: string | null };
    const staticSegs: StaticSeg[] = [];
    let curSeg: StaticSeg | null = null;

    type StaticBand = { swara: string; octave: string | null; x1: number; x2: number };
    const staticBands: StaticBand[] = [];
    let curBand: StaticBand | null = null;

    for (const pt of trimmedPoints) {
      if (pt.centsOffset == null) {
        curSeg = null;
        if (pt.swara == null) curBand = null;
        continue;
      }
      const x = tsToX(pt.timestamp);
      const y = centsToYStatic(pt.centsOffset);

      const segSwara = pt.swara ?? "?";
      const segOctave = pt.octave ?? null;
      if (!curSeg || curSeg.swara !== segSwara || curSeg.octave !== segOctave) {
        curSeg = { points: [], swara: segSwara, octave: segOctave };
        staticSegs.push(curSeg);
      }
      curSeg.points.push({ x, y });

      if (pt.active && pt.swara != null) {
        if (!curBand || curBand.swara !== pt.swara || curBand.octave !== pt.octave) {
          curBand = { swara: pt.swara, octave: pt.octave ?? null, x1: x, x2: x };
          staticBands.push(curBand);
        } else {
          curBand.x2 = x;
        }
      }
    }

    // Target note reference line — derived directly from played staticBands (swara transitions)
    // Each band represents when that swara was active → use same color + label at bottom strip
    type TargetNoteLine = { swara: string; octave: string | null; x1: number; x2: number; col: ReturnType<typeof noteVisual> };
    const targetNoteLines: TargetNoteLine[] = staticBands.map(band => ({
      swara: band.swara,
      octave: band.octave,
      x1: band.x1,
      x2: band.x2,
      col: noteVisual(band.swara, band.octave),
    }));

    // Time ticks every 5 seconds
    const tickEveryMs = 5000;
    const tickCount = Math.floor(totalMs / tickEveryMs);
    const timeTicks: { x: number; label: string }[] = [{ x: tsToX(firstTs), label: "0s" }];
    for (let i = 1; i <= tickCount; i++) {
      const ms = i * tickEveryMs;
      timeTicks.push({ x: tsToX(firstTs + ms), label: `+${ms / 1000}s` });
    }

    const targetLineY = traceH + 5;  // just below the trace area
    const targetTextY = svgH - 5;    // at the very bottom

    return (
      // overflowX: scroll = scrollbar always visible; paddingBottom reserves space above scrollbar
      <div style={{ width: "100%", overflowX: "scroll", borderRadius: 14, paddingBottom: 2 }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: "block", minWidth: "100%" }}
          aria-hidden="true"
        >
          {/* Background zones — clipped to the trace area (0..traceH) */}
          <rect x={0} y={highRelYS} width={svgW} height={Math.max(0, highLockYS - highRelYS)} fill={THEME.pitch.releaseZone} />
          <rect x={0} y={lowLockYS} width={svgW} height={Math.max(0, lowRelYS - lowLockYS)} fill={THEME.pitch.releaseZone} />
          <rect x={0} y={highLockYS} width={svgW} height={Math.max(0, lowLockYS - highLockYS)} fill={THEME.pitch.targetZone} />

          {/* Played-note background columns */}
          {staticBands.map((band, idx) => {
            const col = noteVisual(band.swara, band.octave);
            const bw = Math.max(0, band.x2 - band.x1);
            return (
              <rect
                key={idx}
                x={band.x1}
                y={20}
                width={bw}
                height={traceH - 20}
                rx={5}
                fill={col.band}
                stroke={col.stroke}
                strokeWidth={0.7}
                opacity={0.22}
              />
            );
          })}

          {/* Grid lines */}
          <line x1={padL} y1={centerYS} x2={svgW - padR} y2={centerYS} stroke={THEME.pitch.gridLine} strokeWidth={1} strokeDasharray="5 7" />
          <line x1={padL} y1={highLockYS} x2={svgW - padR} y2={highLockYS} stroke={THEME.pitch.gridLine} strokeWidth={0.8} strokeDasharray="3 5" />
          <line x1={padL} y1={lowLockYS} x2={svgW - padR} y2={lowLockYS} stroke={THEME.pitch.gridLine} strokeWidth={0.8} strokeDasharray="3 5" />

          {/* Pitch trace */}
          {staticSegs.map((seg, idx) => {
            if (seg.points.length < 2) return null;
            const d = seg.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
            const col = noteVisual(seg.swara, seg.octave);
            return (
              <path
                key={idx}
                d={d}
                fill="none"
                stroke={col.stroke}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 3px ${col.stroke})` }}
              />
            );
          })}

          {/* Played-note labels (top of band) */}
          {staticBands.map((band, idx) => {
            const bw = band.x2 - band.x1;
            if (bw < 20) return null;
            const col = noteVisual(band.swara, band.octave);
            return (
              <text key={idx} x={band.x1 + bw / 2} y={34} fill={col.stroke} fontSize="11" fontWeight="800" textAnchor="middle" opacity={0.85}>
                {band.swara}
              </text>
            );
          })}

          {/* Cents labels */}
          <text x={svgW - padR - 2} y={highLockYS - 4} fill={THEME.pitch.axisLabel} fontSize="9" textAnchor="end">+{props.pitchToleranceCents}¢</text>
          <text x={svgW - padR - 2} y={lowLockYS + 10} fill={THEME.pitch.axisLabel} fontSize="9" textAnchor="end">-{props.pitchToleranceCents}¢</text>

          {/* Target note lines at bottom */}
          {targetNoteLines.map((tn, idx) => {
            const bw = tn.x2 - tn.x1;
            const isMandra = tn.octave === "Mandra" || tn.swara.includes("\u0323") || tn.swara.includes("̣");
            const displaySwara = isMandra ? tn.swara.replace(/[\u0323̣]/g, "") : tn.swara;
            return (
              <g key={`tn-${idx}`}>
                <line
                  x1={tn.x1} y1={targetLineY}
                  x2={tn.x2} y2={targetLineY}
                  stroke={tn.col.stroke}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.85}
                />
                {bw > 16 && (
                  <>
                    <text
                      x={tn.x1 + bw / 2} y={targetTextY}
                      fill={tn.col.stroke}
                      fontSize="9" fontWeight="800" textAnchor="middle"
                      style={{ textShadow: "0px 1px 2px rgba(0,0,0,0.9)" }}
                    >
                      {displaySwara}
                    </text>
                    {isMandra && (
                      <circle cx={tn.x1 + bw / 2} cy={targetTextY + 2.5} r={1.1} fill={tn.col.stroke} />
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Time ticks */}
          {timeTicks.map((tick, idx) => (
            <g key={idx}>
              <line x1={tick.x} y1={targetLineY - 2} x2={tick.x} y2={targetLineY + 2} stroke={THEME.pitch.gridLine} strokeWidth={1} opacity={0.5} />
              <text x={tick.x} y={targetTextY} fill={THEME.pitch.mutedLabel} fontSize="8" textAnchor="middle" opacity={0.55}>{tick.label}</text>
            </g>
          ))}

          {/* Empty state */}
          {staticPoints.filter(p => p.centsOffset != null).length === 0 && (
            <text x={svgW / 2} y={svgH / 2} fill={THEME.pitch.mutedLabel} fontSize="11" textAnchor="middle">No pitch data recorded</text>
          )}
        </svg>
      </div>
    );
  }  return (

    <article
      className={`glass ${props.className ?? ""}`.trim()}
      style={{
        borderRadius: 24,
        padding: 14,
        display: "grid",
        gap: 12,
        background: THEME.cardStrong.bg,
        border: THEME.cardStrong.border,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      <div className="trainer-signal-top" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 99, background: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Pitch Tracker</span>
          </div>
          {segmentationEnabled && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginLeft: 8 }}>
              {noteLegend.map((note) => (
                <span
                  key={note.swara}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10.5,
                    color: THEME.text.gray,
                    lineHeight: 1,
                    marginRight: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: note.color.stroke,
                      boxShadow: `0 0 0 1px ${note.color.band}`,
                    }}
                  />
                  {note.swara}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="button"
            aria-label={props.running ? "Mute microphone analysis" : "Unmute microphone analysis"}
            title={props.running ? "Mute microphone analysis" : "Unmute microphone analysis"}
            onClick={props.onToggleMic}
            style={{
              width: 28,
              height: 28,
              minWidth: 28,
              minHeight: 28,
              padding: 0,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              border: props.running ? THEME.controls.micActiveBorder : THEME.controls.micInactiveBorder,
              background: props.running
                ? THEME.controls.micActive
                : THEME.controls.micInactive,
              color: props.running ? THEME.controls.micActiveColor : "var(--muted)",
            }}
          >
            <MicToggleIcon active={props.running} />
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={segmentationEnabled}
            aria-label={segmentationEnabled ? "Hide note segmentation" : "Show note segmentation"}
            title={segmentationEnabled ? "Hide note segmentation" : "Show note segmentation"}
            onClick={() => setSegmentationEnabled((value) => !value)}
            style={{
              width: 28,
              height: 28,
              minWidth: 28,
              minHeight: 28,
              padding: 0,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              border: segmentationEnabled ? THEME.controls.micActiveBorder : THEME.controls.micInactiveBorder,
              background: segmentationEnabled
                ? THEME.controls.micActive
                : THEME.controls.micInactive,
              color: segmentationEnabled ? THEME.controls.micActiveColor : "var(--muted)",
            }}
          >
            <SegmentationToggleIcon active={segmentationEnabled} />
          </button>

          <div style={{ position: "relative" }} ref={settingsRef}>
            <button
              type="button"
              className="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Pitch settings"
              title="Pitch settings"
              style={{
                width: 28,
                height: 28,
                minWidth: 28,
                minHeight: 28,
                padding: 0,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                // border: "1px solid rgba(255,255,255,0.08)",
                background: settingsOpen ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                // color: settingsOpen ? "var(--text)" : "var(--muted)",
                cursor: "pointer",
              }}
            >
              <Settings size={14} />
            </button>

            {settingsOpen && (
              <div
                role="dialog"
                aria-label="Pitch tracking settings"
                style={{
                  position: "absolute",
                  top: 34,
                  right: 0,
                  zIndex: 100,
                  width: 260,
                  padding: 14,
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(7, 14, 24, 0.96)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(18px)",
                  display: "grid",
                  gap: 12,
                }}
              >
                {/* Time Window Option */}
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "left" }}>
                    Time Window
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {props.pitchTrendWindowOptions.map((option) => {
                      const active = props.pitchTrendWindowMs === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className="button"
                          onClick={() => {
                            props.onPitchTrendWindowChange(option.value);
                          }}
                          style={{
                            minHeight: 28,
                            padding: 0,
                            borderRadius: 8,
                            border: active ? "1px solid rgba(117,184,255,0.38)" : "1px solid rgba(255,255,255,0.08)",
                            background: active
                              ? "rgba(117,184,255,0.18)"
                              : "rgba(255,255,255,0.04)",
                            color: active ? "var(--text)" : "var(--muted)",
                            fontSize: 11,
                            fontWeight: 650,
                            cursor: "pointer",
                          }}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Difficulty Option */}
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "left" }}>
                    Difficulty
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {props.pitchDifficultyOptions.map((option) => {
                      const active = props.pitchDifficulty === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className="button"
                          onClick={() => {
                            props.onPitchDifficultyChange(option.value);
                          }}
                          style={{
                            minHeight: 28,
                            padding: 0,
                            borderRadius: 8,
                            border: active ? "1px solid rgba(103,240,202,0.38)" : "1px solid rgba(255,255,255,0.08)",
                            background: active
                              ? "rgba(103,240,202,0.18)"
                              : "rgba(255,255,255,0.04)",
                            color: active ? "var(--text)" : "var(--muted)",
                            fontSize: 11,
                            fontWeight: 650,
                            cursor: "pointer",
                          }}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>





      <div
        style={{
          borderRadius: 24,
          background: "transparent",
          border: "none",
          padding: 0,
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={props.fullscreen ? height : undefined}
          style={props.fullscreen ? undefined : { height: "auto", maxHeight: height, display: "block" }}
          aria-hidden="true"
        >
          {/* Background bands */}
          <rect x="0" y={highReleaseY} width={width} height={highLockY - highReleaseY} fill={THEME.pitch.releaseZone} />
          <rect x="0" y={lowLockY} width={width} height={lowReleaseY - lowLockY} fill={THEME.pitch.releaseZone} />
          <rect x="0" y={highLockY} width={width} height={lowLockY - highLockY} fill={THEME.pitch.targetZone} />

          {/* Dynamic note sections */}
          {segmentationEnabled
            ? visibleNoteBands.map((band, index) => {
              const bandWidth = Math.max(0, band.endX - band.startX);
              const shouldLabel = props.fullscreen || bandWidth >= labelThresholdPx;
              const labelX = clamp(band.startX + 8, 16, width - 18);
              const bandInset = 1;
              const rectX = clamp(band.startX + bandInset, 0, width);
              const rectWidth = Math.max(0, bandWidth - bandInset * 2);
              return (
                <g key={`${band.key}-${index}`}>
                  <rect
                    x={rectX}
                    y={24}
                    width={rectWidth}
                    height={height - 48}
                    rx={14}
                    fill={band.color.band}
                    stroke={band.color.stroke}
                    strokeWidth={0.9}
                    opacity={props.fullscreen ? 0.52 : 0.42}
                  />
                  {shouldLabel ? (
                    <g>
                      <text
                        x={labelX}
                        y={42}
                        fill="#ffffff"
                        stroke={THEME.pitch.bg}
                        strokeWidth={2.4}
                        paintOrder="stroke"
                        fontSize={band.octave === "Taar" ? "13.5" : band.octave === "Mandra" ? "12.5" : "13"}
                        fontWeight="900"
                        textAnchor="start"
                      >
                        {band.swara.charAt(0)}
                      </text>
                      {band.octave === "Taar" && (
                        <circle
                          cx={labelX + 4.5}
                          cy={27}
                          r={2.6}
                          fill="#ffffff"
                          stroke={THEME.pitch.bg}
                          strokeWidth={1.5}
                        />
                      )}
                      {band.octave === "Mandra" && (
                        <circle
                          cx={labelX + 4.5}
                          cy={51}
                          r={2.6}
                          fill="#ffffff"
                          stroke={THEME.pitch.bg}
                          strokeWidth={1.5}
                        />
                      )}
                    </g>
                  ) : null}
                </g>
              );
            })
            : null}

          {/* Grid lines */}
          <line x1="12" y1={centerY} x2={width - 12} y2={centerY} stroke={THEME.pitch.gridLine} strokeDasharray="6 6" />
          <line x1="12" y1={highLockY} x2={width - 12} y2={highLockY} stroke={THEME.pitch.gridLine} />
          <line x1="12" y1={lowLockY} x2={width - 12} y2={lowLockY} stroke={THEME.pitch.gridLine} />
          <line x1="12" y1="24" x2="12" y2={height - 24} stroke={THEME.pitch.gridLine} />
          <line x1={width / 2} y1="24" x2={width / 2} y2={height - 24} stroke="rgba(117,184,255,0.18)" />

          {/* Color-coded line segments by swara */}
          {segments.map((seg, si) => {
            if (seg.points.length < 2) return null;
            const color = THEME.pitch.trace;
            const d = buildSmoothPolyline(densifyTracePoints(seg.points, traceResampleStepPx).map((p) => ({ ...p, active: true })));
            return (
              <path
                key={`seg-${si}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="2.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.88}
                shapeRendering="geometricPrecision"
              />
            );
          })}

          {!segmentationEnabled
            ? tracePoints.map((point, index) => {
              if (!point.active || point.swara == null) return null;
              const visual = noteVisual(point.swara, point.octave);
              return (
                <circle
                  key={`point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="2.15"
                  fill={THEME.pitch.traceGlow}
                  stroke={THEME.pitch.trace}
                  strokeWidth="0.7"
                  opacity={0.92}
                />
              );
            })
            : null}

          {/* Labels */}
          <text x="8" y="15" fill={THEME.pitch.axisLabel} fontSize="10" textAnchor="start">High</text>
          <text x="8" y={centerY + 4} fill={THEME.pitch.axisLabel} fontSize="10" textAnchor="start">Target zone</text>
          <text x="8" y={height - 8} fill={THEME.pitch.axisLabel} fontSize="10" textAnchor="start">Low</text>
          <text x={width - 8} y={highLockY - 4} fill={THEME.pitch.axisLabel} fontSize="10" textAnchor="end">
            +{props.pitchToleranceCents}¢
          </text>
          <text x={width - 8} y={lowLockY + 12} fill={THEME.pitch.axisLabel} fontSize="10" textAnchor="end">
            -{props.pitchToleranceCents}¢
          </text>
          <text x={width - 8} y={height - 8} fill={THEME.pitch.mutedLabel} fontSize="10" textAnchor="end">Now</text>
          <text x="12" y={height - 8} fill={THEME.pitch.mutedLabel} fontSize="10">{`${formatPitchWindowLabel(props.pitchTrendWindowMs)} ago`}</text>
          <text x={width / 2 - 16} y={height - 8} fill={THEME.pitch.mutedLabel} fontSize="10">{`~${props.pitchTrendWindowMs / 2000}s`}</text>

          {/* Target Note Timeline lines and label tags */}
          {targetNoteBands.map((band, idx) => {
            const lineY = height - 21;
            const textY = height - 8;
            const bandWidth = Math.max(0, band.endX - band.startX);
            const midX = band.startX + bandWidth / 2;

            const isPaMandra = band.swara === "P̣" || band.swara === "P\u0323" || band.swara === "\u1E56";
            const displaySwara = isPaMandra ? "P" : band.swara;

            return (
              <g key={`target-note-band-${idx}`}>
                <line
                  x1={band.startX}
                  y1={lineY}
                  x2={band.endX}
                  y2={lineY}
                  stroke={band.color.stroke}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.88}
                />
                {bandWidth > 14 && (
                  <>
                    <text
                      x={midX}
                      y={textY}
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="800"
                      textAnchor="middle"
                      style={{ textShadow: "0px 1px 2px rgba(0, 0, 0, 0.9)" }}
                    >
                      {displaySwara}
                    </text>
                    {isPaMandra && (
                      <circle
                        cx={midX}
                        cy={textY + 2.5}
                        r={1.15}
                        fill="#ffffff"
                        style={{ filter: "drop-shadow(0px 1px 1px rgba(0, 0, 0, 0.9))" }}
                      />
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </article>
  );
}

function fluteLaneForSwara(swara: SwaraName) {
  return FLUTE_LANES.find((lane) => laneContainsSwara(lane, swara)) ?? FLUTE_LANES[0];
}

function laneContainsSwara(lane: (typeof FLUTE_LANES)[number], swara: SwaraName) {
  return (lane.targetSwaras as readonly SwaraName[]).includes(swara);
}

function formatFluteTileLabel(target: SwaraTarget) {
  const dot = octaveSymbol(target.octave);
  if (!dot) return target.swara;
  // Apply combining diacritic directly onto the first character of the swara name.
  // e.g. "Sa" + dot-above → "Ṡa", "Pa" + dot-below → "Ṗa"
  return (target.swara[0] + dot + target.swara.slice(1)).normalize("NFC");
}

function FluteRoadView(props: {
  now: number;
  startedAt: number;
  analysis: AnalysisState;
  checkpointFocus: CheckpointFocus;
  fluteRoadMode: FluteRoadPracticeMode;
  onFluteRoadModeChange: (value: FluteRoadPracticeMode) => void;
  sequenceDrill: SequenceLessonStep | null;
  sequenceCurrentIndex: number;
  isFullscreen?: boolean;
  boardMaxHeight?: number;
  sequenceCurrentStep: SequenceLessonStep["steps"][number] | null;
  sequenceNextStep: SequenceLessonStep["steps"][number] | null;
  pitchToleranceCents: number;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onRetry?: () => void;
  isLooping?: boolean;
  onToggleLoop?: () => void;
  beatsPerNote: number;
  metronomeBpm: number;
}) {
  const isReverseMode = props.fluteRoadMode === "reverse";
  const dynamicSustainMs = props.beatsPerNote * (60 / props.metronomeBpm) * 1000;
  const rawPhraseSteps = props.sequenceDrill?.steps.length
    ? props.sequenceDrill.steps
    : [{ target: props.checkpointFocus.target, sustainTargetMs: Math.max(props.checkpointFocus.sustainTargetMs, 900) }];
  const phraseSteps = rawPhraseSteps.map((step) => ({ ...step, sustainTargetMs: dynamicSustainMs }));
  const activeTarget = props.sequenceCurrentStep?.target ?? props.checkpointFocus.target;
  const activeDetected = props.analysis.detected;
  const reverseDetected = props.analysis.transientDetected;
  const targetLane = fluteLaneForSwara(activeTarget.swara);
  const [reverseTrail, setReverseTrail] = useState<Array<{
    id: string;
    swara: SwaraName;
    octave: OctaveName;
    target: SwaraTarget;
    startedAt: number;
    durationMs: number;
    lastSeenAt: number;
    correct: boolean;
    centsOffset: number;
    confidence: number;
  }>>([]);
  const lastReverseNoteKeyRef = useRef<string | null>(null);

  const roadStartY = isReverseMode ? 112 : 18;
  const laneDrawStartY = isReverseMode ? roadStartY : 0;
  const roadEndY = FLUTE_BOARD_HEIGHT - 34;

  // ── Guitar Hero tile model ─────────────────────────────────────────────────
  const TILE_PX_PER_MS = 0.10; // 100 px/s — controls global scroll speed
  const SPAWN_MARGIN = 58;

  const countdownDelayMs = (60 / props.metronomeBpm) * 1000;
  const countdownHeight = Math.max(40, Math.round(countdownDelayMs * TILE_PX_PER_MS));

  const fluteBodyY = isReverseMode ? 30 : FLUTE_BODY_OFFSET_Y;
  const fluteContactY = isReverseMode ? fluteBodyY + 100 : fluteBodyY + 60;

  // Countdown parameters (spawn exactly off-screen based on countdownHeight)
  const countdownSpawnY = isReverseMode ? fluteBodyY + 80 : -countdownHeight - SPAWN_MARGIN;
  const countdownExitY = isReverseMode ? FLUTE_BOARD_HEIGHT - 42 : FLUTE_BOARD_HEIGHT + countdownHeight + SPAWN_MARGIN;
  const countdownTravelMs = Math.round(Math.abs(countdownExitY - countdownSpawnY) / TILE_PX_PER_MS);
  const countdownMsToFlute = Math.round(Math.abs(fluteContactY - countdownSpawnY) / TILE_PX_PER_MS);

  // Note parameters (spawn exactly off-screen based on note height)
  const noteHeight = Math.round(dynamicSustainMs * TILE_PX_PER_MS);
  const noteSpawnY = isReverseMode ? fluteBodyY + 80 : -noteHeight - SPAWN_MARGIN;
  const noteExitY = isReverseMode ? FLUTE_BOARD_HEIGHT - 42 : FLUTE_BOARD_HEIGHT + noteHeight + SPAWN_MARGIN;
  const noteTravelMs = Math.round(Math.abs(noteExitY - noteSpawnY) / TILE_PX_PER_MS);
  const noteMsToFlute = Math.round(Math.abs(fluteContactY - noteSpawnY) / TILE_PX_PER_MS);

  useEffect(() => {
    setReverseTrail([]);
    lastReverseNoteKeyRef.current = null;
  }, [props.startedAt, props.fluteRoadMode, props.checkpointFocus.target.swara, props.checkpointFocus.target.octave, props.sequenceDrill?.id]);

  useEffect(() => {
    if (!isReverseMode) {
      lastReverseNoteKeyRef.current = null;
      return;
    }

    if (!reverseDetected) {
      lastReverseNoteKeyRef.current = null;
      return;
    }

    const currentTarget = props.sequenceCurrentStep?.target ?? props.checkpointFocus.target;
    const noteKey = noteKeyForTarget(reverseDetected);
    if (lastReverseNoteKeyRef.current === noteKey) {
      setReverseTrail((current) => {
        if (!current.length) {
          return current;
        }

        const lastEvent = current[current.length - 1];
        if (lastEvent.swara !== reverseDetected.swara || lastEvent.octave !== reverseDetected.octave) {
          return current;
        }

        const nextDurationMs = Math.max(lastEvent.durationMs, props.now - lastEvent.startedAt);
        const nextCorrect =
          reverseDetected.swara === currentTarget.swara &&
          reverseDetected.octave === currentTarget.octave &&
          (reverseDetected.state ?? "Shuddha") === (currentTarget.state ?? "Shuddha") &&
          Math.abs(reverseDetected.centsOffset) <= props.pitchToleranceCents;

        const nextTrail = [...current];
        nextTrail[nextTrail.length - 1] = {
          ...lastEvent,
          target: currentTarget,
          durationMs: nextDurationMs,
          lastSeenAt: props.now,
          correct: nextCorrect,
          centsOffset: reverseDetected.centsOffset,
          confidence: reverseDetected.confidence,
        };
        return nextTrail;
      });
      return;
    }

    lastReverseNoteKeyRef.current = noteKey;
    const correct =
      reverseDetected.swara === currentTarget.swara &&
      reverseDetected.octave === currentTarget.octave &&
      (reverseDetected.state ?? "Shuddha") === (currentTarget.state ?? "Shuddha") &&
      Math.abs(reverseDetected.centsOffset) <= props.pitchToleranceCents;
    setReverseTrail((current) => [
      ...current.slice(-10),
      {
        id: `${props.now}-${noteKey}-${current.length}`,
        swara: reverseDetected.swara,
        octave: reverseDetected.octave,
        target: currentTarget,
        startedAt: props.now,
        durationMs: Math.max(120, props.analysis.sustainMs ?? 0),
        lastSeenAt: props.now,
        correct,
        centsOffset: reverseDetected.centsOffset,
        confidence: reverseDetected.confidence,
      },
    ]);
  }, [
    isReverseMode,
    props.analysis.sustainMs,
    props.checkpointFocus.target,
    props.now,
    props.pitchToleranceCents,
    props.sequenceCurrentStep?.target,
    reverseDetected,
  ]);

  // Build countdown tiles with direct, correct start times
  const countdownTiles = [3, 2, 1].map((value, index) => {
    const startAt = props.startedAt + index * countdownDelayMs;
    return {
      kind: "countdown" as const,
      key: `countdown-${value}-${index}`,
      label: String(value),
      x: targetLane.x,
      startAt,
      startY: countdownSpawnY,
      targetY: countdownExitY,
      travelMs: countdownTravelMs,
      height: countdownHeight,
      width: 16,
      fill: "rgba(255, 255, 255, 0.15)",
      stroke: "rgba(255, 255, 255, 0.22)",
      textFill: "rgba(255, 255, 255, 0.85)",
      glow: "none",
      active: false,
    };
  });

  const firstNoteArrivalAt = props.startedAt + countdownMsToFlute + 2 * countdownDelayMs + dynamicSustainMs;
  let noteCursor = firstNoteArrivalAt - noteMsToFlute;

  const noteTiles = phraseSteps.flatMap((step, index) => {
    const lane = fluteLaneForSwara(step.target.swara);
    const palette = noteVisual(step.target.swara, step.target.octave);
    const tileHeight = step.sustainTargetMs * TILE_PX_PER_MS;

    const timeArrivalTrailing = noteCursor + noteMsToFlute;
    const timeArrivalLeading = timeArrivalTrailing - step.sustainTargetMs;
    const isPassing = props.now >= timeArrivalLeading && props.now <= timeArrivalTrailing;

    const isPlayedCorrectly = Boolean(
      activeDetected &&
      activeDetected.swara === step.target.swara &&
      activeDetected.octave === step.target.octave &&
      (activeDetected.state ?? "Shuddha") === (step.target.state ?? "Shuddha") &&
      Math.abs(activeDetected.centsOffset) <= props.pitchToleranceCents
    );

    let tileFill = palette.fill;
    let tileStroke = palette.stroke;
    let tileGlow = palette.band;

    if (isPassing) {
      if (isPlayedCorrectly) {
        tileFill = "rgba(46, 213, 115, 0.85)"; // Green
        tileStroke = "rgba(46, 213, 115, 1)";
        tileGlow = "rgba(46, 213, 115, 0.6)";
      } else {
        tileFill = "rgba(255, 71, 87, 0.85)"; // Red
        tileStroke = "rgba(255, 71, 87, 1)";
        tileGlow = "rgba(255, 71, 87, 0.6)";
      }
    }

    const tile = {
      kind: "note" as const,
      key: `${step.target.swara}-${step.target.octave}-${index}`,
      label: formatFluteTileLabel(step.target),
      swara: step.target.swara,
      octave: step.target.octave,
      x: lane.x,
      startAt: noteCursor,
      startY: noteSpawnY,
      targetY: noteExitY,
      travelMs: noteTravelMs,
      height: tileHeight,
      width: 16,
      fill: tileFill,
      stroke: tileStroke,
      textFill: "#ffffff",
      glow: tileGlow,
      active: isPassing,
      isPlayedCorrectly,
    };

    const results: any[] = [tile];

    if (step.hasSpaceAfter) {
      results.push({
        kind: "divider" as const,
        key: `divider-${index}`,
        label: "",
        swara: step.target.swara,
        octave: step.target.octave,
        x: 0,
        startAt: noteCursor, // Pinned exactly at the trailing edge of the last note of this group
        startY: noteSpawnY,
        targetY: noteExitY,
        travelMs: noteTravelMs,
        height: 0,
        width: 0,
        fill: "",
        stroke: "",
        textFill: "",
        glow: "",
        active: false,
        isPlayedCorrectly: false,
      });
    }

    // Advance cursor by the sustain duration. Gap between groups = exactly 1 beat.
    noteCursor += step.sustainTargetMs + (step.hasSpaceAfter ? countdownDelayMs : 0);
    return results;
  });

  const visibleReverseTrail = reverseTrail.filter((event) => props.now - event.startedAt <= noteTravelMs + event.durationMs + 400);

  const reverseTiles = visibleReverseTrail.map((event) => {
    const lane = fluteLaneForSwara(event.swara);
    const palette = noteVisual(event.swara, event.octave);
    const tileHeight = Math.max(18, Math.round(event.durationMs * TILE_PX_PER_MS));
    const attached = props.now - event.lastSeenAt <= 140;
    const tileFill = event.correct ? "rgba(46, 213, 115, 0.86)" : "rgba(255, 71, 87, 0.86)";
    const tileStroke = event.correct ? "rgba(46, 213, 115, 1)" : "rgba(255, 71, 87, 1)";
    const tileGlow = event.correct ? "rgba(46, 213, 115, 0.62)" : "rgba(255, 71, 87, 0.62)";
    return {
      kind: "note" as const,
      key: event.id,
      label: formatFluteTileLabel({ swara: event.swara, octave: event.octave }),
      swara: event.swara,
      octave: event.octave,
      x: lane.x,
      startAt: event.lastSeenAt,
      startY: noteSpawnY,
      targetY: noteExitY,
      travelMs: noteTravelMs,
      height: tileHeight,
      width: 16,
      fill: event.correct ? tileFill : palette.fill,
      stroke: event.correct ? tileStroke : palette.stroke,
      textFill: "#ffffff",
      glow: event.correct ? tileGlow : palette.band,
      active: attached,
      attached,
      isPlayedCorrectly: event.correct,
    };
  });

  const tiles: any[] = isReverseMode ? reverseTiles : [...countdownTiles, ...noteTiles];

  const laneActive = (lane: (typeof FLUTE_LANES)[number]) =>
    Boolean(activeDetected && laneContainsSwara(lane, activeDetected.swara));
  const fluteGlowActive = FLUTE_LANES.some((lane) => laneActive(lane));

  return (
    <div className="trainer-flute-view" style={{ display: "grid", gap: 12 }}>

      <div
        style={{
          borderRadius: 26,
          padding: 0,
          background: "transparent",
          border: "none",
          overflow: "hidden",
        }}
      >
        <svg
          className="trainer-flute-svg"
          viewBox={`0 0 ${FLUTE_BOARD_WIDTH} ${FLUTE_BOARD_HEIGHT}`}
          width="100%"
          preserveAspectRatio="xMaxYMid meet"
          style={{ height: props.isFullscreen ? "calc(100dvh - 120px)" : "auto", maxHeight: props.isFullscreen ? undefined : (props.boardMaxHeight ?? FLUTE_BOARD_HEIGHT), display: "block", width: "100%" }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="trainerFluteBoard" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={THEME.background.dark} />
              <stop offset="60%" stopColor={THEME.background.medium} />
              <stop offset="100%" stopColor={THEME.background.light} />
            </linearGradient>
            <linearGradient id="trainerFluteWood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f1d9b5" />
              <stop offset="50%" stopColor="#e9c99c" />
              <stop offset="100%" stopColor="#d8b485" />
            </linearGradient>
            <radialGradient id="trainerFluteLip" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#d9b98f" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="trainerTileGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {/* Clip tiles to the lane area so they only appear once inside the road */}
            <clipPath id="tileClipPath">
              <rect x="0" y={laneDrawStartY} width={FLUTE_BOARD_WIDTH} height={roadEndY - laneDrawStartY} />
            </clipPath>
          </defs>

          {/* <rect x="0" y="0" width={FLUTE_BOARD_WIDTH} height={FLUTE_BOARD_HEIGHT} rx="26" fill="url(#trainerFluteBoard)" /> */}





          {FLUTE_LANES.map((lane) => {
            const active = laneActive(lane);
            const roadFill = active ? THEME.road.active.bg : THEME.road.inactive.bg;
            const roadStroke = active ? THEME.road.active.border : THEME.road.inactive.border;
            return (
              <g key={lane.swara}>
                <rect x={lane.x - 10} y={laneDrawStartY} width={20} height={roadEndY - laneDrawStartY} rx={10} fill={roadFill} stroke={roadStroke} strokeWidth={1} />
                <line x1={lane.x} y1={laneDrawStartY + 4} x2={lane.x} y2={roadEndY - 4} stroke={active ? THEME.road.active.line : THEME.road.inactive.line} strokeWidth={2} strokeDasharray="8 10" />
                <text
                  x={lane.x}
                  y={roadStartY - 8}
                  textAnchor="middle"
                  fill={active ? THEME.primary.main : THEME.text.gray}
                  fontSize="12"
                  fontWeight="700"
                >
                  {lane.roadLabel}
                </text>
              </g>
            );
          })}

          <g clipPath="url(#tileClipPath)">
            {tiles.map((tile) => {
              const isAttachedReverseTile = isReverseMode && tile.kind === "note" && "attached" in tile && tile.attached;
              const progress = isAttachedReverseTile
                ? 0
                : tile.startAt <= props.now
                  ? clamp((props.now - tile.startAt) / tile.travelMs, 0, 1)
                  : 0;
              const y = isAttachedReverseTile ? tile.startY : tile.startY + progress * (tile.targetY - tile.startY);
              const fadeProgress = progress < 0.88 ? 1 : clamp(1 - (progress - 0.88) / 0.12, 0, 1);
              const opacity = isAttachedReverseTile
                ? 1
                : progress <= 0
                  ? 0
                  : clamp(0.24 + progress * 0.86, 0, 1) * fadeProgress;

              if (tile.kind === "divider") {
                return (
                  <g
                    key={tile.key}
                    style={{
                      transform: `translate(0px, ${y}px)`,
                      opacity: opacity * 0.9,
                    }}
                  >
                    {/* Thick glowing background bar */}
                    <line
                      x1={FLUTE_LANES[0].x - 15}
                      y1={0}
                      x2={FLUTE_LANES[FLUTE_LANES.length - 1].x + 15}
                      y2={0}
                      stroke={THEME.road.divider.glow}
                      strokeWidth={5}
                    />
                    {/* Sharp dashed line */}
                    <line
                      x1={FLUTE_LANES[0].x - 15}
                      y1={0}
                      x2={FLUTE_LANES[FLUTE_LANES.length - 1].x + 15}
                      y2={0}
                      stroke={THEME.road.divider.dashed}
                      strokeWidth={1.8}
                      strokeDasharray="6 4"
                    />
                  </g>
                );
              }

              const isCountdown = tile.kind === "countdown";
              const tileWidth = tile.width;
              const noteLabelVisible = tile.kind === "note" && opacity > 0 && y < FLUTE_BOARD_HEIGHT && y + tile.height > 0;
              const noteLabelY = clamp(y + tile.height - 18, y + 16, FLUTE_BOARD_HEIGHT - 18);
              return (
                <Fragment key={tile.key}>
                  <g
                    key={`${tile.key}-shape`}
                    style={{
                      transform: `translate(${tile.x - tileWidth / 2}px, ${y}px)`,
                      opacity,
                    }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={tileWidth}
                      height={tile.height}
                      rx={isCountdown ? 10 : 5}
                      fill={tile.fill}
                      stroke={tile.stroke}
                      strokeWidth={1.2}
                      filter={tile.active && !isCountdown ? "drop-shadow(0 0 12px rgba(0, 224, 255, 0.28))" : undefined}
                    />
                    <rect x="0" y="0" width={tileWidth} height={Math.max(8, tile.height * 0.22)} rx={5} fill="url(#trainerTileGlow)" opacity={0.42} />
                    {isCountdown ? (
                      <text
                        x={tileWidth / 2}
                        y={tile.height / 2 + 7}
                        textAnchor="middle"
                        fill={tile.textFill}
                        fontSize="18"
                        fontWeight="600"
                      >
                        {tile.label}
                      </text>
                    ) : null}
                  </g>
                  {noteLabelVisible ? (
                    <g
                      key={`${tile.key}-label-group`}
                      style={{
                        transform: `translate(${tile.x}px, ${noteLabelY}px)`,
                        opacity: fadeProgress,
                      }}
                    >
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={tile.octave === "Taar" ? "13.5" : tile.octave === "Mandra" ? "12.5" : "13"}
                        fontWeight="900"
                        stroke="rgba(5,10,18,0.95)"
                        strokeWidth={2.4}
                        paintOrder="stroke"
                      >
                        {tile.swara}
                      </text>
                      {tile.octave === "Taar" && (
                        <circle
                          cx={0}
                          cy={-14}
                          r={2.6}
                          fill="#ffffff"
                          stroke="rgba(5,10,18,0.95)"
                          strokeWidth={1.5}
                        />
                      )}
                      {tile.octave === "Mandra" && (
                        <circle
                          cx={0}
                          cy={9}
                          r={2.6}
                          fill="#ffffff"
                          stroke="rgba(5,10,18,0.95)"
                          strokeWidth={1.5}
                        />
                      )}
                    </g>
                  ) : null}
                </Fragment>
              );
            })}
          </g> {/* end tileClipPath group */}

          <g
            transform={`translate(0,${fluteBodyY})`}
            style={{
              filter: fluteGlowActive ? "drop-shadow(0 0 18px rgba(0,224,255,0.26))" : undefined,
            }}
          >
            <rect x="40" y="60" width="970" height="40" rx="20" fill="url(#trainerFluteWood)" />
            <rect x="40" y="60" width="25" height="40" fill="#111" />
            <rect x="65" y="60" width="45" height="40" fill="#B87333" />
            <rect x="110" y="60" width="30" height="40" fill="#111" />

            <ellipse cx="190" cy="80" rx="26" ry="16" fill="url(#trainerFluteLip)" />
            <ellipse cx="190" cy="80" rx="9" ry="6" fill="#111" />

            <rect x="330" y="60" width="40" height="40" fill="#111" />
            <rect x="370" y="60" width="65" height="40" fill="#B87333" />
            <rect x="435" y="60" width="40" height="40" fill="#111" />

            {FLUTE_LANES.map((lane) => {
              const active = Boolean(activeDetected && laneContainsSwara(lane, activeDetected.swara));
              return (
                <circle
                  key={lane.swara}
                  cx={lane.x}
                  cy={80}
                  r="11"
                  fill="#111"
                  className={active ? "active" : undefined}
                />
              );
            })}
          </g>

          {noteTiles.map(tile => {
            if (!tile.active) return null;
            const particles = [];
            for (let i = 0; i < 36; i++) {
              const maxLife = 300 + ((i * 7) % 300); // 300ms to 600ms lifespan
              const t = (props.now + i * 113) % maxLife;
              const progress = t / maxLife;

              // Spawns exactly on the contact surface of the flute
              const speed = 40 + ((i * 13) % 40); // 40px to 80px total height
              const particleSpawnY = isReverseMode ? fluteBodyY + 100 : fluteBodyY + 60;
              const py = particleSpawnY - (progress * speed);

              // Lateral spread across the tile width (tile width is 28)
              const spread = -12 + ((i * 29) % 24);
              // Drift slightly outwards as they rise
              const px = tile.x + spread + (spread * progress * 0.4);

              const opacity = (1 - progress * progress) * 0.9;
              const r = 0.5 + (1 - progress) * 1.5; // Max 2px, shrinks to 0.5px
              const color = tile.isPlayedCorrectly ? "#4ae38c" : "#ff5e6d"; // Bright spark colors

              particles.push(
                <circle
                  key={`${tile.key}-p-${i}`}
                  cx={px}
                  cy={py}
                  r={r}
                  fill={color}
                  opacity={opacity}
                  style={{ filter: "blur(0.5px)", mixBlendMode: "screen" }}
                />
              );
            }
            return <g key={`particles-${tile.key}`}>{particles}</g>;
          })}
        </svg>
      </div>
    </div>
  );
}

function FullscreenToggleIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M4 1H1v3M10 1h3v3M13 10v3h-3M1 10v3h3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M4 1H1v3M10 1h3v3M13 10v3h-3M1 10v3h3M5 5l4 4M5 9h4V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicToggleIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M7 8.8V12M4.2 6.6V7a2.8 2.8 0 0 0 5.6 0v-.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="5" y="1.8" width="4" height="6.2" rx="2" fill="currentColor" />
        <path
          d="M3.3 7a3.7 3.7 0 0 0 7.4 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M7 8.8V12M4.2 6.6V7a2.8 2.8 0 0 0 5.6 0v-.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="5" y="1.8" width="4" height="6.2" rx="2" fill="currentColor" opacity="0.42" />
      <path d="M2 2l10 10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function SegmentationToggleIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="2" width="4" height="10" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="5.4" y="3.4" width="3.2" height="7.2" rx="1.2" fill="currentColor" opacity="0.72" />
      <rect x="8.9" y="1.8" width="4.1" height="10.4" rx="1.5" fill="currentColor" opacity="0.52" />
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildSmoothPolyline(points: Array<{ x: number; y: number; active: boolean }>) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;

    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - current.x) / 6;
    const cp2y = next.y - (after.y - current.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  return path;
}

function densifyTracePoints(points: Array<{ x: number; y: number }>, stepPx: number) {
  if (points.length < 3) {
    return points;
  }

  const densePoints: Array<{ x: number; y: number }> = [points[0]];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const distance = Math.max(1, Math.hypot(next.x - current.x, next.y - current.y));
    const steps = Math.max(1, Math.ceil(distance / stepPx));

    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      densePoints.push({
        x: lerp(current.x, next.x, progress),
        y: lerp(current.y, next.y, progress),
      });
    }

    densePoints.push(next);
  }

  return densePoints;
}

function filterTrendWindow(points: TrendPoint[], windowMs: PitchTrendWindowMs = 15000) {
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  return points.filter((point) => latestTimestamp - point.timestamp <= windowMs);
}

function lerp(current: number, next: number, alpha: number) {
  return current + (next - current) * alpha;
}

function rms(buffer: Float32Array) {
  let sum = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }

  return Math.sqrt(sum / buffer.length);
}

function average(values: Uint8Array) {
  if (!values.length) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
  }

  return sum / values.length;
}

function stdDev(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function signedCents(value: number) {
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function describePitchOffset(centsOffset: number) {
  const abs = Math.abs(centsOffset);

  if (abs <= 5) {
    return "Centered";
  }

  if (abs <= 12) {
    return centsOffset > 0 ? "Just above center" : "Just below center";
  }

  if (abs <= 24) {
    return centsOffset > 0 ? "A little high" : "A little low";
  }

  return centsOffset > 0 ? "High — ease airflow slightly" : "Low — add a touch more support";
}

function describeStability(stability: number) {
  if (stability >= 85) {
    return "Very steady";
  }

  if (stability >= 70) {
    return "Mostly steady";
  }

  if (stability >= 50) {
    return "Wobbling a bit";
  }

  return "Unstable tone";
}

function describeConfidence(confidence: number) {
  if (confidence >= 0.85) {
    return "Clear flute tone";
  }

  if (confidence >= 0.65) {
    return "Pretty clean tone";
  }

  if (confidence >= 0.45) {
    return "Tone is forming";
  }

  return "Mostly air / noise";
}

function describeEnergy(energy: number) {
  if (energy >= 80) {
    return "Strong airflow";
  }

  if (energy >= 55) {
    return "Comfortable airflow";
  }

  if (energy >= 30) {
    return "Soft airflow";
  }

  return "Very gentle airflow";
}
