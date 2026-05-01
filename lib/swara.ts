import { PitchDetector } from "pitchy";

export type SwaraName = "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Da" | "Ni";
export type OctaveName = "Mandra" | "Madhya" | "Tara";

export type SwaraTarget = {
  swara: SwaraName;
  octave: OctaveName;
};

export type DetectedSwara = SwaraTarget & {
  frequency: number;
  centsOffset: number;
  confidence: number;
  midi: number;
};

export type PitchReading = {
  frequency: number;
  confidence: number;
};

const swaraSteps = [
  { swara: "Sa", step: 0 },
  { swara: "Re", step: 2 },
  { swara: "Ga", step: 4 },
  { swara: "Ma", step: 5 },
  { swara: "Pa", step: 7 },
  { swara: "Da", step: 9 },
  { swara: "Ni", step: 11 },
] as const;

export const tonicOptions = [
  { label: "C", frequency: 261.63 },
  { label: "C♯ / D♭", frequency: 277.18 },
  { label: "D", frequency: 293.66 },
  { label: "D♯ / E♭", frequency: 311.13 },
  { label: "E", frequency: 329.63 },
  { label: "F", frequency: 349.23 },
  { label: "F♯ / G♭", frequency: 369.99 },
  { label: "G", frequency: 392.0 },
] as const;

export const swaraTargets: SwaraTarget[] = ["Mandra", "Madhya", "Tara"].flatMap((octave) =>
  swaraSteps.map(({ swara }) => ({
    swara,
    octave: octave as OctaveName,
  })),
);

function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function targetToMidi(target: SwaraTarget, tonicFrequency: number) {
  const tonicMidi = frequencyToMidi(tonicFrequency);
  const step = swaraSteps.find((item) => item.swara === target.swara)?.step ?? 0;
  const octaveOffset = target.octave === "Mandra" ? -1 : target.octave === "Tara" ? 1 : 0;

  return tonicMidi + octaveOffset * 12 + step;
}

export function targetFrequencyFor(target: SwaraTarget, tonicFrequency: number) {
  return midiToFrequency(targetToMidi(target, tonicFrequency));
}

function centsBetween(frequencyA: number, frequencyB: number) {
  return 1200 * Math.log2(frequencyA / frequencyB);
}

const detectorCache = new Map<number, PitchDetector<Float32Array>>();

function getPitchDetector(inputLength: number) {
  const existing = detectorCache.get(inputLength);

  if (existing) {
    return existing;
  }

  const created = PitchDetector.forFloat32Array(inputLength);
  detectorCache.set(inputLength, created);

  return created;
}

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchReading {
  const detector = getPitchDetector(buffer.length);
  const [pitch, clarity] = detector.findPitch(buffer, sampleRate);

  if (Number.isFinite(pitch) && pitch > 0) {
    return {
      frequency: pitch,
      confidence: Math.max(0, Math.min(1, clarity)),
    };
  }

  return {
    frequency: -1,
    confidence: 0,
  };
}

