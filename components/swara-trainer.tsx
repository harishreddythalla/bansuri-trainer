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

const allLessonSteps = foundationModules.flatMap((module) => module.steps);
const firstStep = allLessonSteps[0];
const UI_REFRESH_MS = 160;
const SILENCE_HOLD_MS = 320;
const NOTE_LOCK_MS = 320;
const AUTO_CLEAR_HOLD_MS = 140;
const TARGET_ZONE_CENTS = 20;
const TARGET_RELEASE_CENTS = 28;
const TARGET_HOLD_GRACE_MS = 220;
const ACTIVE_CONFIDENCE = 0.45;
const ACTIVE_ENERGY = 0.012;
const TREND_WINDOW_MS = 30000;
const TREND_SAMPLE_MS = 40;

export function SwaraTrainer() {
  const [selectedStepId, setSelectedStepId] = useState<string>(firstStep?.id ?? "");
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [target, setTarget] = useState<SwaraTarget>(firstStep?.target ?? { swara: "Sa", octave: "Madhya" });
  const [selectedTonic, setSelectedTonic] = useState<TonicName>(defaultFluteProfile.tonic);
  const [selectedRegister, setSelectedRegister] = useState<FluteRegister>(defaultFluteProfile.register);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkpointNotice, setCheckpointNotice] = useState<string | null>(null);
  const [bonusTokens, setBonusTokens] = useState(0);
  const [celebrationPieces, setCelebrationPieces] = useState<Array<{ id: string; left: number; delay: number; duration: number; drift: number; hue: number }>>([]);
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
  const checkpointNoticeTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
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
      }),
    [analysis.detected, analysis.noise, analysis.stability, analysis.sustainMs, target],
  );

  const masteryReady = useMemo(() => {
    if (!selectedStep || !analysis.detected) {
      return false;
    }

    return (
      result.score >= selectedStep.minimumScore &&
      (analysis.sustainMs ?? 0) >= selectedStep.sustainTargetMs &&
      analysis.detected.swara === selectedStep.target.swara &&
      analysis.detected.octave === selectedStep.target.octave &&
      Math.abs(analysis.detected.centsOffset) <= 20
    );
  }, [analysis.detected, analysis.sustainMs, result.score, selectedStep]);

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
    if (selectedStep) {
      setTarget(selectedStep.target);
      resetLiveState();
    }
  }, [selectedStep]);

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
    analysisRef.current = analysis;
  }, [analysis]);

  function resetLiveState() {
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

  async function startAnalysis() {
    setError(null);
    stopAnalysis();

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
    const liveTarget = targetRef.current;
    const liveStep = selectedStepRef.current;

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
      target: liveStep?.target,
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

    if (isActiveCandidate && detected) {
      silenceSinceRef.current = null;
      const noteKey = `${detected.swara}-${detected.octave}`;

      if (!noteLockRef.current || noteLockRef.current.key !== noteKey) {
        noteLockRef.current = { key: noteKey, startedAt: now, reading: detected };
      } else {
        noteLockRef.current.reading = detected;
      }

      const lockAge = now - noteLockRef.current.startedAt;
      if (lockAge >= NOTE_LOCK_MS) {
        visibleReading = noteLockRef.current.reading;
        visibleReadingRef.current = noteLockRef.current.reading;
      }

      previousReadingRef.current = detected;

      const noteIsOnTarget =
        Boolean(
          visibleReading &&
            visibleReading.swara === liveTarget.swara &&
            visibleReading.octave === liveTarget.octave &&
            Math.abs(visibleReading.centsOffset) <= TARGET_ZONE_CENTS,
        );

      const noteIsInReleaseZone =
        Boolean(
          visibleReading &&
            visibleReading.swara === liveTarget.swara &&
            visibleReading.octave === liveTarget.octave &&
            Math.abs(visibleReading.centsOffset) <= TARGET_RELEASE_CENTS,
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

      status = shouldClear ? "Silence detected. Blow a note to begin." : "Holding the last tone briefly.";
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
      ? scoreAttempt({
          target: liveTarget,
          detected: visibleReading,
          sustainMs: Math.round(sustainMs ?? 0),
          stability: Math.round(stability ?? 0),
          noise: Math.round(hissPercent),
        }).score
      : 0;

    const checkpointClearable =
      Boolean(liveStep && visibleReading) &&
      rawScore >= Math.max(0, (liveStep?.minimumScore ?? 0) - 8) &&
      (sustainMs ?? 0) >= (liveStep?.sustainTargetMs ?? 0) &&
      visibleReading?.swara === liveTarget.swara &&
      visibleReading?.octave === liveTarget.octave &&
      Math.abs(visibleReading?.centsOffset ?? 999) <= TARGET_ZONE_CENTS;

    if (checkpointClearable && liveStep) {
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
    setCheckpointNotice(
      nextStep
        ? `${source === "auto" ? "Checkpoint cleared" : "Manual clear"}: ${step.title}. Next: ${nextStep.title}`
        : `${source === "auto" ? "Checkpoint cleared" : "Manual clear"}: ${step.title}. Path complete.`,
    );

    checkpointNoticeTimerRef.current = window.setTimeout(() => {
      setCheckpointNotice(null);
      checkpointNoticeTimerRef.current = null;
    }, 2200);

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

    if (nextStep) {
      setSelectedStepId(nextStep.id);
    }
  }

  function markStepComplete() {
    if (!selectedStep || !masteryReady) {
      return;
    }

    completeStep(selectedStep, "manual");
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
    if (firstStep) {
      setSelectedStepId(firstStep.id);
      setTarget(firstStep.target);
    }
  }

  const scoreValue = analysis.detected ? result.score : null;
  const currentModuleIndex = foundationModules.findIndex((module) =>
    module.steps.some((step) => step.id === selectedStepId),
  );
  const currentModule = currentModuleIndex >= 0 ? foundationModules[currentModuleIndex] : null;
  const currentStepIndex = allLessonSteps.findIndex((step) => step.id === selectedStepId);
  const recentClears = allLessonSteps.filter((step) => completedStepIds.includes(step.id)).slice(-3).reverse();
  const overallProgress = allLessonSteps.length
    ? Math.round((completedStepIds.length / allLessonSteps.length) * 100)
    : 0;
  const selectedStepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
  const currentTargetFrequency = targetFrequencyFor(target, fluteProfile.saFrequency);
  const currentCheckpointCleared = completedStepIds.includes(selectedStepId);
  const detectedIsCorrect =
    Boolean(
      analysis.detected &&
        selectedStep &&
        analysis.detected.swara === selectedStep.target.swara &&
        analysis.detected.octave === selectedStep.target.octave,
    );
  const goalProgress = scoreValue != null && selectedStep
    ? clamp(scoreValue / Math.max(1, selectedStep.minimumScore), 0, 1)
    : 0;
  const sustainProgress =
    analysis.sustainMs != null && selectedStep
      ? clamp(analysis.sustainMs / Math.max(1, selectedStep.sustainTargetMs), 0, 1)
      : 0;
  const tonicLabel = fluteProfile.tonicLabel;
  const swaraReference = swaraTargets.map((entry) => ({
    ...entry,
    frequency: targetFrequencyFor(entry, fluteProfile.saFrequency),
  }));

  return (
    <main className="shell" style={{ width: "min(1560px, calc(100vw - 24px))", paddingTop: 20, paddingBottom: 20 }}>
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
        className="glass"
        style={{
          borderRadius: 36,
          padding: "18px clamp(16px, 2.4vw, 28px)",
          display: "grid",
          gap: 14,
        }}
      >
        <div
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
          className="glass"
          style={{
            borderRadius: 28,
            padding: 14,
            background: "rgba(255,255,255,0.04)",
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="pill">Tonic {tonicLabel}</span>
              <span className="pill">Register {fluteProfile.registerLabel}</span>
              <span className="pill">Step {selectedStepNumber || 1}</span>
              <span className="pill">Target {target.octave} {target.swara}</span>
              <span className="pill">{currentTargetFrequency.toFixed(1)} Hz</span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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

                    if (nextStep && unlockedStepIds.has(nextStep.id)) {
                      setSelectedStepId(nextStep.id);
                    }
                  }}
                >
                  {foundationModules.map((module) => (
                    <optgroup key={module.id} label={module.title}>
                      {module.steps.map((step) => (
                        <option key={step.id} value={step.id} disabled={!unlockedStepIds.has(step.id)}>
                          {step.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button className="button button-secondary" onClick={resetPath}>
                Reset path
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
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.95fr) minmax(280px, 0.72fr)",
          gap: 12,
          alignItems: "start",
          minHeight: "calc(100vh - 260px)",
        }}
      >
          <section style={{ minWidth: 0, display: "grid", gap: 12 }}>
            {checkpointNotice ? (
              <div
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
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.9fr)",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              <div
                className="glass"
                style={{
                  borderRadius: 28,
                  padding: 16,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div className="pill">Live target</div>
                    <div style={{ marginTop: 10, fontSize: 28, fontWeight: 750, letterSpacing: "-0.05em" }}>
                      {target.octave} {target.swara}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                      {selectedStep?.title ?? "Current checkpoint"} · {currentTargetFrequency.toFixed(1)} Hz
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  <LiveStat
                    label="Detected"
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
                    label="Goal"
                    value={scoreValue != null ? `${scoreValue}` : "—"}
                    caption={selectedStep ? `Need ${selectedStep.minimumScore}+` : "Need a checkpoint"}
                    progress={goalProgress * 100}
                    target={selectedStep?.minimumScore ?? null}
                    active={Boolean(analysis.detected)}
                    mode="goal"
                  />
                  <MiniProgressPanel
                    label="Sustain"
                    value={analysis.sustainMs != null ? `${(analysis.sustainMs / 1000).toFixed(1)}s` : "—"}
                    caption={selectedStep ? `Target ${(selectedStep.sustainTargetMs / 1000).toFixed(1)}s` : "Target sustain"}
                    progress={sustainProgress * 100}
                    target={selectedStep?.sustainTargetMs ?? null}
                    active={Boolean(analysis.detected)}
                    mode="sustain"
                  />
                </div>
              </div>

              <div
                className="glass"
                style={{
                  borderRadius: 24,
                  padding: 14,
                  background: "rgba(255,255,255,0.04)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div className="pill">Coach feedback</div>
                <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.3 }}>
                  {analysis.detected ? result.summary : "Waiting for a stable flute tone."}
                </div>
                <p className="section-copy" style={{ margin: 0, fontSize: 14 }}>
                  The detector now judges the checkpoint only when note, octave, pitch band, and sustain all agree.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="pill" style={{ padding: "6px 12px", fontSize: 11, width: "fit-content" }}>
                    {currentCheckpointCleared ? "Cleared" : "In progress"}
                  </span>
                  {currentCheckpointCleared ? (
                    <>
                      <span className="pill" style={{ padding: "6px 12px", fontSize: 11, width: "fit-content" }}>
                        Bonus +1 token
                      </span>
                      <span className="pill" style={{ padding: "6px 12px", fontSize: 11, width: "fit-content" }}>
                        Total tokens {bonusTokens}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <SignalTrace
              points={analysis.trend}
              detected={analysis.detected}
              target={selectedStep?.target ?? target}
              silent={!analysis.detected}
            />

            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}
            >
              <MetricCard
                label="Mapped note"
                value={analysis.detected ? `${analysis.detected.octave} ${analysis.detected.swara}` : null}
                subvalue={
                  analysis.detected
                    ? `${analysis.rawFrequency != null ? `${analysis.rawFrequency.toFixed(1)} Hz raw` : "Raw pitch"}`
                    : "—"
                }
                hint={analysis.detected ? "Mapped from the current raw pitch" : "—"}
                trend={analysis.trend}
                sparkMetric="centsOffset"
                range={[-60, 60]}
                sparkMode="center"
              />
              <MetricCard
                label="Pitch Offset"
                value={analysis.detected ? `${signedCents(analysis.centsOffset ?? 0)}¢` : null}
                subvalue=""
                hint=""
                trend={analysis.trend}
                sparkMetric="centsOffset"
                range={[-60, 60]}
                sparkMode="center"
              />
              <MetricCard
                label="Attempt Score"
                value={scoreValue != null ? `${scoreValue}` : null}
                subvalue={analysis.detected ? (masteryReady ? "Checkpoint clearable" : "Keep practicing") : "—"}
                hint="Mastery"
                trend={analysis.trend}
                sparkMetric="score"
                range={[0, 100]}
                sparkMode="high"
              />
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
          </section>

          <aside
            style={{
              display: "grid",
              gap: 10,
              alignSelf: "start",
              position: "sticky",
              top: 12,
            }}
          >
            <JourneySummary
              overallProgress={overallProgress}
              completedCount={completedStepIds.length}
              totalCount={allLessonSteps.length}
              completedStepIds={completedStepIds}
              currentStepTitle={selectedStep?.title ?? "Choose a checkpoint"}
              currentStepNumber={selectedStepNumber || 1}
              currentTargetLabel={`${target.octave} ${target.swara}`}
              currentTargetFrequency={currentTargetFrequency}
              currentModuleTitle={currentModule?.title ?? "Foundation"}
              currentModuleDescription={currentModule?.description ?? "Start with the first breath and clean Sa."}
              recentClears={recentClears}
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
          </aside>
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
  currentStepNumber: number;
  currentTargetLabel: string;
  currentTargetFrequency: number;
  currentModuleTitle: string;
  currentModuleDescription: string;
  recentClears: Array<{ id: string; title: string }>;
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
  const nextCheckpoint =
    currentModule?.steps.find((step) => !props.completedStepIds.includes(step.id)) ??
    props.modules
      .slice((currentModule ? props.modules.findIndex((module) => module.id === currentModule.id) : -1) + 1)
      .flatMap((module) => module.steps)
      .find((step) => !props.completedStepIds.includes(step.id)) ??
    null;

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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="pill">Journey</div>
          <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-0.05em" }}>{props.overallProgress}%</div>
          <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>
            {props.completedCount} of {props.totalCount} checkpoints cleared
          </div>
        </div>
        <div className="pill" style={{ alignSelf: "start", padding: "6px 12px", fontSize: 11 }}>
          Step {props.currentStepNumber}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <JourneyTile
          label="Cleared"
          title={`${props.completedCount}`}
          detail={props.recentClears.length ? props.recentClears.map((step) => step.title).join(" · ") : "No clears yet"}
          tone="muted"
        />
        <JourneyTile
          label="Current"
          title={props.currentStepTitle}
          detail={`${props.currentTargetLabel} · ${props.currentTargetFrequency.toFixed(1)} Hz`}
          tone="accent"
        />
        <JourneyTile
          label="Ahead"
          title={nextCheckpoint?.title ?? "Path complete"}
          detail={currentModule ? `In ${currentModule.title}` : "Next checkpoint"}
          tone="success"
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
                          {module.isCurrent ? "Current" : module.completedCount > 0 ? "In progress" : "Upcoming"}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.03em" }}>{module.title}</span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>
                        {module.completedCount} of {module.steps.length} checkpoints cleared
                      </div>
                    </div>
                    <div className="pill" style={{ padding: "6px 10px", fontSize: 10.5 }}>
                      {module.steps.length}
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
                <div style={{ color: "var(--muted)", fontSize: 11.5, marginBottom: 8, lineHeight: 1.4 }}>
                  {module.description}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {module.steps.map((step) => {
                    const isDone = props.completedStepIds.includes(step.id);
                    const isCurrentStep = module.isCurrent && step.title === props.currentStepTitle;

                    return (
                      <span
                        key={step.id}
                        className="pill"
                        style={{
                          padding: "6px 10px",
                          fontSize: 10.5,
                          background: isCurrentStep
                            ? "linear-gradient(180deg, rgba(103,240,202,0.2), rgba(103,240,202,0.08))"
                            : isDone
                              ? "rgba(117,184,255,0.12)"
                              : "rgba(255,255,255,0.04)",
                          borderColor: isCurrentStep ? "rgba(103,240,202,0.28)" : undefined,
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
  const swaraOrder: SwaraTarget["swara"][] = ["Sa", "Re", "Ga", "Ma", "Pa", "Da", "Ni"];
  const octaveOrder: SwaraTarget["octave"][] = ["Mandra", "Madhya", "Tara"];
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
              {["Swara", "Western Note", "Mandra", "Madhya", "Tara"].map((heading) => (
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
            Medium flutes typically lose the lower Sa/Re/Ga/Ma band; Pa, Da, and Ni are the practical Mandra notes.
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
  points: TrendPoint[];
  detected: DetectedSwara | null;
  target: SwaraTarget;
  silent: boolean;
}) {
  const width = 860;
  const height = 132;
  const minCents = -60;
  const maxCents = 60;
  const usableWidth = width - 24;
  const leftPad = 12;
  const points = filterTrendWindow(props.points);
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
  const centsToY = (cents: number) => height - 24 - clamp((cents - minCents) / (maxCents - minCents), 0, 1) * (height - 48);
  const highReleaseY = centsToY(TARGET_RELEASE_CENTS);
  const highLockY = centsToY(TARGET_ZONE_CENTS);
  const lowLockY = centsToY(-TARGET_ZONE_CENTS);
  const lowReleaseY = centsToY(-TARGET_RELEASE_CENTS);
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
      className="glass"
      style={{
        borderRadius: 24,
        padding: 14,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="pill">Signal trace</div>
          <div style={{ marginTop: 8, fontSize: 17, fontWeight: 650 }}>Pitch movement over the last 30 seconds</div>
          <div style={{ marginTop: 6, color: "var(--muted)", lineHeight: 1.45, fontSize: 13 }}>
            {props.silent
              ? "Silence is hidden here until a stable tone returns."
              : `Tracking ${props.detected?.octave ?? props.target.octave} ${props.detected?.swara ?? props.target.swara} against the same pitch band used for sustain.`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Latest offset</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {latest?.centsOffset != null ? `${signedCents(latest.centsOffset)}¢` : "—"}
          </div>
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
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="132" aria-hidden="true">
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
          <text x={width - 8} y={highLockY - 4} fill="rgba(255,255,255,0.76)" fontSize="10" textAnchor="end">+20¢</text>
          <text x={width - 8} y={lowLockY + 12} fill="rgba(255,255,255,0.76)" fontSize="10" textAnchor="end">-20¢</text>
          <text x={width - 8} y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10" textAnchor="end">Now</text>
          <text x="12" y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">30s ago</text>
          <text x={width / 2 - 16} y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">~12s</text>
        </svg>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>Flat</span>
        <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>In tune</span>
        <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>Sharp</span>
        <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>{props.silent ? "Silent" : "Live tone"}</span>
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
