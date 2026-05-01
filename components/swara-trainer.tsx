"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { foundationModules } from "@/data/lesson-plan";
import {
  detectPitch,
  resolveSwaraReading,
  scoreAttempt,
  swaraTargets,
  tonicOptions,
  targetFrequencyFor,
  type DetectedSwara,
  type SwaraTarget,
} from "@/lib/swara";
import type { LessonStep } from "@/data/lesson-plan";

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
const UI_REFRESH_MS = 320;
const SILENCE_HOLD_MS = 320;
const NOTE_LOCK_MS = 320;
const AUTO_CLEAR_HOLD_MS = 650;
const TARGET_ZONE_CENTS = 18;
const ACTIVE_CONFIDENCE = 0.45;
const ACTIVE_ENERGY = 0.012;
const TREND_WINDOW_MS = 15000;
const TREND_SAMPLE_MS = 85;

export function SwaraTrainer() {
  const [selectedStepId, setSelectedStepId] = useState<string>(firstStep?.id ?? "");
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [target, setTarget] = useState<SwaraTarget>(firstStep?.target ?? { swara: "Sa", octave: "Madhya" });
  const [tonic, setTonic] = useState<number>(261.63);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkpointNotice, setCheckpointNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({
    detected: null,
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
  const selectedStepRef = useRef<LessonStep | null>(selectedStep ?? null);
  const targetRef = useRef<SwaraTarget>(selectedStep?.target ?? target);
  const analysisRef = useRef<AnalysisState>({
    detected: null,
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
    analysisRef.current = analysis;
  }, [analysis]);

  function resetLiveState() {
    sustainStartRef.current = null;
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
    const detected = resolveSwaraReading({
      frequency: pitch.frequency,
      tonicFrequency: tonic,
      confidence: pitch.confidence,
      target: liveStep?.target,
      previous: previousReadingRef.current,
      spectrum,
      sampleRate: audioContext.sampleRate,
    });

    const isActiveCandidate = Boolean(detected && pitch.confidence >= ACTIVE_CONFIDENCE && energy >= ACTIVE_ENERGY);
    const energyPercent = Math.min(100, energy * 5000);
    const hissPercent = estimateHissLevel(spectrum, pitch.confidence, energyPercent);

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

      if (noteIsOnTarget) {
        if (!sustainStartRef.current) {
          sustainStartRef.current = now;
        }

        sustainMs = now - sustainStartRef.current;
      } else {
        sustainStartRef.current = null;
      }

      const centsToTrack = visibleReading?.centsOffset ?? detected.centsOffset;
      recentCentsRef.current = [...recentCentsRef.current.slice(-24), centsToTrack];
      const variance = stdDev(recentCentsRef.current);
      stability = Math.max(0, 100 - variance * 2.8);
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

      if (shouldClear) {
        visibleReading = null;
        visibleReadingRef.current = null;
        sustainStartRef.current = null;
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

    if (checkpointNoticeTimerRef.current !== null) {
      window.clearTimeout(checkpointNoticeTimerRef.current);
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

    const audioContext = new window.AudioContext();
    const master = audioContext.createGain();
    master.gain.value = 0.0001;
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
    playTone(784, now, 0.16, 0.14);
    playTone(988, now + 0.11, 0.2, 0.11);

    window.setTimeout(() => {
      audioContext.close().catch(() => {});
    }, 450);
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
  const nextModules = currentModuleIndex >= 0 ? foundationModules.slice(currentModuleIndex + 1, currentModuleIndex + 3) : [];
  const currentStepIndex = allLessonSteps.findIndex((step) => step.id === selectedStepId);
  const nextSteps = currentStepIndex >= 0 ? allLessonSteps.slice(currentStepIndex + 1, currentStepIndex + 4) : [];
  const overallProgress = allLessonSteps.length
    ? Math.round((completedStepIds.length / allLessonSteps.length) * 100)
    : 0;
  const selectedStepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
  const currentTargetFrequency = targetFrequencyFor(target, tonic);
  const currentCheckpointCleared = completedStepIds.includes(selectedStepId);
  const tonicLabel = tonicOptions.find((option) => option.frequency === tonic)?.label ?? `${tonic.toFixed(1)} Hz`;
  const swaraReference = swaraTargets.map((entry) => ({
    ...entry,
    frequency: targetFrequencyFor(entry, tonic),
  }));

  return (
    <main className="shell" style={{ width: "min(1560px, calc(100vw - 24px))", paddingTop: 20, paddingBottom: 20 }}>
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
              Choose a tonic, clear each guided checkpoint, and keep the feedback visible without
              needing to scroll while playing.
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
                <select className="select" value={tonic} onChange={(event) => setTonic(Number(event.target.value))}>
                  {tonicOptions.map((option) => (
                    <option key={option.label} value={option.frequency}>
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
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.85fr)",
            gap: 14,
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div className="pill">Live target</div>
                    <div style={{ marginTop: 10, fontSize: 28, fontWeight: 750, letterSpacing: "-0.05em" }}>
                      {target.octave} {target.swara}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                      {selectedStep?.title ?? "Current checkpoint"} · {currentTargetFrequency.toFixed(1)} Hz
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div className="pill">Detected</div>
                    <div style={{ marginTop: 10, fontSize: 28, fontWeight: 750, letterSpacing: "-0.05em" }}>
                      {analysis.detected ? `${analysis.detected.octave} ${analysis.detected.swara}` : "—"}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                      {analysis.detected ? `${analysis.detected.frequency.toFixed(1)} Hz · ${signedCents(analysis.centsOffset ?? 0)}¢` : "Waiting for stable tone"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                  <LiveStat label="Score" value={scoreValue != null ? `${scoreValue}` : "—"} tone="high" />
                  <LiveStat
                    label="Sustain"
                    value={analysis.sustainMs != null ? `${(analysis.sustainMs / 1000).toFixed(1)}s` : "—"}
                    tone="high"
                  />
                  <LiveStat
                    label="Voicing"
                    value={analysis.confidence != null ? `${Math.round((analysis.confidence ?? 0) * 100)}%` : "—"}
                    tone="center"
                  />
                  <LiveStat
                    label="Noise"
                    value={analysis.noise != null ? `${Math.round(analysis.noise)}%` : "—"}
                    tone="low"
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
                  {analysis.detected ? result.summary : "Silent input is hidden until a stable flute tone appears."}
                </div>
                <p className="section-copy" style={{ margin: 0, fontSize: 14 }}>
                  The detector now judges the checkpoint only when note, octave, target zone, and sustain all agree.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
                    Goal {selectedStep ? `${selectedStep.minimumScore}+` : "—"}
                  </span>
                  <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
                    Sustain {selectedStep ? `${(selectedStep.sustainTargetMs / 1000).toFixed(1)}s` : "—"}
                  </span>
                  <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>
                    {currentCheckpointCleared ? "Cleared" : "In progress"}
                  </span>
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
                label="Current checkpoint"
                value={`${target.octave} ${target.swara}`}
                subvalue={`${target.swara} · ${target.octave} · ${currentTargetFrequency.toFixed(1)} Hz`}
                hint={selectedStep ? selectedStep.title : "Current goal"}
                trend={analysis.trend}
                sparkMetric="centsOffset"
                range={[-60, 60]}
                sparkMode="center"
                highlight
              />
              <MetricCard
                label="Detected"
                value={analysis.detected ? `${analysis.detected.octave} ${analysis.detected.swara}` : null}
                subvalue={
                  analysis.detected
                    ? `${analysis.detected.swara} swara · ${analysis.detected.octave} octave`
                    : "Waiting for voiced note"
                }
                hint={analysis.detected ? `${analysis.detected.frequency.toFixed(1)} Hz` : "Silent input hidden"}
                trend={analysis.trend}
                sparkMetric="centsOffset"
                range={[-60, 60]}
                sparkMode="center"
              />
              <MetricCard
                label="Pitch Offset"
                value={analysis.detected ? `${signedCents(analysis.centsOffset ?? 0)}¢` : null}
                subvalue={analysis.detected ? describePitchOffset(analysis.centsOffset ?? 0) : "Hidden while silent"}
                hint={analysis.detected ? "Cent deviation" : "No live reading"}
                trend={analysis.trend}
                sparkMetric="centsOffset"
                range={[-60, 60]}
                sparkMode="center"
              />
              <MetricCard
                label="Attempt Score"
                value={scoreValue != null ? `${scoreValue}` : null}
                subvalue={analysis.detected ? (masteryReady ? "Checkpoint clearable" : "Keep practicing") : "Hidden while silent"}
                hint="Mastery"
                trend={analysis.trend}
                sparkMetric="score"
                range={[0, 100]}
                sparkMode="high"
              />
              <MetricCard
                label="Sustain"
                value={analysis.sustainMs != null ? `${(analysis.sustainMs / 1000).toFixed(1)}s` : null}
                subvalue={selectedStep ? `Target ${(selectedStep.sustainTargetMs / 1000).toFixed(1)}s` : "Target sustain"}
                hint={analysis.detected ? "Current hold" : "Hidden while silent"}
                trend={analysis.trend}
                sparkMetric="sustainMs"
                range={[0, selectedStep?.sustainTargetMs ?? 3000]}
                sparkMode="high"
              />
              <MetricCard
                label="Stability"
                value={analysis.stability != null ? `${Math.round(analysis.stability)}` : null}
                subvalue={analysis.detected ? describeStability(analysis.stability ?? 0) : "Hidden while silent"}
                hint="Less wobble is better"
                trend={analysis.trend}
                sparkMetric="stability"
                range={[0, 100]}
                sparkMode="high"
              />
              <MetricCard
                label="Voicing"
                value={analysis.confidence != null ? `${Math.round((analysis.confidence ?? 0) * 100)}%` : null}
                subvalue={analysis.detected ? describeConfidence(analysis.confidence ?? 0) : "Hidden while silent"}
                hint="Tone clarity"
                trend={analysis.trend}
                sparkMetric="confidence"
                range={[0, 100]}
                sparkMode="high"
              />
              <MetricCard
                label="Hiss / noise"
                value={analysis.noise != null ? `${Math.round(analysis.noise)}%` : null}
                subvalue={analysis.detected ? "Lower is cleaner" : "Hidden while silent"}
                hint="Air / finger leak noise"
                trend={analysis.trend}
                sparkMetric="noise"
                range={[0, 100]}
                sparkMode="low"
              />
              <MetricCard
                label="Input Energy"
                value={analysis.energy != null ? `${Math.round(analysis.energy)}` : null}
                subvalue={analysis.detected ? describeEnergy(analysis.energy ?? 0) : "Hidden while silent"}
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
              gap: 12,
              alignSelf: "start",
              position: "sticky",
              top: 14,
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
              <div className="pill">Journey</div>
              <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: "-0.05em" }}>{overallProgress}%</div>
              <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>
                {completedStepIds.length} of {allLessonSteps.length} checkpoints cleared
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${clamp(overallProgress, 0, 100)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Current checkpoint</div>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>
                    {selectedStep?.title ?? "Choose a checkpoint"}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                    Step {selectedStepNumber || 1} · {target.octave} {target.swara} · {currentTargetFrequency.toFixed(1)} Hz
                  </div>
                </div>

                <div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Module</div>
                  <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-0.03em" }}>
                    {currentModule?.title ?? "Foundation"}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                    {currentModule?.description ?? "Start with the first breath and clean Sa."}
                  </div>
                </div>

                <div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Next steps</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {nextSteps.length ? (
                      nextSteps.map((step, index) => (
                        <div key={step.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span
                            className="pill"
                            style={{
                              padding: "4px 10px",
                              fontSize: 11,
                              minWidth: 28,
                              justifyContent: "center",
                            }}
                          >
                            {index + 1}
                          </span>
                          <span style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.35 }}>{step.title}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>No more steps in this path.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Next modules</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {nextModules.length ? (
                      nextModules.map((module) => (
                        <div key={module.id} style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.35 }}>
                          {module.title}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>You are at the end of the preview path.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <SwaraReferencePanel tonicLabel={tonicLabel} rows={swaraReference} />
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
        <div style={{ marginTop: 4, color: "var(--muted)", lineHeight: 1.45, fontSize: 12.5 }}>
          {props.subvalue}
        </div>
        <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.45, fontSize: 12.5 }}>
          {props.hint}
        </div>
      </div>
    </article>
  );
}

function LiveStat(props: { label: string; value: string; tone: "center" | "high" | "low" }) {
  const background =
    props.tone === "center"
      ? "linear-gradient(180deg, rgba(103,240,202,0.12), rgba(103,240,202,0.04))"
      : props.tone === "high"
        ? "linear-gradient(180deg, rgba(117,184,255,0.14), rgba(117,184,255,0.05))"
        : "linear-gradient(180deg, rgba(255,189,89,0.14), rgba(255,189,89,0.05))";

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background,
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em" }}>{props.value}</div>
    </div>
  );
}

function SwaraReferencePanel(props: {
  tonicLabel: string;
  rows: Array<SwaraTarget & { frequency: number }>;
}) {
  const grouped = ["Mandra", "Madhya", "Tara"].map((octave) => ({
    octave,
    rows: props.rows.filter((row) => row.octave === octave),
  }));

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
            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>
              All 3 octaves for tonic {props.tonicLabel}
            </div>
          </div>
          <span className="pill" style={{ padding: "6px 12px", fontSize: 11 }}>Open</span>
        </div>
      </summary>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {grouped.map((group) => (
          <div key={group.octave} style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{group.octave} octave</div>
            <div style={{ display: "grid", gap: 6 }}>
              {group.rows.map((row) => (
                <div
                  key={`${row.octave}-${row.swara}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{row.swara}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{row.octave}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{row.frequency.toFixed(1)} Hz</span>
                </div>
              ))}
            </div>
          </div>
        ))}
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
  const width = 640;
  const height = 88;
  const middle = height / 2;
  const minCents = -60;
  const maxCents = 60;
  const usableWidth = width - 48;
  const leftPad = 24;
  const points = filterTrendWindow(props.points);
  const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();

  const path = points
    .map((point) => {
      if (point.centsOffset == null) {
        return null;
      }

      const x = leftPad + clamp(1 - (latestTimestamp - point.timestamp) / TREND_WINDOW_MS, 0, 1) * usableWidth;
      const normalized = clamp((point.centsOffset - minCents) / (maxCents - minCents), 0, 1);
      const y = height - 24 - normalized * (height - 48);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

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
          <div style={{ marginTop: 8, fontSize: 17, fontWeight: 650 }}>Pitch movement over the last 15 seconds</div>
          <div style={{ marginTop: 6, color: "var(--muted)", lineHeight: 1.45, fontSize: 13 }}>
            {props.silent
              ? "Silence is hidden here until a stable tone returns."
              : `Tracking ${props.detected?.octave ?? props.target.octave} ${props.detected?.swara ?? props.target.swara} against the target center line.`}
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
          padding: 10,
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="112" aria-hidden="true">
          <rect x="0" y="0" width={width} height={height * 0.28} fill="rgba(255, 99, 99, 0.08)" />
          <rect x="0" y={height * 0.28} width={width} height={height * 0.44} fill="rgba(103,240,202,0.08)" />
          <rect x="0" y={height * 0.72} width={width} height={height * 0.28} fill="rgba(255, 189, 89, 0.08)" />
          <line x1="24" y1={middle} x2={width - 24} y2={middle} stroke="rgba(255,255,255,0.22)" strokeDasharray="6 6" />
          <line x1="24" y1="24" x2="24" y2={height - 24} stroke="rgba(255,255,255,0.06)" />
          <line x1={width / 2} y1="24" x2={width / 2} y2={height - 24} stroke="rgba(117,184,255,0.18)" />

          {points.map((point, index) => {
            if (point.centsOffset == null) {
              return null;
            }

            const x = leftPad + clamp(1 - (latestTimestamp - point.timestamp) / TREND_WINDOW_MS, 0, 1) * usableWidth;
            const normalized = clamp((point.centsOffset - minCents) / (maxCents - minCents), 0, 1);
            const y = height - 24 - normalized * (height - 48);
            const opacity = point.active ? 0.95 : 0.4;

            return (
              <circle
                key={`${point.timestamp}-${index}`}
                cx={x}
                cy={y}
                r={point.active ? 4.5 : 3}
                fill="rgba(103,240,202,0.9)"
                opacity={opacity}
              />
            );
          })}

          {path ? (
            <polyline
              points={path}
              fill="none"
              stroke="url(#signalGradient)"
              strokeWidth="3"
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

          <text x="8" y="16" fill="rgba(255,255,255,0.6)" fontSize="10">High</text>
          <text x="8" y={height / 2 + 4} fill="rgba(255,255,255,0.76)" fontSize="10">Target zone</text>
          <text x="8" y={height - 8} fill="rgba(255,255,255,0.6)" fontSize="10">Low</text>
          <text x="width - 42" y={height - 8} fill="rgba(255,255,255,0.6)" fontSize="10">Now</text>
          <text x="24" y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">15s ago</text>
          <text x={width / 2 - 16} y={height - 8} fill="rgba(255,255,255,0.42)" fontSize="10">~7s</text>
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

function estimateHissLevel(spectrum: Uint8Array, confidence: number, energy: number) {
  if (!spectrum.length) {
    return Math.max(0, Math.min(100, (1 - confidence) * 100));
  }

  const splitIndex = Math.max(4, Math.floor(spectrum.length * 0.3));
  const highStart = Math.max(splitIndex, Math.floor(spectrum.length * 0.65));

  const lowBand = average(spectrum.slice(0, splitIndex));
  const highBand = average(spectrum.slice(highStart));
  const totalBand = average(spectrum);

  const highRatio = highBand / Math.max(1, totalBand);
  const spread = Math.max(0, highBand - lowBand) / 255;
  const quietPenalty = energy < 14 ? 12 : 0;

  return clamp(highRatio * 70 + spread * 45 + (1 - confidence) * 30 + quietPenalty, 0, 100);
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
