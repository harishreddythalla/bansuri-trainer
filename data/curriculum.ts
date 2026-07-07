import type { OctaveName, NoteState, SwaraName, SwaraTarget } from "@/lib/swara";

export type CurriculumCheckpointType = "single_note" | "sequence" | "continuous_glide" | "oscillation";
export type CurriculumGroupType =
  | "tone"
  | "swara"
  | "interval"
  | "sequence"
  | "raga_grammar"
  | "ornamentation"
  | "riyaaz";

export type SequenceStep = {
  target: SwaraTarget;
  sustainTargetMs: number;
  isAnchor?: boolean;
  hasSpaceAfter?: boolean;
  hasNewlineAfter?: boolean;
  glyph?: string;
};

function parseNotation(notation: string, sustainTargetMs: number): SequenceStep[] {
  const normalized = notation.normalize("NFC");
  const steps: SequenceStep[] = [];
  let cursor = 0;
  let hadSpace = false;
  let hadNewline = false;

  while (cursor < normalized.length) {
    const char = normalized[cursor];
    if (/\s/.test(char)) {
      if (char === "\n" || char === "\r") {
        hadNewline = true;
      }
      hadSpace = true;
      cursor += 1;
      continue;
    }

    const glyph = notationGlyphs.find((candidate) => normalized.startsWith(candidate.normalize("NFC"), cursor));

    if (!glyph) {
      cursor += 1;
      continue;
    }

    const target = notationTarget(glyph);

    if (target) {
      if (steps.length > 0) {
        if (hadNewline) {
          steps[steps.length - 1].hasNewlineAfter = true;
          steps[steps.length - 1].hasSpaceAfter = true;
        } else if (hadSpace) {
          steps[steps.length - 1].hasSpaceAfter = true;
        }
      }
      steps.push({
        target,
        sustainTargetMs,
        isAnchor: steps.length === 0,
        hasSpaceAfter: false,
        hasNewlineAfter: false,
        glyph,
      });
      hadSpace = false;
      hadNewline = false;
    }

    cursor += glyph.length;
  }

  if (steps.length) {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      isAnchor: true,
    };
  }

  return steps;
}

type CheckpointBase = {
  id: string;
  title: string;
  description: string;
  coaching: string;
  commonMistakes: string[];
  minimumScore: number;
  pitchToleranceCents: number;
  lockBandCents: number;
  releaseBandCents: number;
  noiseMax: number;
  stabilityMin: number;
  requiredConsecutiveClears: number;
  allowedProfiles: string[];
  unavailableBehavior: "hide" | "disable" | "show_dash";
  stage?: "active" | "planned";
};

export type SingleNoteCheckpoint = CheckpointBase & {
  type: "single_note";
  target: SwaraTarget;
  sustainSeconds: number;
};

export type SequenceCheckpoint = CheckpointBase & {
  type: "sequence";
  steps: SequenceStep[];
  repeatCount: number;
  sequenceRules: {
    maxGapMs: number;
    requireStrictTempo: boolean;
    resetMode: "loop";
  };
  ragaRules?: {
    allowedSwaras?: SwaraName[];
    arohana?: SequenceStep[];
    avarohana?: SequenceStep[];
    pakad?: SequenceStep[][];
    vadi?: SwaraName;
    samvadi?: SwaraName;
    nyas?: SwaraName[];
    forbiddenPhrases?: string[];
  };
};

export type ContinuousGlideCheckpoint = CheckpointBase & {
  type: "continuous_glide";
  glideRoute: {
    from: SwaraTarget;
    to: SwaraTarget;
  };
  sustainSeconds: number;
};

export type OscillationCheckpoint = CheckpointBase & {
  type: "oscillation";
  target: SwaraTarget;
  sustainSeconds: number;
  oscillationHzRange: [number, number];
};

export type CurriculumCheckpoint =
  | SingleNoteCheckpoint
  | SequenceCheckpoint
  | ContinuousGlideCheckpoint
  | OscillationCheckpoint;

export type CurriculumGroup = {
  id: string;
  title: string;
  type: CurriculumGroupType;
  order: number;
  unlockRule: "none" | "clear_previous_group" | "clear_module";
  unlockTarget?: string;
  description: string;
  checkpoints: CurriculumCheckpoint[];
  stage?: "active" | "planned";
};

export type CurriculumModule = {
  id: string;
  title: string;
  description: string;
  order: number;
  prerequisites: string[];
  checkpointGroups: CurriculumGroup[];
};

export type CurriculumTrack = {
  id: string;
  title: string;
  description: string;
  order: number;
  modules: CurriculumModule[];
};

type LegacyStep = CurriculumCheckpoint & {
  groupId: string;
  groupTitle: string;
};

const MIN_PRACTICE_HOLD_MS = 1000;

