"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  type SwaraTarget,
  type TonicName,
} from "@/lib/swara";
import type { LessonStep } from "@/data/lesson-plan";
import { FluteFinder, readStoredFluteProfile, storeFluteProfile } from "@/components/flute-finder";

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
};

type AnalysisState = {
  detected: DetectedSwara | null;
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

type PitchDifficultyConfig = {
  label: string;
  description: string;
  noteToleranceCents: number;
  releaseToleranceCents: number;
  sequenceToleranceCents: number;
  scoreToleranceCents: number;
};

const allLessonSteps = foundationModules.flatMap((module) => module.steps);
const firstStep = allLessonSteps[0];
const FALLBACK_TARGET: SwaraTarget = { swara: "Sa", octave: "Madhya" };
const UI_REFRESH_MS = 160;
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
const ACTIVE_ENERGY = 0.012;
const TREND_WINDOW_MS = 30000;
const TREND_SAMPLE_MS = 40;
const DEBUG_LOG_STORAGE_KEY = "bansuri.trainerDebugLog";
const PITCH_DIFFICULTY_STORAGE_KEY = "bansuri.pitchDifficulty";
const DEBUG_LOG_LIMIT = 900;
const DEBUG_LOG_SINK_URL = "http://127.0.0.1:4010/log";
const SEQUENCE_MIN_PRACTICE_SCORE = 72;

const pitchDifficultyOptions: Array<{ value: PitchDifficulty; label: string; description: string }> = [
  { value: "easy", label: "Easy", description: "Wider pitch band" },
  { value: "medium", label: "Medium", description: "Balanced trainer mode" },
  { value: "hard", label: "Hard", description: "Tighter pitch band" },
];

function readStoredPitchDifficulty(): PitchDifficulty {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return "medium";
  }

  const stored = window.localStorage.getItem(PITCH_DIFFICULTY_STORAGE_KEY);
  return stored === "easy" || stored === "medium" || stored === "hard" ? stored : "medium";
}

