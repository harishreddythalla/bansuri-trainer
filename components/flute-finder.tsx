"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultFluteProfile,
  detectClosestFluteProfile,
  detectPitch,
  fluteProfileById,
  type FluteProfile,
} from "@/lib/swara";

const ACTIVE_CONFIDENCE = 0.45;
const ACTIVE_ENERGY = 0.012;
const NOTE_LOCK_MS = 300;
const DETECT_HOLD_MS = 2200;
const TOLERANCE_CENTS = 45;

export const FLUTE_PROFILE_STORAGE_KEY = "bansuri.selectedFluteProfileId";
const canUsePersistentStorage = process.env.NODE_ENV === "production";

type FinderState = {
  status: string;
  frequency: number | null;
  confidence: number | null;
  energy: number | null;
  centsOffset: number | null;
  candidate: FluteProfile | null;
  holdMs: number;
  complete: boolean;
};

export function readStoredFluteProfile() {
  if (!canUsePersistentStorage) {
    return defaultFluteProfile;
  }

  try {
    if (typeof window === "undefined") {
      return defaultFluteProfile;
    }

    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return defaultFluteProfile;
    }

    return fluteProfileById(storage.getItem(FLUTE_PROFILE_STORAGE_KEY)) ?? defaultFluteProfile;
  } catch {
    return defaultFluteProfile;
  }
}

export function storeFluteProfile(profile: FluteProfile) {
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

    storage.setItem(FLUTE_PROFILE_STORAGE_KEY, profile.id);
  } catch {
    // best-effort
  }
}

export function FluteFinder(props: {
  title?: string;
  compact?: boolean;
  onDetected?: (profile: FluteProfile) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FinderState>({
    status: "Play Sa with the upper three holes closed.",
    frequency: null,
    confidence: null,
    energy: null,
    centsOffset: null,
    candidate: null,
    holdMs: 0,
    complete: false,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const candidateLockRef = useRef<{ profileId: string; startedAt: number; stableSince: number } | null>(null);
  const lastCommitRef = useRef(0);

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  async function start() {
    setError(null);
    stop();

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
      analyser.smoothingTimeConstant = 0.32;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      candidateLockRef.current = null;
      lastCommitRef.current = 0;
      setRunning(true);
      setState({
        status: "Listening. Hold a clean Sa steadily for about 3 seconds.",
        frequency: null,
        confidence: null,
        energy: null,
        centsOffset: null,
        candidate: null,
        holdMs: 0,
        complete: false,
      });
      tick();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Microphone access failed.");
    }
  }

  function stop() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioContextRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach((track) => track.stop());

    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    candidateLockRef.current = null;
    setRunning(false);
  }

  function tick() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;

    if (!analyser || !audioContext) {
      return;
    }

    const now = performance.now();
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const pitch = detectPitch(buffer, audioContext.sampleRate);
    const energy = rms(buffer);
    const match = detectClosestFluteProfile(pitch.frequency);
    const active = Boolean(match && pitch.confidence >= ACTIVE_CONFIDENCE && energy >= ACTIVE_ENERGY);

    let nextState: FinderState = {
      status: "Play Sa with the upper three holes closed.",
      frequency: null,
      confidence: null,
      energy: null,
      centsOffset: null,
      candidate: null,
      holdMs: 0,
      complete: false,
    };

    if (active && match) {
      if (!candidateLockRef.current || candidateLockRef.current.profileId !== match.profile.id) {
        candidateLockRef.current = {
          profileId: match.profile.id,
          startedAt: now,
          stableSince: now,
        };
      } else if (Math.abs(match.centsOffset) <= TOLERANCE_CENTS) {
        if (now - candidateLockRef.current.startedAt >= NOTE_LOCK_MS) {
          candidateLockRef.current.stableSince = candidateLockRef.current.stableSince || now;
        }
      } else {
        candidateLockRef.current.startedAt = now;
        candidateLockRef.current.stableSince = now;
      }

      const holdMs =
        now - candidateLockRef.current.startedAt >= NOTE_LOCK_MS && Math.abs(match.centsOffset) <= TOLERANCE_CENTS
          ? now - candidateLockRef.current.stableSince
          : 0;

      const complete = holdMs >= DETECT_HOLD_MS;
      nextState = {
        status: complete
          ? `Detected ${match.profile.tonicLabel} ${match.profile.registerLabel}.`
          : `Likely ${match.profile.tonicLabel} ${match.profile.registerLabel}. Keep Sa steady.`,
        frequency: match.frequency,
        confidence: pitch.confidence,
        energy: energy * 5000,
        centsOffset: match.centsOffset,
        candidate: match.profile,
        holdMs,
        complete,
      };

      if (complete) {
        storeFluteProfile(match.profile);
        props.onDetected?.(match.profile);
        stop();
        setState(nextState);
        return;
      }
    } else {
      candidateLockRef.current = null;
    }

    if (now - lastCommitRef.current >= 180 || nextState.complete) {
      lastCommitRef.current = now;
      setState(nextState);
    }

    frameRef.current = requestAnimationFrame(tick);
  }

  return (
    <div
      className="glass"
      style={{
        borderRadius: props.compact ? 24 : 28,
        padding: props.compact ? 16 : 20,
        background: "rgba(255,255,255,0.04)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <div className="pill">Know your flute</div>
          <div style={{ marginTop: 10, fontSize: props.compact ? 20 : 24, fontWeight: 700, letterSpacing: "-0.04em" }}>
            {props.title ?? "Auto-detect tonic and flute register"}
          </div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14, lineHeight: 1.5, maxWidth: 680 }}>
            Play a soft, steady Sa with the upper three holes closed. The detector identifies the nearest standard flute profile and stores it for the trainer.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button button-primary" onClick={() => void start()} disabled={running}>
            {running ? "Listening..." : "Detect flute"}
          </button>
          <button className="button button-secondary" onClick={stop} disabled={!running}>
            Stop
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <MiniStat label="Likely flute" value={state.candidate ? `${state.candidate.tonicLabel} ${state.candidate.registerLabel}` : "—"} />
        <MiniStat label="Sa frequency" value={state.frequency ? `${state.frequency.toFixed(1)} Hz` : "—"} />
        <MiniStat label="Offset" value={state.centsOffset != null ? `${state.centsOffset > 0 ? "+" : ""}${Math.round(state.centsOffset)}¢` : "—"} />
        <MiniStat label="Hold" value={`${(state.holdMs / 1000).toFixed(1)}s`} />
      </div>

      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, (state.holdMs / DETECT_HOLD_MS) * 100)}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(117,184,255,0.95), rgba(103,240,202,0.95))",
            transition: "width 180ms ease",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="pill">{state.status}</span>
        {state.candidate ? (
          <span className="pill">
            Target Sa {state.candidate.saFrequency.toFixed(1)} Hz
          </span>
        ) : null}
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
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(117,184,255,0.08), rgba(255,255,255,0.03))",
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, letterSpacing: "-0.04em" }}>{props.value}</div>
    </div>
  );
}

function rms(buffer: Float32Array) {
  let sum = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }

  return Math.sqrt(sum / buffer.length);
}