function normalizePracticeHoldMs(value: number) {
  return value < 500 ? MIN_PRACTICE_HOLD_MS : value;
}

function normalizePracticeHoldSeconds(value: number) {
  return value < 0.5 ? MIN_PRACTICE_HOLD_MS / 1000 : value;
}

function normalizeSequenceStep(step: SequenceStep): SequenceStep {
  return {
    ...step,
    sustainTargetMs: normalizePracticeHoldMs(step.sustainTargetMs),
  };
}

export type LegacyModule = {
  id: string;
  title: string;
  description: string;
  steps: LegacyStep[];
};

const cMediumAndUp = [
  "c-medium",
  "d-medium",
  "e-medium",
  "f-medium",
  "g-medium",
  "a-medium",
  "b-medium",
] as const;

const bassAndMedium = [
  "c-bass",
  "d-bass",
  "e-bass",
  "f-bass",
  "g-bass",
  "a-bass",
  "b-bass",
  ...cMediumAndUp,
] as const;

function single(
  id: string,
  title: string,
  description: string,
  target: SwaraTarget,
  sustainSeconds: number,
  minimumScore: number,
  pitchToleranceCents: number,
  lockBandCents: number,
  releaseBandCents: number,
  noiseMax: number,
  stabilityMin: number,
  allowedProfiles: readonly string[],
  coaching: string,
  commonMistakes: string[],
  unavailableBehavior: "hide" | "disable" | "show_dash" = "disable",
  requiredConsecutiveClears = 1,
  stage: "active" | "planned" = "active",
): SingleNoteCheckpoint {
  return {
    id,
    title,
    type: "single_note",
    description,
    target,
    sustainSeconds: normalizePracticeHoldSeconds(sustainSeconds),
    minimumScore,
    pitchToleranceCents,
    lockBandCents,
    releaseBandCents,
    noiseMax,
    stabilityMin,
    requiredConsecutiveClears,
    allowedProfiles: [...allowedProfiles],
    unavailableBehavior,
    coaching,
    commonMistakes,
    stage,
  };
}

function sequence(
  id: string,
  title: string,
  description: string,
  steps: SequenceStep[],
  repeatCount: number,
  minimumScore: number,
  pitchToleranceCents: number,
  lockBandCents: number,
  releaseBandCents: number,
  noiseMax: number,
  stabilityMin: number,
  allowedProfiles: readonly string[],
  coaching: string,
  commonMistakes: string[],
  sequenceRules: { maxGapMs: number; requireStrictTempo: boolean; resetMode?: "loop" },
  unavailableBehavior: "hide" | "disable" | "show_dash" = "disable",
  requiredConsecutiveClears = 1,
  stage: "active" | "planned" = "active",
  ragaRules?: SequenceCheckpoint["ragaRules"],
): SequenceCheckpoint {
  return {
    id,
    title,
    type: "sequence",
    description,
    steps: steps.map(normalizeSequenceStep),
    repeatCount,
    minimumScore,
    pitchToleranceCents,
    lockBandCents,
    releaseBandCents,
    noiseMax,
    stabilityMin,
    requiredConsecutiveClears,
    allowedProfiles: [...allowedProfiles],
    unavailableBehavior,
    coaching,
    commonMistakes,
    sequenceRules: {
      maxGapMs: sequenceRules.maxGapMs,
      requireStrictTempo: sequenceRules.requireStrictTempo,
      resetMode: sequenceRules.resetMode ?? "loop",
    },
    ragaRules: ragaRules
      ? {
        ...ragaRules,
        arohana: ragaRules.arohana?.map(normalizeSequenceStep),
        avarohana: ragaRules.avarohana?.map(normalizeSequenceStep),
        pakad: ragaRules.pakad?.map((phrase) => phrase.map(normalizeSequenceStep)),
      }
      : undefined,
    stage,
  };
}

function curriculumModule(
  id: string,
  title: string,
  description: string,
  order: number,
  prerequisites: string[],
  checkpointGroups: CurriculumGroup[],
): CurriculumModule {
  return {
    id,
    title,
    description,
    order,
    prerequisites,
    checkpointGroups,
  };
}

function group(
  id: string,
  title: string,
  type: CurriculumGroupType,
  order: number,
  unlockRule: CurriculumGroup["unlockRule"],
  description: string,
  checkpoints: CurriculumCheckpoint[],
  unlockTarget?: string,
  stage: "active" | "planned" = "active",
): CurriculumGroup {
  return {
    id,
    title,
    type,
    order,
    unlockRule,
    unlockTarget,
    description,
    checkpoints,
    stage,
  };
}