export function classifySwara(
  frequency: number,
  tonicFrequency: number,
  confidence: number,
): DetectedSwara | null {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  const tonicMidi = frequencyToMidi(tonicFrequency);

  let bestMatch:
    | {
        swara: SwaraName;
        octave: OctaveName;
        midi: number;
        centsOffset: number;
      }
    | undefined;

  for (const octaveOffset of [-1, 0, 1] as const) {
    for (const { swara, step } of swaraSteps) {
      const targetMidi = tonicMidi + octaveOffset * 12 + step;
      const targetFrequency = midiToFrequency(targetMidi);
      const centsOffset = 1200 * Math.log2(frequency / targetFrequency);

      if (!bestMatch || Math.abs(centsOffset) < Math.abs(bestMatch.centsOffset)) {
        bestMatch = {
          swara,
          octave: octaveOffset === -1 ? "Mandra" : octaveOffset === 0 ? "Madhya" : "Tara",
          midi: targetMidi,
          centsOffset,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    swara: bestMatch.swara,
    octave: bestMatch.octave,
    frequency,
    centsOffset: bestMatch.centsOffset,
    confidence,
    midi: bestMatch.midi,
  };
}

export function resolveSwaraReading(params: {
  frequency: number;
  tonicFrequency: number;
  confidence: number;
  target?: SwaraTarget;
  previous?: DetectedSwara | null;
  spectrum?: Uint8Array;
  sampleRate?: number;
}): DetectedSwara | null {
  const { frequency, tonicFrequency, confidence, target, previous, spectrum, sampleRate } = params;

  const candidates = [
    { frequency, scalePenalty: 0 },
    { frequency: frequency / 2, scalePenalty: 10 },
    { frequency: frequency / 4, scalePenalty: 24 },
    { frequency: frequency * 2, scalePenalty: 34 },
    { frequency: frequency * 4, scalePenalty: 56 },
  ].filter((candidate) => Number.isFinite(candidate.frequency) && candidate.frequency > 0);

  let bestReading: DetectedSwara | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const reading = classifySwara(candidate.frequency, tonicFrequency, confidence);

    if (!reading) {
      continue;
    }

    let score = candidate.scalePenalty + Math.abs(reading.centsOffset) * 0.08;

    if (spectrum && sampleRate) {
      score -= harmonicSupport(candidate.frequency, spectrum, sampleRate) * 0.22;
    }

    if (target) {
      if (reading.swara !== target.swara) {
        score += 10;
      }

      if (reading.octave === target.octave) {
        score -= 6;
      } else {
        score += 6;
      }
    }

    if (previous) {
      score += Math.abs(centsBetween(candidate.frequency, previous.frequency)) * 0.01;
      if (reading.swara === previous.swara && reading.octave === previous.octave) {
        score -= 12;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestReading = reading;
    }
  }

  return bestReading;
}

function harmonicSupport(frequency: number, spectrum: Uint8Array, sampleRate: number) {
  if (!spectrum.length || !Number.isFinite(frequency) || frequency <= 0) {
    return 0;
  }

  const binWidth = sampleRate / (spectrum.length * 2);
  const harmonics = [
    { multiplier: 1, weight: 1 },
    { multiplier: 2, weight: 0.82 },
    { multiplier: 3, weight: 0.58 },
    { multiplier: 4, weight: 0.42 },
  ];

  let support = 0;

  for (const harmonic of harmonics) {
    const harmonicFrequency = frequency * harmonic.multiplier;
    const bin = harmonicFrequency / binWidth;

    if (bin >= spectrum.length) {
      continue;
    }

    support += samplePeakAround(spectrum, Math.round(bin), 2) * harmonic.weight;
  }

  return support / 255;
}

function samplePeakAround(spectrum: Uint8Array, center: number, radius: number) {
  let peak = 0;

  for (let index = Math.max(0, center - radius); index <= Math.min(spectrum.length - 1, center + radius); index += 1) {
    peak = Math.max(peak, spectrum[index]);
  }

  return peak;
}

export function scoreAttempt(params: {
  target: SwaraTarget;
  detected: DetectedSwara | null;
  sustainMs: number;
  stability: number;
  noise: number;
}) {
  const { target, detected, sustainMs, stability, noise } = params;

  if (!detected) {
    return {
      score: 0,
      summary: "No stable flute tone detected yet.",
    };
  }

  const pitchScore = Math.max(0, 100 - Math.min(Math.abs(detected.centsOffset), 80) * 1.25);
  const octaveScore = detected.octave === target.octave ? 100 : 0;
  const swaraScore = detected.swara === target.swara ? 100 : 0;
  const sustainScore = Math.min(100, (sustainMs / 3000) * 100);
  const stabilityScore = Math.max(0, Math.min(100, stability));
  const noiseScore = Math.max(0, Math.min(100, 100 - noise));

  const score =
    swaraScore * 0.3 +
    pitchScore * 0.2 +
    octaveScore * 0.15 +
    sustainScore * 0.15 +
    stabilityScore * 0.1 +
    noiseScore * 0.1;

  let summary = "Good attempt. Keep the tone steady.";

  if (detected.swara !== target.swara) {
    summary = `You played ${detected.swara} instead of ${target.swara}.`;
  } else if (detected.octave !== target.octave) {
    summary = `Correct swara, but the octave is ${detected.octave} instead of ${target.octave}.`;
  } else if (Math.abs(detected.centsOffset) > 24) {
    summary = detected.centsOffset > 0 ? "A little high. Ease the airflow slightly." : "A little low. Add a touch more support.";
  } else if (Math.abs(detected.centsOffset) > 14) {
    summary = detected.centsOffset > 0 ? "Close, but still a touch high." : "Close, but still a touch low.";
  } else if (sustainMs < 2200) {
    summary = "Pitch is close. Hold the note longer to clear the checkpoint.";
  } else if (stability < 70) {
    summary = "The note is right, but airflow stability still needs work.";
  }

  return {
    score: Math.round(score),
    summary,
  };
}