function storePitchDifficulty(value: PitchDifficulty) {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function"
  ) {
    return;
  }

  window.localStorage.setItem(PITCH_DIFFICULTY_STORAGE_KEY, value);
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
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return [] as DebugLogEntry[];
  }

  try {
    const raw = window.localStorage.getItem(DEBUG_LOG_STORAGE_KEY);
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
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function"
  ) {
    return;
  }

  window.localStorage.setItem(DEBUG_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-DEBUG_LOG_LIMIT)));
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
    return labels.join(" -> ");
  }

  return `${labels.slice(0, maxSteps).join(" -> ")} -> ...`;
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

  const swaraScore = detected.swara === target.swara ? 100 : 0;
  const octaveScore = detected.octave === target.octave ? 100 : 0;
  const pitchWindow = Math.max(10, pitchToleranceCents * 1.5);
  const pitchPenalty = Math.min(Math.abs(detected.centsOffset), pitchWindow * 2);
  const pitchScore = Math.max(0, 100 - (pitchPenalty / (pitchWindow * 2)) * 100);
  const sustainScore = Math.min(100, (sustainMs / sustainNormalizationMs) * 100);
  const stabilityScore = Math.max(0, Math.min(100, stability));
  const noiseScore = Math.max(0, Math.min(100, 100 - noise));

  const score =
    swaraScore * 0.42 +
    octaveScore * 0.12 +
    pitchScore * 0.26 +
    sustainScore * 0.08 +
    stabilityScore * 0.08 +
    noiseScore * 0.04;

  let summary = "Good phrase shape. Keep the contour steady.";

  if (detected.swara !== target.swara) {
    summary = `You played ${detected.swara} instead of ${target.swara}.`;
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
  const [pitchDifficulty, setPitchDifficulty] = useState<PitchDifficulty>(readStoredPitchDifficulty);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(false);
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
  const [debugStatus, setDebugStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({
    detected: null,
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
  const lastDebugNoteKeyRef = useRef<string | null>(null);
  const lastDebugStepRef = useRef<string>("");
  const checkpointNoticeTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
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
  const fluteProfile = useMemo(
    () => fluteProfileForSelection(selectedTonic, selectedRegister),
    [selectedRegister, selectedTonic],
  );
  const pitchConfig = useMemo(() => pitchDifficultyConfig(pitchDifficulty), [pitchDifficulty]);
  const selectedStepRef = useRef<LessonStep | null>(selectedStep ?? null);
  const targetRef = useRef<SwaraTarget>(selectedStep?.target ?? target);
  const analysisRef = useRef<AnalysisState>({
    detected: null,
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
    storeFluteProfile(fluteProfile);
  }, [fluteProfile]);

  useEffect(() => {
    storePitchDifficulty(pitchDifficulty);
  }, [pitchDifficulty]);

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
    setSequenceLiveScore(null);
    if (result) {
      setSequenceRunResult(result);
    }
    setSequenceStepDurationsMs([]);
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

  async function copyDebugLog() {
    const payload = JSON.stringify(debugLogRef.current, null, 2);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setDebugStatus(`Copied ${debugLogRef.current.length} debug entries.`);
        return;
      }
    } catch {
      // Fall through to download.
    }

    downloadDebugLog();
    setDebugStatus("Clipboard unavailable. Downloaded debug log instead.");
  }

  function downloadDebugLog() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const blob = new Blob([JSON.stringify(debugLogRef.current, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bansuri-trainer-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setDebugStatus(`Downloaded ${debugLogRef.current.length} debug entries.`);
  }

  function clearDebugLog() {
    debugLogRef.current = [];
    writeStoredDebugLog([]);
    setDebugStatus("Cleared debug log.");
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
      analyser.smoothingTimeConstant = 0.35;

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
    const liveSequenceIndex = liveSequenceStep
      ? Math.min(liveProgress.stepIndex, Math.max(0, liveSequenceStep.steps.length - 1))
      : 0;

    if (!analyser || !audioContext) {
      return;
    }

    const now = performance.now();
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(spectrum);

    const energy = rms(buffer);
    const pitch = detectPitch(buffer, audioContext.sampleRate);
    const rawReading = classifySwara(pitch.frequency, fluteProfile.saFrequency, pitch.confidence);
    const harmonicReading = resolveSwaraReading({
      frequency: pitch.frequency,
      tonicFrequency: fluteProfile.saFrequency,
      confidence: pitch.confidence,
      target: liveTarget,
      previous: previousReadingRef.current,
      spectrum,
      sampleRate: audioContext.sampleRate,
    });
    const detected = rawReading ?? harmonicReading;

    const isActiveCandidate = Boolean(detected && pitch.confidence >= ACTIVE_CONFIDENCE && energy >= ACTIVE_ENERGY);
    const energyPercent = Math.min(100, energy * 5000);
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
            Math.abs(sustainReading.centsOffset) <= pitchZoneCents,
        );

      const noteIsInReleaseZone =
        Boolean(
          sustainReading &&
            sustainReading.swara === liveTarget.swara &&
            sustainReading.octave === liveTarget.octave &&
            Math.abs(sustainReading.centsOffset) <= pitchReleaseCents,
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
          pitchConfig.scoreToleranceCents,
          sequenceRagaGrammar,
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
          pitchToleranceCents: pitchConfig.scoreToleranceCents,
          sustainNormalizationMs: liveSequenceStep ? Math.max(500, liveSequenceStep.sustainTargetMs * 4) : 3000,
          ragaGrammar: sequenceRagaGrammar,
        }).score
      : 0;

    const compactDetected = visibleReading ?? detected ?? null;
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
      const sequencePitchToleranceCents = Math.max(liveSequenceStep.pitchToleranceCents, pitchConfig.sequenceToleranceCents);
      const expectedPitchMatches =
        activeSequenceReading.swara === liveTarget.swara &&
        activeSequenceReading.octave === liveTarget.octave &&
        Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;
      const sustainReady = (sustainMs ?? 0) >= Math.max(sequenceStep.sustainTargetMs, PRACTICE_HOLD_FLOOR_MS);
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
        Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;
      const isCurrentTarget =
        activeSequenceReading.swara === liveTarget.swara &&
        activeSequenceReading.octave === liveTarget.octave &&
        Math.abs(activeSequenceReading.centsOffset) <= sequencePitchToleranceCents;

      if (expectedPitchMatches && sustainReady) {
        const stepScore = scoreSequenceStepAttempt({
          target: sequenceStep.target,
          detected: activeSequenceReading,
          sustainMs: Math.round(sustainMs ?? 0),
          stability: Math.round(stability ?? 0),
          noise: Math.round(hissPercent),
          pitchToleranceCents: pitchConfig.scoreToleranceCents,
          sustainNormalizationMs: Math.max(500, sequenceStep.sustainTargetMs * 4),
          ragaGrammar: sequenceRagaGrammar,
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
          const loopPassed = phraseScore != null && phraseScore >= passThreshold;
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
              pitchConfig.scoreToleranceCents,
              sequenceRagaGrammar,
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
        (sustainMs ?? 0) >= (liveStep?.sustainTargetMs ?? 0) &&
        visibleReading?.swara === liveTarget.swara &&
        visibleReading?.octave === liveTarget.octave &&
        Math.abs(visibleReading?.centsOffset ?? 999) <= pitchZoneCents;

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
    trendRef.current = [
      ...trendRef.current.filter((entry) => timestamp - entry.timestamp <= TREND_WINDOW_MS),
      {
        centsOffset: point.reading ? point.reading.centsOffset : null,
        confidence: point.confidence,
        noise: point.noise,
        energy: point.energy,
        stability: point.stability,
        sustainMs: point.sustainMs,
        score: point.score,
        active: point.active,
        timestamp,
      },
    ];
  }

  function completeStep(step: LessonStep, source: "manual" | "auto") {
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

  function playSuccessChime() {
    if (typeof window === "undefined") {
      return;
    }

    const existingContext = audioContextRef.current;
    const audioContext = existingContext ?? new window.AudioContext();
    void audioContext.resume().catch(() => {});

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
        audioContext.close().catch(() => {});
      }, 450);
    }
  }

  function resetPath() {
    setCompletedStepIds([]);
    setCheckpointNotice(null);
    setClearedCheckpoint(null);
    if (firstStep) {
      setSelectedStepId(firstStep.id);
      setTarget(firstStep.target ?? FALLBACK_TARGET);
    }
  }

  const scoreValue = analysis.detected ? result.score : null;
  const sequenceDrill = selectedStep && isSequenceStep(selectedStep) ? selectedStep : null;
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
  const currentTargetFrequency = targetFrequencyFor(checkpointFocus.target, fluteProfile.saFrequency);
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
  const sustainProgress =
    analysis.sustainMs != null && selectedStep
      ? clamp(analysis.sustainMs / Math.max(1, checkpointFocus.sustainTargetMs), 0, 1)
      : 0;
  const tonicLabel = fluteProfile.tonicLabel;
  const liveTargetTitle = sequenceDrill ? sequenceDrill.title : formatTargetLabel(checkpointFocus.target);
  const liveTargetSubtitle = sequenceDrill
    ? `Play ${formatTargetLabel(checkpointFocus.target)} next${
        sequenceNextStep && sequenceNextStep !== sequenceCurrentStep ? `, then ${formatTargetLabel(sequenceNextStep.target)}` : ""
      }`
    : `${checkpointFocus.label} · ${currentTargetFrequency.toFixed(1)} Hz`;
  const sequenceCoachText = sequenceDrill
    ? `Play the phrase ${summarizeSequencePath(sequenceDrill)}. Aim for clean swara order and steadier pitch; the final phrase score matters more than exact timing.`
    : "The detector now judges the checkpoint only when note, octave, pitch band, and sustain all agree.";
  const swaraReference = swaraTargets.map((entry) => ({
    ...entry,
    frequency: targetFrequencyFor(entry, fluteProfile.saFrequency),
  }));

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
      <div
        className="trainer-hero glass"
        style={{
          borderRadius: 36,
          padding: "18px clamp(16px, 2.4vw, 28px)",
          display: "grid",
          gap: 14,
        }}
      >
        <div
          className="trainer-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="pill">Interactive MVP</div>
            <h1 className="section-title" style={{ fontSize: "clamp(26px, 3.4vw, 40px)", marginTop: 10 }}>
              Guided swara trainer
            </h1>
            <p className="section-copy" style={{ maxWidth: 840, marginBottom: 0 }}>
              Set the actual flute tonic and register first, then clear each guided checkpoint with
              live pitch, octave, sustain, and tone feedback on one screen.
            </p>
          </div>
          <div className="pill">{analysis.status}</div>
        </div>

        <div
          className="trainer-setup glass"
          style={{
            borderRadius: 28,
            padding: 14,
            background: "rgba(255,255,255,0.04)",
            display: "grid",
            gap: 12,
          }}
        >
            <div
              className="trainer-setup-bar"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div className="trainer-setup-pills" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="pill">Tonic {tonicLabel}</span>
              <span className="pill">Register {fluteProfile.registerLabel}</span>
            </div>

            <div className="trainer-setup-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button className="button button-primary" onClick={() => void startAnalysis()} disabled={running}>
                Start mic
              </button>
              <button className="button button-secondary" onClick={stopAnalysis} disabled={!running}>
                Stop
              </button>
              <button className="button button-primary" onClick={markStepComplete} disabled={!masteryReady}>
                Clear checkpoint
              </button>
              <button className="button button-secondary" onClick={() => setControlsOpen((current) => !current)}>
                {controlsOpen ? "Hide setup" : "Open setup"}
              </button>
            </div>
          </div>

          {controlsOpen ? (
            <div
              className="trainer-setup-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
                alignItems: "end",
              }}
            >
              <label className="label">
                Tonic / Sa
                <select
                  className="select"
                  value={selectedTonic}
                  onChange={(event) => setSelectedTonic(event.target.value as TonicName)}
                >
                  {tonicOptions.map((option) => (
                    <option key={option.tonic} value={option.tonic}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Flute register
                <select
                  className="select"
                  value={selectedRegister}
                  onChange={(event) => setSelectedRegister(event.target.value as FluteRegister)}
                >
                  {fluteRegisterOptions.map((option) => (
                    <option key={option.register} value={option.register}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Guided checkpoint
                <select
                  className="select"
                  value={selectedStepId}
                  onChange={(event) => {
                    const nextStep = allLessonSteps.find((step) => step.id === event.target.value);

                    if (nextStep) {
                      setCheckpointNotice(null);
                      setClearedCheckpoint(null);
                      setSelectedStepId(nextStep.id);
                    }
                  }}
                >
                  {foundationModules.map((module) => (
                    <optgroup key={module.id} label={module.title}>
                      {module.steps.map((step) => (
                        <option
                          key={step.id}
                          value={step.id}
                        >
                          {step.checkpointGroupTitle} · {step.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button className="button button-secondary" onClick={resetPath}>
                Reset path
              </button>

              <button className="button button-secondary" onClick={() => void copyDebugLog()}>
                Copy debug log
              </button>

              <button className="button button-secondary" onClick={downloadDebugLog}>
                Download debug log
              </button>

              <button className="button button-secondary" onClick={clearDebugLog}>
                Clear debug log
              </button>

              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Current flute</div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em" }}>
                  {fluteProfile.tonicLabel} {fluteProfile.registerLabel}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  Sa baseline {fluteProfile.saFrequency.toFixed(1)} Hz
                </div>
              </div>

              {error ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(255, 142, 142, 0.35)",
                    color: "var(--danger)",
                    background: "rgba(255, 142, 142, 0.08)",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              ) : null}

              {debugStatus ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(117,184,255,0.24)",
                    color: "var(--text)",
                    background: "rgba(117,184,255,0.08)",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {debugStatus}
                </div>
              ) : null}
            </div>
          ) : null}

          {controlsOpen ? (
            <FluteFinder
              compact
              title="Not sure which flute you have?"
              onDetected={(profile: FluteProfile) => {
                setSelectedTonic(profile.tonic);
                setSelectedRegister(profile.register);
              }}
            />
          ) : null}
        </div>

      <div
        className="trainer-layout"
        style={{
          display: "grid",
          gridTemplateColumns: leftRailOpen ? "minmax(280px, 0.82fr) minmax(0, 1.9fr)" : "minmax(0, 1fr)",
          gap: 12,
          alignItems: "start",
          minHeight: "calc(100vh - 260px)",
        }}
      >
        {leftRailOpen ? (
          <aside
            className="trainer-rail glass"
            style={{
              minWidth: 0,
              display: "grid",
              gap: 12,
              padding: 12,
              borderRadius: 28,
              background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ display: "grid", gap: 2 }}>
                <div className="pill" style={{ width: "fit-content" }}>
                  Practice map
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>
                  Journey and swara reference
                </div>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setLeftRailOpen(false)}
                aria-label="Collapse practice map"
                title="Collapse practice map"
                style={{
                  minHeight: 36,
                  minWidth: 36,
                  width: 36,
                  padding: 0,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path
                    d="M10 4l-4 4 4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
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
              />

              <SwaraReferencePanel
                tonicLabel={tonicLabel}
                registerLabel={fluteProfile.registerLabel}
                tonicFrequency={fluteProfile.saFrequency}
                profile={fluteProfile}
                rows={swaraReference}
              />
            </div>
          </aside>
        ) : null}

        <section className="trainer-main" style={{ minWidth: 0, display: "grid", gap: 12, position: "relative" }}>
          {!leftRailOpen ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setLeftRailOpen(true)}
              aria-label="Expand practice map"
              title="Expand practice map"
              style={{
                minHeight: 44,
                padding: "0 14px",
                borderRadius: 999,
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                width: "fit-content",
              }}
              >
              <span style={{ fontWeight: 650 }}>Practice map</span>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M6 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}

          {checkpointNotice ? (
            <div
              className="trainer-checkpoint-notice"
              style={{
                borderRadius: 24,
                padding: "14px 16px",
                background: "linear-gradient(90deg, rgba(103,240,202,0.2), rgba(117,184,255,0.14))",
                border: "1px solid rgba(103,240,202,0.35)",
                color: "var(--text)",
                boxShadow: "0 18px 50px rgba(103,240,202,0.12)",
                display: "grid",
                gap: 6,
              }}
            >
              <div className="pill" style={{ width: "fit-content", padding: "6px 12px", fontSize: 11 }}>
                Checkpoint cleared
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.3 }}>
                {checkpointNotice}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="pill" style={{ width: "fit-content", padding: "6px 12px", fontSize: 11 }}>
                  Bonus +1 token
                </span>
                <span className="pill" style={{ width: "fit-content", padding: "6px 12px", fontSize: 11 }}>
                  Total tokens {bonusTokens}
                </span>
              </div>
              {clearedCheckpoint?.stepId === selectedStepId ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button button-secondary" onClick={retryClearedCheckpoint}>
                    Retry checkpoint
                  </button>
                  <button
                    className="button button-primary"
                    onClick={proceedToNextCheckpoint}
                    disabled={!clearedCheckpoint.nextStepId}
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
                  borderRadius: 28,
                  padding: 16,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div className="trainer-live-header" style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div className="pill">Live target</div>
                    <div style={{ marginTop: 10, fontSize: 28, fontWeight: 750, letterSpacing: "-0.05em" }}>
                      {liveTargetTitle}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                      {liveTargetSubtitle} · {currentTargetFrequency.toFixed(1)} Hz
                      {checkpointFocus.progressLabel ? ` · ${checkpointFocus.progressLabel}` : ""}
                    </div>
                  </div>
                </div>

                {sequenceDrill ? (
                  <div
                    className="trainer-sequence"
                    style={{
                      borderRadius: 22,
                      padding: 14,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    <div className="trainer-sequence-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div className="pill" style={{ width: "fit-content" }}>Compound note tracker</div>
                        <div style={{ color: "var(--muted)", fontSize: 13.5 }}>
                          {sequenceLoopsCompleted} full loops cleared. Follow the phrase left to right.
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
                          Current loop score {currentLoopScore != null ? `${currentLoopScore}/100` : "—"}
                        </div>
                      </div>
                      <div style={{ minWidth: 180, display: "grid", gap: 6 }}>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Phrase progress</div>
                        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${sequenceProgressPercent}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="trainer-sequence-steps" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sequenceDrill.steps.map((step, index) => {
                        const isDone = index < sequenceCurrentIndex;
                        const isCurrent = index === sequenceCurrentIndex;
                        const tone = isCurrent
                          ? "linear-gradient(180deg, rgba(103,240,202,0.22), rgba(103,240,202,0.08))"
                          : isDone
                            ? "rgba(117,184,255,0.12)"
                            : "rgba(255,255,255,0.04)";
                        const heldMs = sequenceStepDurationsMs[index] ?? 0;

                        return (
                          <div
                            key={`${sequenceDrill.id}-${index}`}
                            style={{
                              minWidth: 108,
                              borderRadius: 18,
                              padding: "10px 12px",
                              border: isCurrent ? "1px solid rgba(103,240,202,0.28)" : "1px solid rgba(255,255,255,0.08)",
                              background: tone,
                              display: "grid",
                              gap: 4,
                            }}
                          >
                            <div style={{ color: "var(--muted)", fontSize: 11.5 }}>
                              {isDone ? "Done" : isCurrent ? "Now" : "Next"}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em" }}>
                              {step.target.swara}
                            </div>
                            <div style={{ color: "var(--muted)", fontSize: 12 }}>
                              {step.target.octave} · Held {(heldMs / 1000).toFixed(1)}s
                            </div>
                            <div style={{ color: "var(--muted)", fontSize: 11.5 }}>
                              Target {(step.sustainTargetMs / 1000).toFixed(1)}s
                            </div>
                            <div style={{ color: "var(--muted)", fontSize: 11.5 }}>
                              Score {currentLoopStepScores[index] != null ? `${currentLoopStepScores[index]}/100` : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {sequenceLoopHistory.length ? (
                      <div className="trainer-loop-history" style={{ display: "grid", gap: 8, paddingTop: 4 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <div className="pill" style={{ width: "fit-content" }}>Loop history</div>
                          {sequenceLoopHistory.slice(-3).map((entry, index) => (
                            <div
                              key={`${entry.repeatIndex}-${entry.kind}-${index}`}
                              className="pill"
                              style={{
                                width: "fit-content",
                                background:
                                  entry.kind === "success"
                                    ? "rgba(103,240,202,0.12)"
                                    : "rgba(255,142,142,0.12)",
                                borderColor:
                                  entry.kind === "success"
                                    ? "rgba(103,240,202,0.22)"
                                    : "rgba(255,142,142,0.22)",
                              }}
                              title={entry.message}
                            >
                              Loop {entry.repeatIndex + 1} {entry.score != null ? `${entry.score}/100` : "—"}
                            </div>
                          ))}
                        </div>
                        {latestLoopHistoryEntry ? (
                          <div
                            style={{
                              borderRadius: 16,
                              padding: 10,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.03)",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                                {latestLoopHistoryEntry.kind === "success" ? "Last loop passed" : "Last loop failed"}
                              </div>
                              <div style={{ fontSize: 12.5, fontWeight: 650 }}>
                                {latestLoopHistoryEntry.score != null ? `${latestLoopHistoryEntry.score}/100` : "—"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {sequenceDrill.steps.map((step, index) => (
                                <span
                                  key={`${latestLoopHistoryEntry.repeatIndex}-${index}-${step.target.swara}`}
                                  className="pill"
                                  style={{
                                    padding: "5px 8px",
                                    fontSize: 11,
                                    width: "fit-content",
                                    background: "rgba(255,255,255,0.04)",
                                  }}
                                >
                                  {step.target.swara} {latestLoopHistoryEntry.stepScores[index] != null ? `${latestLoopHistoryEntry.stepScores[index]}` : "—"}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="trainer-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  <LiveStat
                    label={sequenceDrill ? "Current note" : "Detected"}
                    value={analysis.detected ? `${analysis.detected.octave} ${analysis.detected.swara}` : "—"}
                    detail={
                      analysis.detected
                        ? `${analysis.rawFrequency != null ? `${analysis.rawFrequency.toFixed(1)} Hz` : "Raw pitch"} · ${signedCents(analysis.centsOffset ?? 0)}¢`
                        : "Waiting for stable tone"
                    }
                    background={
                      analysis.detected
                        ? detectedIsCorrect
                          ? "linear-gradient(180deg, rgba(103,240,202,0.24), rgba(103,240,202,0.08))"
                          : "linear-gradient(180deg, rgba(255,99,99,0.22), rgba(255,99,99,0.08))"
                        : "linear-gradient(180deg, rgba(117,184,255,0.16), rgba(117,184,255,0.05))"
                    }
                  />
                  <MiniProgressPanel
                    label={sequenceDrill ? "Phrase score" : "Goal"}
                    value={scoreValue != null ? `${scoreValue}` : "—"}
                    caption={selectedStep ? `Need ${selectedStep.minimumScore}+` : "Need a checkpoint"}
                    progress={goalProgress * 100}
                    target={selectedStep?.minimumScore ?? null}
                    active={Boolean(analysis.detected)}
                    mode="goal"
                  />
                  <MiniProgressPanel
                    label={sequenceDrill ? "Current hold" : "Sustain"}
                    value={analysis.sustainMs != null ? `${(analysis.sustainMs / 1000).toFixed(1)}s` : "—"}
                    caption={sequenceDrill
      ? `Counts after ${(Math.max(checkpointFocus.sustainTargetMs, PRACTICE_HOLD_FLOOR_MS) / 1000).toFixed(1)}s`
      : `Target ${(checkpointFocus.sustainTargetMs / 1000).toFixed(1)}s`}
                    progress={sustainProgress * 100}
                    target={checkpointFocus.sustainTargetMs}
                    active={Boolean(analysis.detected)}
                    mode="sustain"
                  />
                </div>
              </div>

              <div
                className="trainer-pitch-card glass"
                style={{
                  borderRadius: 24,
                  padding: 14,
                  background: "rgba(255,255,255,0.04)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div className="trainer-pitch-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.75fr)", gap: 12, alignItems: "stretch" }}>
                  <div className="trainer-signal-column" style={{ display: "grid", gap: 12, minHeight: 330 }}>
                    <SignalTrace
                      className="trainer-signal-trace"
                      points={analysis.trend}
                      detected={analysis.detected}
                      target={checkpointFocus.target}
                      pitchToleranceCents={pitchZoneCents}
                      pitchReleaseCents={pitchReleaseCents}
                      height={182}
                      pitchDifficulty={pitchDifficulty}
                      pitchDifficultyOptions={pitchDifficultyOptions}
                      onPitchDifficultyChange={setPitchDifficulty}
                    />
                  </div>

                  <div
                    className="trainer-metric-grid"
                    style={{
                      display: "grid",
                      gap: 10,
                      alignContent: "start",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
                      label="Voicing"
                      value={analysis.confidence != null ? `${Math.round((analysis.confidence ?? 0) * 100)}%` : null}
                      subvalue={analysis.detected ? describeConfidence(analysis.confidence ?? 0) : "—"}
                      hint="Tone clarity"
                      trend={analysis.trend}
                      sparkMetric="confidence"
                      range={[0, 100]}
                      sparkMode="high"
                    />
                    <MetricCard
                      label="Noise"
                      value={analysis.noise != null ? `${Math.round(analysis.noise)}%` : null}
                      subvalue={analysis.detected ? "Lower is cleaner" : "—"}
                      hint="Air / finger leak noise"
                      trend={analysis.trend}
                      sparkMetric="noise"
                      range={[0, 100]}
                      sparkMode="low"
                    />
                    <MetricCard
                      label="Input Energy"
                      value={analysis.energy != null ? `${Math.round(analysis.energy)}` : null}
                      subvalue={analysis.detected ? describeEnergy(analysis.energy ?? 0) : "—"}
                      hint="Blow strength"
                      trend={analysis.trend}
                      sparkMetric="energy"
                      range={[0, 100]}
                      sparkMode="high"
                    />
                  </div>
                </div>
              </div>

            </div>

          </section>
        </div>
      </div>
    </main>
  );
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

  return (
    <article
      className="glass"
      style={{
        borderRadius: 24,
        padding: 12,
        minHeight: 98,
        position: "relative",
        overflow: "hidden",
        border: props.highlight ? "1px solid rgba(103,240,202,0.35)" : undefined,
        boxShadow: props.highlight ? "0 0 0 1px rgba(117,184,255,0.14) inset" : undefined,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.14, pointerEvents: "none" }}>
        <Sparkline points={sparkline} mode={props.sparkMode} />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>{props.label}</div>
        <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, letterSpacing: "-0.04em" }}>
          {props.value ?? "—"}
        </div>
        {showTextDetails ? (
          <>
            <div style={{ marginTop: 4, color: "var(--muted)", lineHeight: 1.45, fontSize: 12.5 }}>
              {props.subvalue}
            </div>
            <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.45, fontSize: 12.5 }}>
              {props.hint}
            </div>
          </>
        ) : null}
        {showDial ? (
          <PitchOffsetDial value={latestValue as number | null} />
        ) : showLinearMeter ? (
          <div
            style={{
              marginTop: 10,
              height: 10,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  props.sparkMetric === "noise"
                    ? "linear-gradient(90deg, rgba(103,240,202,0.88), rgba(255,189,89,0.72), rgba(255,99,99,0.9))"
                    : "linear-gradient(90deg, rgba(117,184,255,0.18), rgba(103,240,202,0.9))",
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
                      ? "rgba(255,99,99,0.95)"
                      : "rgba(103,240,202,0.95)",
                  boxShadow: "0 0 16px rgba(103,240,202,0.28)",
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
}) {
  const currentModule = props.modules.find((module) => module.isCurrent) ?? props.modules[0] ?? null;
  const currentIndex = currentModule ? props.modules.findIndex((module) => module.id === currentModule.id) : -1;
  const currentModuleNumber = currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <div
      className="glass"
      style={{
        borderRadius: 24,
        padding: 14,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div className="pill">Journey</div>
        <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-0.05em" }}>{props.overallProgress}%</div>
        <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>
          {props.completedCount} of {props.totalCount} checkpoints cleared
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div
          style={{
            width: `${clamp(props.overallProgress, 0, 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>Module map</div>
        <div style={{ display: "grid", gap: 8 }}>
          {props.modules.map((module) => (
            <details
              key={module.id}
              open={module.isCurrent}
              style={{
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)",
                background: module.isCurrent
                  ? "linear-gradient(180deg, rgba(117,184,255,0.12), rgba(103,240,202,0.06))"
                  : "rgba(255,255,255,0.03)",
                overflow: "hidden",
              }}
            >
              <summary style={{ cursor: "pointer", listStyle: "none", padding: 12 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="pill" style={{ padding: "5px 10px", fontSize: 10.5 }}>
                          Module {props.modules.findIndex((entry) => entry.id === module.id) + 1}
                        </span>
                        <span
                          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.03em" }}
                          title={module.description}
                        >
                          {module.title}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>
                        {module.completedCount} of {module.steps.length} checkpoints cleared
                      </div>
                      {module.isCurrent ? (
                        <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.45, maxWidth: 320 }}>
                          {module.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="pill" style={{ padding: "6px 10px", fontSize: 10.5 }}>{module.steps.length} steps</div>
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

                    return (
                      <span
                        key={step.id}
                        className="pill"
                        style={{
                          padding: "6px 10px",
                          fontSize: 10.5,
                          background:
                            tone === "current"
                              ? "linear-gradient(180deg, rgba(103,240,202,0.2), rgba(103,240,202,0.08))"
                              : tone === "done"
                                ? "rgba(117,184,255,0.12)"
                                : "rgba(255,255,255,0.04)",
                          borderColor: tone === "current" ? "rgba(103,240,202,0.28)" : undefined,
                        }}
                      >
                        {isDone ? "✓ " : "• "}
                        {step.title}
                      </span>
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
  const background =
    props.tone === "accent"
      ? "linear-gradient(180deg, rgba(117,184,255,0.16), rgba(117,184,255,0.05))"
      : props.tone === "success"
        ? "linear-gradient(180deg, rgba(103,240,202,0.16), rgba(103,240,202,0.05))"
        : "rgba(255,255,255,0.03)";

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background,
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
        border: "1px solid rgba(255,255,255,0.08)",
        background: props.background ?? "linear-gradient(180deg, rgba(117,184,255,0.16), rgba(117,184,255,0.05))",
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
  const background = props.active
    ? complete
      ? "linear-gradient(180deg, rgba(103,240,202,0.22), rgba(103,240,202,0.07))"
      : bounded >= 60
        ? "linear-gradient(180deg, rgba(117,184,255,0.16), rgba(103,240,202,0.1))"
        : "linear-gradient(180deg, rgba(255,99,99,0.18), rgba(117,184,255,0.08))"
    : "linear-gradient(180deg, rgba(117,184,255,0.18), rgba(117,184,255,0.05))";

  const fill = props.active
    ? complete
      ? "linear-gradient(90deg, rgba(103,240,202,0.9), rgba(103,240,202,0.98))"
      : bounded >= 60
        ? "linear-gradient(90deg, rgba(117,184,255,0.7), rgba(103,240,202,0.92))"
        : "linear-gradient(90deg, rgba(255,99,99,0.82), rgba(117,184,255,0.72))"
    : "linear-gradient(90deg, rgba(117,184,255,0.25), rgba(117,184,255,0.95))";

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.08)",
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
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${bounded}%`,
            height: "100%",
            borderRadius: 999,
            background: fill,
            boxShadow: bounded > 0 ? "0 0 18px rgba(103,240,202,0.22)" : "none",
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
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div className="pill">Swara reference</div>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {props.tonicLabel} {props.registerLabel} Swara Frequency Map
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.45 }}>
              A compact map of the playable swaras across the three octaves for the selected flute.
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
            fontSize: 12.5,
          }}
        >
          <thead>
            <tr>
              {["Swara", "Western Note", "Mandra", "Madhya", "Taar"].map((heading) => (
                <th
                  key={heading}
                  style={{
                    textAlign: "left",
                    padding: "8px 6px",
                    color: "var(--muted)",
                    fontWeight: 600,
                    fontSize: 10.5,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
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
                      padding: "10px 6px",
                      fontWeight: 700,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {swara}
                  </td>
                  <td
                    style={{
                      padding: "10px 6px",
                      color: "var(--muted)",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {westernNote}
                  </td>
                  {octaveOrder.map((octave) => {
                    const row = rowsByKey.get(`${swara}-${octave}`);
                    const playable = row ? isPlayableSwaraForProfile(props.profile, row) : false;

                    return (
                      <td
                        key={octave}
                        style={{
                          padding: "10px 6px",
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          color: row && playable ? "var(--text)" : "var(--muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row && playable ? `${row.frequency.toFixed(1)} Hz` : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8, display: "grid", gap: 6, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.45 }}>
          <div>Frequencies are shown on the A=440 Hz standard for the selected flute profile.</div>
          <div>Legend: dash (—) means not practical or not reliable on this flute size.</div>
          <div>
            Medium flutes typically lose the lower Sa/Re/Ga/Ma band; Pa, Dha, and Ni are the practical Mandra notes.
          </div>
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
        background: "rgba(255,255,255,0.04)",
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
            Module {props.currentModule?.title ?? "Foundation"}
          </span>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
            Step {props.currentStep?.title ?? "Center your first Sa"}
          </span>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
            Next {props.nextSteps[0]?.title ?? "Keep moving"}
          </span>
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div
          style={{
            width: `${clamp(props.progress, 0, 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
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

function SignalTrace(props: {
  className?: string;
  points: TrendPoint[];
  detected: DetectedSwara | null;
  target: SwaraTarget;
  pitchToleranceCents: number;
  pitchReleaseCents: number;
  height?: number;
  pitchDifficulty: PitchDifficulty;
  pitchDifficultyOptions: Array<{ value: PitchDifficulty; label: string; description: string }>;
  onPitchDifficultyChange: (value: PitchDifficulty) => void;
}) {
  const width = 860;
  const height = props.height ?? 132;
  const minCents = -60;
  const maxCents = 60;
  const usableWidth = width - 24;
  const leftPad = 12;
  const points = filterTrendWindow(props.points);
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  const centsToY = (cents: number) => height - 24 - clamp((cents - minCents) / (maxCents - minCents), 0, 1) * (height - 48);
  const highReleaseY = centsToY(props.pitchReleaseCents);
  const highLockY = centsToY(props.pitchToleranceCents);
  const lowLockY = centsToY(-props.pitchToleranceCents);
  const lowReleaseY = centsToY(-props.pitchReleaseCents);
  const centerY = centsToY(0);
  const curvePoints = points
    .map((point) => {
      if (point.centsOffset == null) {
        return null;
      }

      const x = leftPad + clamp(1 - (latestTimestamp - point.timestamp) / TREND_WINDOW_MS, 0, 1) * usableWidth;
      const normalized = clamp((point.centsOffset - minCents) / (maxCents - minCents), 0, 1);
      const y = height - 24 - normalized * (height - 48);
      return { x, y, active: point.active };
    })
    .filter(Boolean) as Array<{ x: number; y: number; active: boolean }>;
  const path = buildSmoothPolyline(curvePoints);

  const latest = [...points].reverse().find((point) => point.centsOffset != null);

  return (
    <article
      className={`glass ${props.className ?? ""}`.trim()}
      style={{
        borderRadius: 24,
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div className="trainer-signal-top" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="pill" style={{ width: "fit-content" }}>Pitch tracker</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Latest offset</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {latest?.centsOffset != null ? `${signedCents(latest.centsOffset)}¢` : "—"}
          </div>
        </div>
      </div>

      <div
        className="trainer-signal-title-row"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div className="trainer-signal-title" style={{ fontSize: 17, fontWeight: 650 }}>Pitch movement over the last 30 seconds</div>
        <div className="trainer-pitch-difficulty" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {props.pitchDifficultyOptions.map((option) => {
            const active = props.pitchDifficulty === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="button"
                onClick={() => props.onPitchDifficultyChange(option.value)}
                aria-pressed={active}
                style={{
                  minHeight: 34,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: active ? "1px solid rgba(103,240,202,0.38)" : "1px solid rgba(255,255,255,0.08)",
                  background: active
                    ? "linear-gradient(180deg, rgba(103,240,202,0.18), rgba(103,240,202,0.08))"
                    : "rgba(255,255,255,0.04)",
                  color: active ? "var(--text)" : "var(--muted)",
                  fontSize: 11.5,
                  fontWeight: 650,
                  display: "grid",
                  alignContent: "center",
                  gap: 2,
                }}
                title={option.description}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          borderRadius: 24,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 6,
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
          <rect x="0" y="0" width={width} height={highReleaseY} fill="rgba(255, 99, 99, 0.08)" />
          <rect x="0" y={highReleaseY} width={width} height={highLockY - highReleaseY} fill="rgba(255, 189, 89, 0.12)" />
          <rect x="0" y={highLockY} width={width} height={lowLockY - highLockY} fill="rgba(103,240,202,0.15)" />
          <rect x="0" y={lowLockY} width={width} height={lowReleaseY - lowLockY} fill="rgba(255, 189, 89, 0.12)" />
          <rect x="0" y={lowReleaseY} width={width} height={height - lowReleaseY} fill="rgba(255, 99, 99, 0.08)" />
          <line x1="12" y1={centerY} x2={width - 12} y2={centerY} stroke="rgba(255,255,255,0.22)" strokeDasharray="6 6" />
          <line x1="12" y1={highLockY} x2={width - 12} y2={highLockY} stroke="rgba(255,255,255,0.1)" />
          <line x1="12" y1={lowLockY} x2={width - 12} y2={lowLockY} stroke="rgba(255,255,255,0.1)" />
          <line x1="12" y1="24" x2="12" y2={height - 24} stroke="rgba(255,255,255,0.06)" />
          <line x1={width / 2} y1="24" x2={width / 2} y2={height - 24} stroke="rgba(117,184,255,0.18)" />

          {curvePoints.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={point.active ? 2.4 : 1.4}
              fill="rgba(103,240,202,0.9)"
              opacity={point.active ? 0.9 : 0.32}
              stroke="rgba(8,18,31,0.65)"
              strokeWidth={0.6}
            />
          ))}

          {path ? (
            <path
              d={path}
              fill="none"
              stroke="url(#signalGradient)"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          <defs>
            <linearGradient id="signalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(117,184,255,0.95)" />
              <stop offset="100%" stopColor="rgba(103,240,202,0.95)" />
            </linearGradient>
          </defs>

          <text x="8" y="15" fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="start">High</text>
          <text x="8" y={centerY + 4} fill="rgba(255,255,255,0.76)" fontSize="10" textAnchor="start">Target zone</text>
          <text x="8" y={height - 8} fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="start">Low</text>
          <text x={width - 8} y={highLockY - 4} fill="rgba(255,255,255,0.76)" fontSize="10" textAnchor="end">
            +{props.pitchToleranceCents}¢
          </text>
          <text x={width - 8} y={lowLockY + 12} fill="rgba(255,255,255,0.76)" fontSize="10" textAnchor="end">
            -{props.pitchToleranceCents}¢
          </text>
          <text x={width - 8} y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10" textAnchor="end">Now</text>
          <text x="12" y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">30s ago</text>
          <text x={width / 2 - 16} y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">~12s</text>
        </svg>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      </div>
    </article>
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

function filterTrendWindow(points: TrendPoint[]) {
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  return points.filter((point) => latestTimestamp - point.timestamp <= TREND_WINDOW_MS);
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