function notationTarget(glyph: string): SwaraTarget | null {
  const normalized = glyph.normalize("NFC");

  switch (normalized) {
    case "P̣":
      return { swara: "Pa", octave: "Mandra" };
    case "Ḍ":
      return { swara: "Dha", octave: "Mandra" };
    case "Ṇ":
      return { swara: "Ni", octave: "Mandra" };
    case "Ṡ":
      return { swara: "Sa", octave: "Taar" };
    case "Ṙ":
      return { swara: "Re", octave: "Taar" };
    case "Ṗ":
      return { swara: "Pa", octave: "Taar" };
    case "ṁ":
      return { swara: "Ma", octave: "Taar", state: "Shuddha" };
    case "Ṁ":
      return { swara: "Ma", octave: "Taar", state: "Teevra" };
    case "Ġ":
      return { swara: "Ga", octave: "Taar" };
    case "S":
      return { swara: "Sa", octave: "Madhya" };
    case "R":
      return { swara: "Re", octave: "Madhya" };
    case "G":
      return { swara: "Ga", octave: "Madhya" };
    case "m":
      return { swara: "Ma", octave: "Madhya", state: "Shuddha" };
    case "M":
      return { swara: "Ma", octave: "Madhya", state: "Teevra" };
    case "P":
      return { swara: "Pa", octave: "Madhya" };
    case "D":
      return { swara: "Dha", octave: "Madhya" };
    case "N":
      return { swara: "Ni", octave: "Madhya" };
    default:
      return null;
  }
}

const notationGlyphs = ["P̣", "Ḍ", "Ṇ", "Ṡ", "Ṙ", "Ṗ", "ṁ", "Ṁ", "Ġ", "S", "R", "G", "M", "m", "P", "D", "N"].sort(
  (first, second) => second.length - first.length,
);

type AlankarPairDefinition = {
  id: string;
  title: string;
  description: string;
  aarohNotation: string;
  avarohNotation: string;
  aarohCoaching: string;
  avarohCoaching: string;
  aarohMistakes: string[];
  avarohMistakes: string[];
  minimumScore: number;
  pitchToleranceCents: number;
  lockBandCents: number;
  releaseBandCents: number;
  noiseMax: number;
  stabilityMin: number;
  sustainTargetMs: number;
  maxGapMs: number;
  requireStrictTempo?: boolean;
};

