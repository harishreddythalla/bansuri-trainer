import { PitchDetector } from "pitchy";

export type SwaraName = "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Da" | "Ni";
export type OctaveName = "Mandra" | "Madhya" | "Tara";
export type TonicName = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
export type FluteRegister = "Bass" | "Medium" | "Small";

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

export type FluteProfile = {
  id: string;
  tonic: TonicName;
  tonicLabel: string;
  register: FluteRegister;
  registerLabel: string;
  saFrequency: number;
  saOctave: number;
  description: string;
};

export type FluteMatch = {
  profile: FluteProfile;
  centsOffset: number;
  frequency: number;
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

const tonicDefinitions: Array<{ tonic: TonicName; label: string; semitone: number }> = [
  { tonic: "C", label: "C", semitone: 0 },
  { tonic: "C#", label: "C# / Db", semitone: 1 },
  { tonic: "D", label: "D", semitone: 2 },
  { tonic: "D#", label: "D# / Eb", semitone: 3 },
  { tonic: "E", label: "E", semitone: 4 },
  { tonic: "F", label: "F", semitone: 5 },
  { tonic: "F#", label: "F# / Gb", semitone: 6 },
  { tonic: "G", label: "G", semitone: 7 },
  { tonic: "G#", label: "G# / Ab", semitone: 8 },
  { tonic: "A", label: "A", semitone: 9 },
  { tonic: "A#", label: "A# / Bb", semitone: 10 },
  { tonic: "B", label: "B", semitone: 11 },
];

const registerDefinitions: Array<{ register: FluteRegister; label: string; saOctave: number; description: string }> = [
  { register: "Bass", label: "Bass", saOctave: 4, description: "Long bansuri, lower Sa register" },
  { register: "Medium", label: "Medium", saOctave: 5, description: "Common learner murali range" },
  { register: "Small", label: "Small", saOctave: 6, description: "Short soprano / anup range" },
];

export const tonicOptions = tonicDefinitions.map(({ tonic, label }) => ({ tonic, label }));
export const fluteRegisterOptions = registerDefinitions.map(({ register, label }) => ({ register, label }));
export const fluteProfiles: FluteProfile[] = registerDefinitions.flatMap((registerDefinition) =>
  tonicDefinitions.map((tonicDefinition) => {
    const saFrequency = midiToFrequency(noteMidi(tonicDefinition.semitone, registerDefinition.saOctave));
    return {
      id: `${tonicDefinition.tonic}-${registerDefinition.register}`.toLowerCase(),
      tonic: tonicDefinition.tonic,
      tonicLabel: tonicDefinition.label,
      register: registerDefinition.register,
      registerLabel: registerDefinition.label,
      saFrequency,
      saOctave: registerDefinition.saOctave,
      description: `${tonicDefinition.label} ${registerDefinition.label} · Sa ~ ${saFrequency.toFixed(1)} Hz`,
    };
  }),
);

export const defaultFluteProfile = fluteProfiles.find((profile) => profile.id === "c-medium") ?? fluteProfiles[0];

export const swaraTargets: SwaraTarget[] = ["Mandra", "Madhya", "Tara"].flatMap((octave) =>
  swaraSteps.map(({ swara }) => ({
    swara,
    octave: octave as OctaveName,
  })),
);

function noteMidi(semitone: number, octave: number) {
  return 12 * (octave + 1) + semitone;
}

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function midiToNoteName(midi: number) {
  const rounded = Math.round(midi);
  return noteNames[((rounded % 12) + 12) % 12];
}

export function westernNoteForSwara(target: SwaraTarget, tonicFrequency: number) {
  return midiToNoteName(targetToMidi(target, tonicFrequency));
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
    { frequency: frequency / 2, scalePenalty: 8 },
    { frequency: frequency / 4, scalePenalty: 22 },
    { frequency: frequency * 2, scalePenalty: 36 },
    { frequency: frequency * 4, scalePenalty: 60 },
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
      score -= harmonicSupport(candidate.frequency, spectrum, sampleRate) * 0.28;
      score += overtonePenalty(candidate.frequency, spectrum, sampleRate) * 10;
    }

    if (target) {
      if (reading.swara !== target.swara) {
        score += 10;
      }

      if (reading.octave === target.octave) {
        score -= 8;
      } else {
        score += 7;
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

export function detectClosestFluteProfile(frequency: number): FluteMatch | null {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  let bestMatch: FluteMatch | null = null;

  for (const profile of fluteProfiles) {
    const centsOffset = centsBetween(frequency, profile.saFrequency);
    if (!bestMatch || Math.abs(centsOffset) < Math.abs(bestMatch.centsOffset)) {
      bestMatch = {
        profile,
        centsOffset,
        frequency,
      };
    }
  }

  return bestMatch;
}

export function fluteProfileById(profileId: string | null | undefined) {
  if (!profileId) {
    return null;
  }

  return fluteProfiles.find((profile) => profile.id === profileId) ?? null;
}

export function fluteProfileForSelection(tonic: TonicName, register: FluteRegister) {
  return fluteProfiles.find((profile) => profile.tonic === tonic && profile.register === register) ?? defaultFluteProfile;
}

export function isPlayableSwaraForProfile(profile: FluteProfile, target: SwaraTarget) {
  if (target.octave !== "Mandra") {
    return true;
  }

  if (profile.register === "Bass") {
    return true;
  }

  if (profile.register === "Medium") {
    return target.swara === "Pa" || target.swara === "Da" || target.swara === "Ni";
  }

  return false;
}

function harmonicSupport(frequency: number, spectrum: Uint8Array, sampleRate: number) {
  if (!spectrum.length || !Number.isFinite(frequency) || frequency <= 0) {
    return 0;
  }

  const binWidth = sampleRate / (spectrum.length * 2);
  const harmonics = [
    { multiplier: 1, weight: 1 },
    { multiplier: 2, weight: 0.8 },
    { multiplier: 3, weight: 0.56 },
    { multiplier: 4, weight: 0.38 },
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

function overtonePenalty(frequency: number, spectrum: Uint8Array, sampleRate: number) {
  if (!spectrum.length || !Number.isFinite(frequency) || frequency <= 0) {
    return 0;
  }

  const binWidth = sampleRate / (spectrum.length * 2);
  const fundamentalPeak = samplePeakAround(spectrum, Math.round(frequency / binWidth), 2);
  const octavePeak = samplePeakAround(spectrum, Math.round((frequency * 2) / binWidth), 2);
  const doubleOctavePeak = samplePeakAround(spectrum, Math.round((frequency * 4) / binWidth), 2);

  if (fundamentalPeak <= 0) {
    return 0;
  }

  return Math.max(0, (octavePeak * 0.65 + doubleOctavePeak * 0.35 - fundamentalPeak) / 255);
}

export function estimateNoiseLevel(params: {
  spectrum: Uint8Array;
  frequency: number;
  confidence: number;
  energy: number;
  stability?: number | null;
  sampleRate: number;
}) {
  const { spectrum, frequency, confidence, energy, stability, sampleRate } = params;

  if (!spectrum.length) {
    const confidencePenalty = (1 - clamp(confidence, 0, 1)) * 100;
    const energyPenalty = energy < 18 ? 18 : 0;
    return clamp(confidencePenalty + energyPenalty, 0, 100);
  }

  const binWidth = sampleRate / (spectrum.length * 2);
  const fundamentalBin = frequency > 0 ? Math.round(frequency / binWidth) : 0;
  const secondBin = frequency > 0 ? Math.round((frequency * 2) / binWidth) : 0;
  const thirdBin = frequency > 0 ? Math.round((frequency * 3) / binWidth) : 0;

  const splitIndex = Math.max(4, Math.floor(spectrum.length * 0.22));
  const lowBand = average(spectrum.slice(0, splitIndex));
  const midBand = average(spectrum.slice(splitIndex, Math.max(splitIndex + 1, Math.floor(spectrum.length * 0.62))));
  const highBand = average(spectrum.slice(Math.floor(spectrum.length * 0.62)));
  const totalBand = average(spectrum);

  const fundamentalPeak = samplePeakAround(spectrum, fundamentalBin, 2);
  const secondPeak = samplePeakAround(spectrum, secondBin, 2);
  const thirdPeak = samplePeakAround(spectrum, thirdBin, 2);
  const harmonicPeak = Math.max(secondPeak, thirdPeak);

  const broadbandRatio = (midBand + highBand) / Math.max(1, totalBand * 2);
  const spectralSpread = Math.max(0, highBand - lowBand) / 255;
  const harmonicLeakage = clamp(harmonicPeak / Math.max(1, fundamentalPeak), 0, 2);
  const weakFundamental = fundamentalPeak < 24 ? 24 - fundamentalPeak : 0;
  const instabilityPenalty = stability != null ? clamp((70 - stability) / 70, 0, 1) * 28 : 0;
  const confidencePenalty = (1 - clamp(confidence, 0, 1)) * 28;
  const energyPenalty = energy < 18 ? (18 - energy) * 1.3 : 0;
  const airyFloor = lowBand < 18 ? (18 - lowBand) * 0.8 : 0;

  const raw =
    broadbandRatio * 34 +
    spectralSpread * 24 +
    harmonicLeakage * 22 +
    weakFundamental * 0.9 +
    instabilityPenalty +
    confidencePenalty +
    energyPenalty +
    airyFloor;

  return clamp(raw, 0, 100);
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