const alankarPairs: AlankarPairDefinition[] = [
  {
    id: "basic-scale",
    title: "Basic Scale",
    description: "Fundamental scale warm-up focusing on tone stability.",
    aarohNotation: "S R G M P D N Ṡ",
    avarohNotation: "Ṡ N D P M G R S",
    aarohCoaching: "Focus on pitch stability & tone warm-up. Blow a steady breath for each note.",
    avarohCoaching: "Descend evenly and maintain pitch center on lower notes.",
    aarohMistakes: ["Rushing notes", "Fluctuating blowing pressure"],
    avarohMistakes: ["Dropping pitch flat on lower register notes", "Overblowing Sa at the end"],
    minimumScore: 70,
    pitchToleranceCents: 20,
    lockBandCents: 10,
    releaseBandCents: 22,
    noiseMax: 35,
    stabilityMin: 60,
    sustainTargetMs: 1000,
    maxGapMs: 350,
  },
  {
    id: "octave-pairs",
    title: "Octave Pairs",
    description: "Adapting embouchure control for wide register leaps.",
    aarohNotation: "P̣ P Ḍ D Ṇ N S Ṡ R Ṙ Ṗ P Ṁ M Ġ G Ṙ G Ġ M Ṁ P Ṗ",
    avarohNotation: "R Ṡ S N Ṇ D Ḍ P P̣",
    aarohCoaching: "Adapt embouchure dynamically for register jumping between low and high octaves.",
    avarohCoaching: "Ensure the lower notes drop cleanly without losing tone body.",
    aarohMistakes: ["Squeezing high notes flat", "Overblowing the lower octave partners"],
    avarohMistakes: ["Rushing the descend", "Failing to drop wind pressure on Mandra notes"],
    minimumScore: 72,
    pitchToleranceCents: 18,
    lockBandCents: 10,
    releaseBandCents: 22,
    noiseMax: 34,
    stabilityMin: 62,
    sustainTargetMs: 950,
    maxGapMs: 340,
  },
  {
    id: "three-octave-run",
    title: "3-Octave Run",
    description: "Manage blowing pressure across three registers (Mandra, Madhya, Tar).",
    aarohNotation: "P̣ Ḍ Ṇ S R G M P D N Ṡ Ṙ Ṗ Ṁ Ġ Ṙ Ġ Ṁ Ṗ",
    avarohNotation: "Ṡ N D P M G R S Ṇ Ḍ P̣",
    aarohCoaching: "Practice blowing pressure management across Mandra, Madhya, and Tar registers.",
    avarohCoaching: "Ease the pressure smoothly as you return to the lower register.",
    aarohMistakes: ["Overblowing high notes into noise", "Breath support dropping flat on low notes"],
    avarohMistakes: ["Losing pitch control at register boundary", "Rushing the return arc"],
    minimumScore: 74,
    pitchToleranceCents: 18,
    lockBandCents: 10,
    releaseBandCents: 22,
    noiseMax: 32,
    stabilityMin: 64,
    sustainTargetMs: 900,
    maxGapMs: 330,
  },
  {
    id: "doublets",
    title: "Doublets",
    description: "Consistent tongue and finger synchronization on repeated notes.",
    aarohNotation: "P̣Ṇ ḌS ṆR SG RM GP MD PN DṠ NṘ ṠĠ ṘṀ ĠṖ",
    avarohNotation: "ṖĠ ṀṘ ĠṠ ṘN ṠD NP DM PG MR GS RṆ SḌ ṆP̣",
    aarohCoaching: "Maintain consistent tongue and finger synchronization on repeated doublets.",
    avarohCoaching: "Match the duration and accent of descending doublets evenly.",
    aarohMistakes: ["Uneven note durations in pairs", "Fingers slipping during jumps"],
    avarohMistakes: ["Losing speed on the descent", "Rushing note transitions"],
    minimumScore: 75,
    pitchToleranceCents: 16,
    lockBandCents: 10,
    releaseBandCents: 20,
    noiseMax: 30,
    stabilityMin: 66,
    sustainTargetMs: 850,
    maxGapMs: 320,
  },
  {
    id: "triplets-3s",
    title: "Triplets (3s)",
    description: "Speed building in triple-meter rhythms.",
    aarohNotation: "P̣ḌṆ ḌṆS ṆSR SRG RGM GMP MPD PDN DNṠ NṠṘ ṠṘĠ ṘĠṀ ĠṀṖ",
    avarohNotation: "ṖṀĠ ṀĠṘ ĠṘṠ ṘṠN ṠND NDP DPM PMG MGR GRS RSṆ SṆḌ ṆḌP̣",
    aarohCoaching: "Build speed in triple-meter rhythms. Emphasize the first note of each cell.",
    avarohCoaching: "Keep the three-note cells distinct and clear on the descent.",
    aarohMistakes: ["Blurring note separations", "Dragging the third note of triplets"],
    avarohMistakes: ["Losing triple rhythm sync", "Rushing cell endings"],
    minimumScore: 76,
    pitchToleranceCents: 15,
    lockBandCents: 9,
    releaseBandCents: 20,
    noiseMax: 28,
    stabilityMin: 68,
    sustainTargetMs: 800,
    maxGapMs: 300,
  },
  {
    id: "groups-of-4",
    title: "Groups of 4",
    description: "Classic rhythmic alignment on groups of 4 notes.",
    aarohNotation: "P̣ḌṆS ḌṆSR ṆSRG SRGM RGMP GMPD MPDN PDNṠ DNṠṘ NṠṘĠ ṠṘĠṀ ṘĠṀṖ",
    avarohNotation: "ṖṀĠṘ ṀĠṘṠ ĠṘṠN ṘṠND ṠNDP NDPM DPMG PMGR MGRS GRSṆ RSṆḌ SṆḌP̣",
    aarohCoaching: "Align finger changes with the 4/4 metric pulse.",
    avarohCoaching: "Maintain even pressure across all four notes of each descending group.",
    aarohMistakes: ["Rushing the fourth note", "Uneven finger lift timing"],
    avarohMistakes: ["Losing tempo sync", "Notes sounding disconnected"],
    minimumScore: 78,
    pitchToleranceCents: 15,
    lockBandCents: 8,
    releaseBandCents: 20,
    noiseMax: 28,
    stabilityMin: 70,
    sustainTargetMs: 800,
    maxGapMs: 280,
  },
  {
    id: "groups-of-5",
    title: "Groups of 5",
    description: "Asymmetric phrasing flexibility in five-note sequences.",
    aarohNotation: "P̣ḌṆSR ḌṆSRG ṆSRGM SRGMP RGMPD GMPDN MPDNṠ PDNṠṘ DNṠṘĠ NṠṘĠṀ ṠṘĠṀṖ",
    avarohNotation: "ṖṀĠṘṠ ṀĠṘṠN ĠṘṠND ṘṠNDP ṠNDPM NDPMG DPMGR PMGRS MGRSṆ GRSṆḌ RSṆḌP̣",
    aarohCoaching: "Develop asymmetric phrasing flexibility. Hold the breath steady across all 5 notes.",
    avarohCoaching: "Pace your breath so you don't run out of air before the end of each cell.",
    aarohMistakes: ["Losing the rhythm in 5-note groupings", "Slipping through the middle swaras"],
    avarohMistakes: ["Running out of breath flatting notes", "Stuttering note transitions"],
    minimumScore: 78,
    pitchToleranceCents: 14,
    lockBandCents: 8,
    releaseBandCents: 18,
    noiseMax: 26,
    stabilityMin: 72,
    sustainTargetMs: 750,
    maxGapMs: 270,
  },
  {
    id: "groups-of-6",
    title: "Groups of 6",
    description: "Fluid finger movements in fast six-note groups.",
    aarohNotation: "P̣ḌṆSRG ḌṆSRGM ṆSRGMP SRGMPD RGMPDN GMPDNṠ MPDNṠṘ PDNṠṘĠ DNṠṘĠṀ NṠṘĠṀṖ",
    avarohNotation: "ṖṀĠṘṠN ṀĠṘṠND ĠṘṠNDP ṘṠNDPM ṠNDPMG NDPMGR DPMGRS PMGRSṆ MGRSṆḌ GRSṆḌP̣",
    aarohCoaching: "Ensure fluid finger movement across six-note cells. Avoid accents in the middle.",
    avarohCoaching: "Keep fingers close to toneholes for rapid, smooth transitions.",
    aarohMistakes: ["Tensing fingers causing uneven intervals", "Lagging on high register crossings"],
    avarohMistakes: ["Gaps between cells", "Losing octave clarity at the base saptak"],
    minimumScore: 80,
    pitchToleranceCents: 14,
    lockBandCents: 8,
    releaseBandCents: 18,
    noiseMax: 26,
    stabilityMin: 72,
    sustainTargetMs: 750,
    maxGapMs: 250,
  },
  {
    id: "groups-of-7",
    title: "Groups of 7",
    description: "Long-form melodic grouping and sustained breath control.",
    aarohNotation: "P̣ḌṆSRGM ḌṆSRGMP ṆSRGMPD SRGMPDN RGMPDNṠ GMPDNṠṘ MPDNṠṘĠ PDNṠṘĠṀ DNṠṘĠṀṖ",
    avarohNotation: "ṖṀĠṘṠND ṀĠṘṠNDP ĠṘṠNDPM ṘṠNDPMG ṠNDPMGR NDPMGRS DPMGRSṆ PMGRSṆḌ MGRSṆḌP̣",
    aarohCoaching: "Focus on long-form grouping and sustained execution. Keep a steady airflow.",
    avarohCoaching: "Reverse the 7-note pattern cleanly. Keep fingers light and relaxed.",
    aarohMistakes: ["Rushing note transitions to catch breath", "Pitch drop on the seventh swara of cells"],
    avarohMistakes: ["Blurring lower register intervals", "Tensing wrist and fingers"],
    minimumScore: 80,
    pitchToleranceCents: 13,
    lockBandCents: 8,
    releaseBandCents: 18,
    noiseMax: 24,
    stabilityMin: 74,
    sustainTargetMs: 700,
    maxGapMs: 240,
  },
  {
    id: "full-octave-run",
    title: "Full Octave Run",
    description: "Continuous full octave sweeps testing breath capacity.",
    aarohNotation: "P̣ḌṆSRGMP ḌṆSRGMPD ṆSRGMPDN SRGMPDNṠ RGMPDNṠṘ GMPDNṠṘĠ MPDNṠṘĠṀ PDNṠṘĠṀṖ",
    avarohNotation: "ṖṀĠṘṠNDP ṀĠṘṠNDPM ĠṘṠNDPMG ṘṠNDPMGR ṠNDPMGRS NDPMGRSṆ DPMGRSṆḌ PMGRSṆḌP̣",
    aarohCoaching: "Master breath capacity across continuous octave sweeps.",
    avarohCoaching: "Maintain tone fullness during the long descending octave runs.",
    aarohMistakes: ["Fading volume near the run end", "Fingers slipping during high-speed runs"],
    avarohMistakes: ["Under-blowing lower notes", "Smearing octave boundary keys"],
    minimumScore: 82,
    pitchToleranceCents: 13,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 24,
    stabilityMin: 74,
    sustainTargetMs: 700,
    maxGapMs: 230,
  },
  {
    id: "two-note-steps",
    title: "2-Note Steps",
    description: "Smooth transitions between immediate adjacent notes.",
    aarohNotation: "P̣Ḍ ḌṆ ṆS SR RG GM MP PD DN NṠ ṠṘ ṘĠ ĠṀ ṀṖ",
    avarohNotation: "ṖṀ ṀĠ ĠṘ ṘṠ ṠN ND DP PM MG GR RS SṆ ṆḌ ḌP̣",
    aarohCoaching: "Focus on smooth finger action and seamless legatos.",
    avarohCoaching: "Keep tone connected and avoid clicking sounds between notes.",
    aarohMistakes: ["Clicking finger transitions", "Gaps between two-note blocks"],
    avarohMistakes: ["Slurring notes into noise", "Lagging adjacent pitch lock"],
    minimumScore: 82,
    pitchToleranceCents: 12,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 22,
    stabilityMin: 76,
    sustainTargetMs: 700,
    maxGapMs: 220,
  },
  {
    id: "peak-and-return",
    title: "Peak & Return",
    description: "Sudden directional switches mid-breath to build agility.",
    aarohNotation: "P̣ḌṆSRGMP DPMGRSṆḌ | ḌṆSRGMPD NDPMGRSṆ | ṆSRGMPDN ṠNDPMGRS | SRGMPDNṠ ṘṠNDPMGR | RGMPDNṠṘ ĠṘṠNDPMG | GMPDNṠṘĠ ṀĠṘṠNDPM | MPDNṠṘĠṀ ṖṀĠṘṠNDP",
    avarohNotation: "ṖṀĠṘṠNDP MPDNṠṘĠṀ | ṀĠṘṠNDPM GMPDNṠṘĠ | ĠṘṠNDPMG RGMPDNṠṘ | ṘṠNDPMGR SRGMPDNṠ | ṠNDPMGRS ṆSRGMPDN | NDPMGRSṆ ḌṆSRGMPD | DPMGRSṆḌ PḌNSRGMP",
    aarohCoaching: "Control wind support during sudden directional switches mid-phrase.",
    avarohCoaching: "Maintain pitch accuracy during wide leaps and reversals.",
    aarohMistakes: ["Pitch dropping during directional switches", "Overblowing the peak swara"],
    avarohMistakes: ["Slurring descending steps", "Breath leaking at peak note"],
    minimumScore: 84,
    pitchToleranceCents: 12,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 22,
    stabilityMin: 76,
    sustainTargetMs: 650,
    maxGapMs: 220,
  },
  {
    id: "note-skipping",
    title: "Note Skipping",
    description: "Skips that test clean lifting and half-hole accuracy.",
    aarohNotation: "P̣ḌS ḌṆR ṆSG SRM RGP GMD MPN PDṠ DNṘ NṠĠ ṠṘṀ ṘĠṖ",
    avarohNotation: "ṖṀṘ ṀĠṠ ĠṘN ṘṠD ṠNP NDM DPG PMR MGS GRṆ RSḌ SṆP̣",
    aarohCoaching: "Practice lifting multiple fingers cleanly. Ensure half-hole microtone accuracy.",
    avarohCoaching: "Keep fingers low and land them together on skipped intervals.",
    aarohMistakes: ["Ghost notes during double finger lifts", "Pitch lag on skip target note"],
    avarohMistakes: ["Smearing landing intervals", "Rushing skipped swara turns"],
    minimumScore: 84,
    pitchToleranceCents: 11,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 22,
    stabilityMin: 78,
    sustainTargetMs: 650,
    maxGapMs: 220,
  },
  {
    id: "zig-zag-twist",
    title: "Zig-Zag Twist",
    description: "Developing rapid 'Khatka' finger patterns.",
    aarohNotation: "P̣ḌṆP̣ḌP̣ ḌṆSḌṆḌ ṆSRṆSṆ SRGSRS RGMRGR GMPGMP MPDMPM PDNPDP DNṠDND ĠṀṖĠṀĠ NṠṘNṠN ṠṘĠṠṘṠ ṘĠṀṘĠṘ",
    avarohNotation: "ṖṀĠṖṀṖ ṀĠṘṀĠṀ ĠṘṠĠṘĠ ṘṠNṘṠṘ ṠNDṠNS NDPNDN DPMDPD PMGPMG MGRMGM GRSGRG RSNRSR SṆḌSṆS ṆḌP̣ṆḌṆ",
    aarohCoaching: "Focus on clean and crisp finger work to execute microtone turns.",
    avarohCoaching: "Ensure each turn has a clear core pitch lock.",
    aarohMistakes: ["Slurring turns without individual swara hits", "Uneven timing in fast zig-zag turns"],
    avarohMistakes: ["Losing pitch stability on low register return notes", "Fingers lagging behind the tempo"],
    minimumScore: 84,
    pitchToleranceCents: 11,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 20,
    stabilityMin: 78,
    sustainTargetMs: 600,
    maxGapMs: 200,
  },
  {
    id: "complex-palta",
    title: "Complex Palta",
    description: "Train finger coordination and complex muscle memory mapping.",
    aarohNotation: "P̣ḌṆSṆḌ P̣ḌṆḌ P̣ḌṆS | ḌṆSRSṆ ḌṆSṆ ḌṆSR | ṆSRGRS ṆSRS ṆSRG | SRGMGR SRGR SRGM | RGMPMG RGMG RGMP | GMPDPM GMPMGMPD | MPDNDP MPDP MPDN | PDNṠND PDND PDNṠ | DNṠṘSN DNṠN DNṠṘ | NṠṘĠṘṠ NṠṘṠ NṠṘĠ | ṠṘĠṀĠṘ ṠṘĠṘ ṠṘĠṀ | ṘĠṀṖṀĠ ṘĠṀĠ ṘĠṀṖ",
    avarohNotation: "ṖṀĠṘĠṀ ṖṀĠṀ ṖṀĠṘ | ṀĠṘṠṘĠ ṀĠṘĠ ṀĠṘṠ | ĠṘṠNSṘ ĠṘṠṘ ĠṘṠN | ṘṠNDNṠ ṘṠNṠ ṘṠND | ṠNDPDN ṠNDN ṠNDP | NDPMDP NDPD NDPM | DPMGMP DPMP DPMG | PMGRGM PMGM PMGR | MGRSRG MGRG MGRS | GRSṆSR GRSR GRSṆ | RSṆḌṆS RSṆS RSṆḌ | SṆḌP̣ḌṆ SṆḌṆ SṆḌP̣",
    aarohCoaching: "Train complex muscle memory. Ensure clean separation between palta cells.",
    avarohCoaching: "Maintain steady breathing across the long complex palta groups.",
    aarohMistakes: ["Cognitive hesitation between phrases", "Fingers lagging on repeated returns"],
    avarohMistakes: ["Fading wind support flatting swaras", "Rushing rhythmic groups"],
    minimumScore: 84,
    pitchToleranceCents: 11,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 20,
    stabilityMin: 80,
    sustainTargetMs: 600,
    maxGapMs: 200,
  },
  {
    id: "intertwined-run",
    title: "Intertwined Run",
    description: "Wide interval finger leaps mapping rapid leaps.",
    aarohNotation: "P̣SṆSḌṆP̣Ḍ ḌRSRṆSḌṆ ṆGRGSRṆS SMGMRGSR RPMGPMRG GDPDMPGM MNDNPDMP PṠNṠDNPD DṘṠṘNṠDN NĠṘĠṠṘNṠ ṠṀĠṀṘĠṠṘ ṘṖṀṖĠṀṘĠṖ",
    avarohNotation: "ṖĠṘṀĠṖṀ ṀṠṘṠĠṘṀĠ ĠNṠNṘṠĠṘ ṘDNDṠNṘṠ ṠPDPNDSN NDPMDPND DGMGPMDP PRGRMGPMR MSRSGRMG GṆSṆRSGR RḌṆḌSṆRS SP̣ḌP̣ṆḌSṆ",
    aarohCoaching: "Map wide interval finger leaps with absolute finger lift synchronization.",
    avarohCoaching: "Ensure descending leaps remain clean with a stable breath column.",
    aarohMistakes: ["Accidental passing tones during wide skips", "Under-blowing low interval targets"],
    avarohMistakes: ["Rushing descending leaps", "Finger tensing up mid-run"],
    minimumScore: 84,
    pitchToleranceCents: 10,
    lockBandCents: 6,
    releaseBandCents: 14,
    noiseMax: 18,
    stabilityMin: 80,
    sustainTargetMs: 600,
    maxGapMs: 190,
  },
  {
    id: "pulsing-triplets",
    title: "Pulsing Triplets",
    description: "Fast staccato repeated-note strikes testing double-tonguing agility.",
    aarohNotation: "P̣ḌḌ P̣ḌḌ P̣Ḍ | ḌṆṆ ḌṆṆ ḌṆ | ṆSS ṆSS ṆS | SRR SRR SR | RGG RGG RG | GMM GMM GM | MPD MPD MP | PDD PDD PD | DNN DNN DN | NṠṠ NṠṠ NṠ | ṠṘṘ ṠṘṘ ṠṘ | ṘĠĠ ṘĠĠ ṘĠ | ĠṀṀ ĠṀṀ ĠṀ | ṀṖṖ ṀṖṖ ṀṖ",
    avarohNotation: "ṖṀṀ ṖṀṀ ṖṀ | ṀĠĠ ṀĠĠ ṀĠ | ĠṘṘ ĠṘṘ ĠṘ | ṘṠṠ ṘṠṠ ṘṠ | ṠNN ṠNN ṠN | NDD NDD ND | DPP DPP DP | PMM PMM PM | MGG MGG MG | GRR GRR GR | RSS RSS RS | SṆṆ SṆṆ SṆ | ṆḌḌ ṆḌḌ ṆḌ | ḌP̣P̣ ḌP̣P̣ ḌP̣",
    aarohCoaching: "Train high-speed rhythmic double-tonguing or finger-slapping strikes.",
    avarohCoaching: "Maintain crisp articulation across descending pulsing triplets.",
    aarohMistakes: ["Dragging the repeated notes", "Articulations sounding muddy"],
    avarohMistakes: ["Fingers tensing up", "Tempo slipping on the descent"],
    minimumScore: 84,
    pitchToleranceCents: 10,
    lockBandCents: 6,
    releaseBandCents: 14,
    noiseMax: 18,
    stabilityMin: 80,
    sustainTargetMs: 600,
    maxGapMs: 180,
  },
  {
    id: "inverted-mirror",
    title: "Inverted Mirror",
    description: "Sustained register changes balancing high-blow and low-blow pressures.",
    aarohNotation: "P̣ḌP̣ GRSṆḌ PMGRSṆḌP̣ | ḌṆḌ MGRSṆ DPMGRSṆḌ | ṆSṆ PMGRS NDPMGRSṆ | SRS DPMGR ṠNDPMGRS | RGR NDPMG ṘṠNDPMGR | GMG ṠNDPM ĠṘṠNDPMG | MPM ṘṠNDP ṀĠṘṠNDPM | PDP ĠṘṠND ṖṀĠṘṠNDP",
    avarohNotation: "ṖṀṖ NṠṘĠṀ PDNṠṘĠṀṖ | ṀĠṀ DNṠṘĠ MPDNṠṘĠṀ | ĠṘĠ PDNṠṘ GMPDNṠṘĠ | ṘṠṘ MPDNṠ RGMPDNṠṘ | ṠNṠ GMPDN SRGMPDNṠ | NDN RGMPD ṆSRGMPDN | DPD SRGMP ḌṆSRGMPD | PMP ṆSRGMP P̣ḌṆSRGMP",
    aarohCoaching: "Balance high-blow and low-blow pressures. Keep embouchure flexible.",
    avarohCoaching: "Ensure the descending runs remain centered and dynamic.",
    aarohMistakes: ["Shifting register flat", "Pitch lagging on peak turns"],
    avarohMistakes: ["Rushing final landing notes", "Unstable breath pressure"],
    minimumScore: 84,
    pitchToleranceCents: 10,
    lockBandCents: 6,
    releaseBandCents: 12,
    noiseMax: 16,
    stabilityMin: 82,
    sustainTargetMs: 600,
    maxGapMs: 180,
  },
];

export const curriculumTracks: CurriculumTrack[] = [
  {
    id: "alankar-path",
    title: "Alankar Path",
    description: "The curriculum is now only the supplied alankar ladder, split into separate Aaroh and Avaroh practice.",
    order: 1,
    modules: alankarPairs.map((definition, index) => {
      const moduleId = definition.id;
      const previousModule = alankarPairs[index - 1]?.id;

      return curriculumModule(
        moduleId,
        definition.title,
        definition.description,
        index + 1,
        previousModule ? [previousModule] : [],
        [
          group(
            `${moduleId}-aaroh`,
            "Aaroh",
            "sequence",
            1,
            index === 0 ? "none" : "clear_previous_group",
            `${definition.title} — ascending form`,
            [
              sequence(
                `${moduleId}-aaroh-checkpoint`,
                `Aaroh`,
                `${definition.title} — ascending form`,
                parseNotation(definition.aarohNotation, definition.sustainTargetMs),
                1,
                definition.minimumScore,
                definition.pitchToleranceCents,
                definition.lockBandCents,
                definition.releaseBandCents,
                definition.noiseMax,
                definition.stabilityMin,
                cMediumAndUp,
                definition.aarohCoaching,
                definition.aarohMistakes,
                {
                  maxGapMs: definition.maxGapMs,
                  requireStrictTempo: definition.requireStrictTempo ?? false,
                },
              ),
            ],
          ),
          group(
            `${moduleId}-avaroh`,
            "Avaroh",
            "sequence",
            2,
            "clear_previous_group",
            `${definition.title} — descending form`,
            [
              sequence(
                `${moduleId}-avaroh-checkpoint`,
                `Avaroh`,
                `${definition.title} — descending form`,
                parseNotation(definition.avarohNotation, definition.sustainTargetMs),
                1,
                definition.minimumScore,
                definition.pitchToleranceCents,
                definition.lockBandCents,
                definition.releaseBandCents,
                definition.noiseMax,
                definition.stabilityMin,
                cMediumAndUp,
                definition.avarohCoaching,
                definition.avarohMistakes,
                {
                  maxGapMs: definition.maxGapMs,
                  requireStrictTempo: definition.requireStrictTempo ?? false,
                },
              ),
            ],
          ),
        ],
      );
    }),
  },
];

function flattenTrack(track: CurriculumTrack): LegacyModule[] {
  return (track.modules ?? []).map((mod) => ({
    id: mod.id,
    title: mod.title,
    description: mod.description,
    steps: (mod.checkpointGroups ?? []).flatMap((group) =>
      group.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        groupId: group.id,
        groupTitle: group.title,
      })),
    ),
  }));
}

export const activeHindustaniModules = flattenTrack(curriculumTracks[0]);
