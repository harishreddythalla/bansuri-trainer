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
  glyph?: string;
};

function parseNotation(notation: string, sustainTargetMs: number): SequenceStep[] {
  const normalized = notation.normalize("NFC");
  const steps: SequenceStep[] = [];
  let cursor = 0;
  let hadSpace = false;

  while (cursor < normalized.length) {
    const char = normalized[cursor];
    if (/\s/.test(char)) {
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
      if (steps.length > 0 && hadSpace) {
        steps[steps.length - 1].hasSpaceAfter = true;
      }
      steps.push({
        target,
        sustainTargetMs,
        isAnchor: steps.length === 0,
        hasSpaceAfter: false,
        glyph,
      });
      hadSpace = false;
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
    case "Ṁ":
      return { swara: "Ma", octave: "Taar" };
    case "Ġ":
      return { swara: "Ga", octave: "Taar" };
    case "S":
      return { swara: "Sa", octave: "Madhya" };
    case "R":
      return { swara: "Re", octave: "Madhya" };
    case "G":
      return { swara: "Ga", octave: "Madhya" };
    case "M":
    case "m":
      return { swara: "Ma", octave: "Madhya" };
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
    id: "core-ladder",
    title: "Ekgun Sargam",
    description: "Straight ascent and descent across the base octave.",
    aarohNotation: "S R G m P D N Ṡ",
    avarohNotation: "Ṡ N D P m G R S",
    aarohCoaching: "Keep the ascent even and let the top Sa settle cleanly.",
    avarohCoaching: "Return smoothly and keep the descent centered.",
    aarohMistakes: ["Rushing the upper turn", "Sagging through the middle notes"],
    avarohMistakes: ["Dropping pitch on the way down", "Softening the return too early"],
    minimumScore: 72,
    pitchToleranceCents: 18,
    lockBandCents: 10,
    releaseBandCents: 24,
    noiseMax: 35,
    stabilityMin: 64,
    sustainTargetMs: 1000,
    maxGapMs: 280,
    requireStrictTempo: true,
  },
  {
    id: "mirror-ladder",
    title: "Dugun Sargam",
    description: "Lower, middle, and upper notes folded into mirrored paths.",
    aarohNotation: "P̣ P Ḍ D Ṇ N S Ṡ R Ṙ Ṗ P ṁ m Ġ G Ṙ G Ġ m ṁ P Ṗ",
    avarohNotation: "R Ṡ S N Ṇ D Ḍ P P̣",
    aarohCoaching: "Treat each octave change as a clean shape shift, not a jump.",
    avarohCoaching: "Land the return with the same shape and tone.",
    aarohMistakes: ["Forcing the upper notes", "Dropping the mandra notes flat"],
    avarohMistakes: ["Returning too abruptly", "Letting the bottom notes sag"],
    minimumScore: 74,
    pitchToleranceCents: 16,
    lockBandCents: 10,
    releaseBandCents: 22,
    noiseMax: 34,
    stabilityMin: 66,
    sustainTargetMs: 950,
    maxGapMs: 300,
  },
  {
    id: "wide-return-ladder",
    title: "Tigun Sargam",
    description: "A wider octave span with a full return to the starting zone.",
    aarohNotation: "P̣ Ḍ Ṇ S R G m P D N Ṡ Ṙ Ṗ ṁ Ġ Ṙ Ġ ṁ Ṗ",
    avarohNotation: "Ṡ N D P m G R S Ṇ Ḍ P̣",
    aarohCoaching: "Keep the reach wide, but never lose the center note shape.",
    avarohCoaching: "Return with control; do not let the line collapse.",
    aarohMistakes: ["Letting the line flatten", "Overblowing the high turn"],
    avarohMistakes: ["Missing the low anchor", "Rushing the descending arc"],
    minimumScore: 76,
    pitchToleranceCents: 15,
    lockBandCents: 10,
    releaseBandCents: 22,
    noiseMax: 32,
    stabilityMin: 68,
    sustainTargetMs: 925,
    maxGapMs: 300,
  },
  {
    id: "leap-link-chain",
    title: "Chaugun Sargam",
    description: "Short links that train compact jumps and reversals.",
    aarohNotation: "P̣Ṇ ḌS ṆR SG Rm GP mD PN DṠ NṘ ṠĠ Ṙṁ ĠṖ",
    avarohNotation: "ṖĠ ṁṘ ĠṠ ṘN ṠD NP Dm PG mR GS RṆ SḌ ṆP̣",
    aarohCoaching: "Do not connect the notes too softly; each leap should still read clearly.",
    avarohCoaching: "Keep the return compact and balanced.",
    aarohMistakes: ["Smearing the leaps", "Landing late on the return"],
    avarohMistakes: ["Over-extending the backwards move", "Blurring the landing note"],
    minimumScore: 78,
    pitchToleranceCents: 14,
    lockBandCents: 9,
    releaseBandCents: 20,
    noiseMax: 30,
    stabilityMin: 70,
    sustainTargetMs: 900,
    maxGapMs: 260,
  },
  {
    id: "chain-weave-1",
    title: "Panchgun Sargam",
    description: "A denser weave through short phrase cells.",
    aarohNotation: `P̣ḌṆ ḌṆS ṆSR SRG RGm GmP mPD PDN DNṠ NṠṘ
ṠṘĠ ṘĠṁ ĠṁṖ
ṖṁĠ ṁĠṘ ĠṘṠ ṘṠN ṠND NDP DPM PmG mGR GRS
RSṆ SṆḌ ṆḌP̣`,
    avarohNotation: "P̣ḌṆ SṆḌP̣",
    aarohCoaching: "Play it as linked cells, not as disconnected fragments.",
    avarohCoaching: "Use the return to reset the hand shape.",
    aarohMistakes: ["Breaking the cell boundary", "Rushing the last note of each cell"],
    avarohMistakes: ["Collapsing the final return", "Squeezing the ending"],
    minimumScore: 80,
    pitchToleranceCents: 14,
    lockBandCents: 8,
    releaseBandCents: 20,
    noiseMax: 28,
    stabilityMin: 72,
    sustainTargetMs: 875,
    maxGapMs: 250,
  },
  {
    id: "chain-weave-2",
    title: "Chhegun Sargam",
    description: "Longer cells that stretch the same pattern logic.",
    aarohNotation: `P̣ḌṆS ḌṆSR ṆSRG SRGm RGmP GmPD mPDN PDNṠ DNṠṘ NṠṘĠ ṠṘĠṁ ṘĠṁṖ
ṖṁĠṘ ṁĠṘṠ ĠṘṠN ṘṠND ṠNDP NDPm DPmG PmGR mGRS GRSṆ RSṆḌ SṆḌP̣`,
    avarohNotation: "P̣ḌṆS ḌṆSR ṆSRG SRGm RGmP GmPD mPDN PDNṠ DNṠṘ NṠṘĠ ṠṘĠṁ ṘĠṁṖ",
    aarohCoaching: "Hold the geometry of each cell while the line keeps moving forward.",
    avarohCoaching: "Reverse the same geometry without losing the shape.",
    aarohMistakes: ["Over-lifting between cells", "Losing the octave anchor"],
    avarohMistakes: ["Rushing the retrograde", "Breaking the mirrored contour"],
    minimumScore: 82,
    pitchToleranceCents: 13,
    lockBandCents: 8,
    releaseBandCents: 18,
    noiseMax: 26,
    stabilityMin: 74,
    sustainTargetMs: 850,
    maxGapMs: 240,
  },
  {
    id: "full-sweep",
    title: "Saatgun Sargam",
    description: "A complete sweep across the phrase family.",
    aarohNotation: `P̣ḌṆSR ḌṆSRG ṆSRGm SRGmP RGmPD GmPDN mPDNṠ PDNṠṘ DNṠṘĠ NṠṘĠṁ ṠṘĠṁṖ
ṖṁĠṘṠ ṁĠṘṠN ĠṘṠND ṘṠNDP ṠNDPm NDPMG DPmGR PmGRS mGRSṆ GRSṆḌ RSṆḌP̣`,
    avarohNotation: "P̣ḌṆSR ḌṆSRG ṆSRGm SRGmP RGmPD GmPDN mPDNṠ PDNṠṘ DNṠṘĠ NṠṘĠṁ ṠṘĠṁṖ",
    aarohCoaching: "Keep the sweep broad but balanced; do not let the upper line outrun the lower.",
    avarohCoaching: "Return the sweep without thinning the tone.",
    aarohMistakes: ["Letting the middle blur", "Pushing the upper notes too hard"],
    avarohMistakes: ["Dropping the dynamic too much", "Skipping the return weight"],
    minimumScore: 84,
    pitchToleranceCents: 12,
    lockBandCents: 8,
    releaseBandCents: 18,
    noiseMax: 24,
    stabilityMin: 76,
    sustainTargetMs: 825,
    maxGapMs: 230,
  },
  {
    id: "expansion-sprint",
    title: "Aathgun Sargam",
    description: "Fast expansion through the full register line.",
    aarohNotation: `P̣ḌṆSRGmP ḌṆSRGmPD ṆSRGmPDN SRGmPDNṠ RGmPDNṠṘ GmPDNṠṘĠ mPDNṠṘĠṁ PDNṠṘĠṁṖ
ṖṁĠṘṠNDP ṁĠṘṠNDPm ĠṘṠNDPmG ṘṠNDPmGR ṠNDPmGRS NDPmGRSṆ DPmGRSṆḌ PmGRSṆḌP̣`,
    avarohNotation: "P̣ḌṆSRGmP ḌṆSRGmPD ṆSRGmPDN SRGmPDNṠ RGmPDNṠṘ GmPDNṠṘĠ mPDNṠṘĠṁ PDNṠṘĠṁṖ",
    aarohCoaching: "This is a speed test only after the line is already clean.",
    avarohCoaching: "The return should stay fast, but never sloppy.",
    aarohMistakes: ["Starting too fast", "Chasing speed before tone"],
    avarohMistakes: ["Losing control on the way back", "Flattening the top notes"],
    minimumScore: 86,
    pitchToleranceCents: 12,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 22,
    stabilityMin: 78,
    sustainTargetMs: 800,
    maxGapMs: 220,
  },
  {
    id: "alternating-matrix",
    title: "Naugun Sargam",
    description: "Alternating leaps and returns with a strong inner pulse.",
    aarohNotation: `P̣ḌS ḌṆR ṆSG SRm RGP GmD mPN PDṠ DNṘ NṠĠ ṠṘṁ ṘĠṖ
ṖṁṘ ṁĠṠ ĠṘN ṘṠD ṠNP NDM DPG PmR mGS GRṆ RSḌ SṆP̣`,
    avarohNotation: "P̣ḌS ḌṆR ṆSG SRm RGP GmD mPN PDṠ DNṘ NṠĠ ṠṘṁ ṘĠṖ",
    aarohCoaching: "Keep every leap compact, then reset the breath immediately.",
    avarohCoaching: "Mirror the same compact motion on the way down.",
    aarohMistakes: ["Over-extending the jump", "Dragging the return note"],
    avarohMistakes: ["Losing the beat after the turn", "Making the return too heavy"],
    minimumScore: 86,
    pitchToleranceCents: 11,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 22,
    stabilityMin: 78,
    sustainTargetMs: 775,
    maxGapMs: 220,
  },
  {
    id: "triple-mirror-matrix",
    title: "Dasgun Sargam",
    description: "A mirrored matrix of repeated directional cells.",
    aarohNotation: `P̣ḌṆP̣ḌP̣ ḌṆSḌṆḌ ṆSRṆSṆ SRGSRS RGmRGR GmPGmG mPDmPm PDNPDP DNṠDND ĠṁṖĠṁĠ
NṠṘNṠN ṠṘĠṠṘṠ ṘĠṁṘĠṘ ṖṁĠṖṁṖ ṁĠṘṁĠṁ ĠṘṠĠṘĠ ṘṠNṘṠṘ ṠNDṠNS NDPNDN DPmDPD PmGPmP mGRmGm GRSGRG RSNRSR SṆḌSṆS ṆḌP̣ṆḌṆ`,
    avarohNotation: "P̣ḌṆP̣ḌP̣ ḌṆSḌṆḌ ṆSRṆSṆ SRGSRS RGmRGR GmPGmG mPDmPm PDNPDP DNṠDND ĠṁṖĠṁĠ",
    aarohCoaching: "This one should sound symmetrical from start to finish.",
    avarohCoaching: "Keep the mirrored return equally weighted.",
    aarohMistakes: ["Making one side louder than the other", "Breaking the mirror shape"],
    avarohMistakes: ["Widening the second half", "Letting the tone sag on the return"],
    minimumScore: 88,
    pitchToleranceCents: 11,
    lockBandCents: 8,
    releaseBandCents: 16,
    noiseMax: 20,
    stabilityMin: 80,
    sustainTargetMs: 750,
    maxGapMs: 200,
  },
  {
    id: "dense-link-matrix",
    title: "Gyarahgun Sargam",
    description: "Compressed transitions with repeated directional changes.",
    aarohNotation: `P̣ḌṆSṆḌ P̣ḌṆḌ P̣ḌṆS ḌṆSRSṆ ḌṆSṆ ḌṆSR ṆSRGRS ṆSRS ṆSRG SRGMGR SRGR SRGm RGMPmG RGmG RGmP GmPDPm GmPmGmPD mPDNDP mPDP mPDN PDNṠND PDND PDNṠ DNṠṘSN DNṠN DNṠṘ NṠṘĠṘṠ NṠṘṠ NṠṘĠ ṠṘĠṁĠṘ ṠṘĠṘ ṠṘĠṁ ṘĠṁṖṁĠ ṘĠṁĠ ṘĠṁṖ ṖṁĠṘĠṁ ṖṁĠṁ ṖṁĠṘ ṁĠṘṠṘĠ ṁĠṘĠ ṁĠṘṠ ĠṘṠNSṘ ĠṘṠṘ ĠṘṠN ṘṠNDNṠ ṘṠNṠ ṘṠND ṠNDPDN ṠNDN ṠNDP NDPMPD NDPD NDPm DPmGmP DPmP DPmG PmGRGm PmGm PmGR mGRSRG mGRG mGRS GRSṆSR GRSR GRSṆ RSṆḌṆS RSṆS RSṆḌ SṆḌP̣ḌṆ SṆḌṆ SṆḌP̣`,
    avarohNotation: "P̣ḌṆSṆḌ P̣ḌṆḌ P̣ḌṆS ḌṆSRSṆ ḌṆSṆ ḌṆSR ṆSRGRS ṆSRS ṆSRG SRGMGR SRGR SRGm",
    aarohCoaching: "Stay compact. This drill rewards precision more than reach.",
    avarohCoaching: "Mirror the compression without opening the gaps.",
    aarohMistakes: ["Blurring the repeated cells", "Losing the pulse in the compression"],
    avarohMistakes: ["Stretching the return", "Letting one cell dominate"],
    minimumScore: 88,
    pitchToleranceCents: 10,
    lockBandCents: 6,
    releaseBandCents: 14,
    noiseMax: 18,
    stabilityMin: 82,
    sustainTargetMs: 725,
    maxGapMs: 190,
  },
  {
    id: "pair-ladder",
    title: "Barahgun Sargam",
    description: "Repeated-note ladders that lock in finger memory.",
    aarohNotation: `P̣ḌḌ P̣ḌḌ P̣Ḍ ḌṆṆ ḌṆṆ ḌṆ ṆSS ṆSS ṆS SRR SRR SR RGG RGG RG Gmm Gmm Gm mPP mPP MP PDD PDD PD DNN DNN DN NṠṠ NṠṠ NṠ ṠṘṘ ṠṘṘ ṠṘ ṘĠĠ ṘĠĠ ṘĠ Ġṁṁ Ġṁṁ Ġṁ ṁṖṖ ṁṖṖ ṁṖ Ṗṁṁ Ṗṁṁ Ṗṁ ṁĠĠ ṁĠĠ ṁĠ ĠṘṘ ĠṘṘ ĠṘ ṘṠṠ ṘṠṠ ṘṠ ṠNN ṠNN ṠN NDD NDD ND DPP DPP DP Pmm Pmm Pm mGG mGG mG GRR GRR GR RSS RSS RS SṆṆ SṆṆ SṆ ṆḌḌ ṆḌḌ ṆḌ ḌP̣P̣ ḌP̣P̣ ḌP̣`,
    avarohNotation: "P̣ḌḌ P̣ḌḌ P̣Ḍ ḌṆṆ ḌṆṆ ḌṆ ṆSS ṆSS ṆS SRR SRR SR",
    aarohCoaching: "Make each pair feel identical; the second hit should sound like the first.",
    avarohCoaching: "Keep the return pairs just as even as the ascent.",
    aarohMistakes: ["Uneven double strikes", "Trailing off on the second repetition"],
    avarohMistakes: ["Skipping the second hit", "Letting the line weaken at the turn"],
    minimumScore: 90,
    pitchToleranceCents: 10,
    lockBandCents: 6,
    releaseBandCents: 12,
    noiseMax: 18,
    stabilityMin: 84,
    sustainTargetMs: 700,
    maxGapMs: 180,
  },
  {
    id: "final-bridge",
    title: "Terahgun Sargam",
    description: "A long bridge drill that links the short cells into a single run.",
    aarohNotation: `P̣ḌP̣ GRSṆḌ PmGRSṆḌP̣
ḌṆḌ mGRSṆ DPmGRSṆḌ
ṆSṆ PmGRS NDPmGRSṆ
SRS DPmGR ṠNDPmGRS
RGR NDPMG ṘṠNDPMGR
GmG ṠNDPM ĠṘṠNDPmG
MPM ṘṠNDP ṀĠṘṠNDPM
PDP ĠṘṠND ṖṁĠṘṠNDP
ṖṁṖ NṠṘĠṁ PDNṠṘĠṁṖ
ṁĠṁ DNṠṘĠ mPDNṠṘĠṁ
ĠṘĠ PDNṠṘ GmPDNṠṘĠ
ṘṠṘ mPDNṠ RGmPDNṠṘ
ṠNṠ GmPDN SRGmPDNṠ
NDN RGmPD ṆSRGmPDN
DPD SRGmP ḌṆSRGmPD
PmP ṆSRGm P̣ḌṆSRGmP`,
    avarohNotation: "P̣ḌP̣ GRSṆḌ PmGRSṆḌP̣",
    aarohCoaching: "Keep the line steady while the cells change quickly.",
    avarohCoaching: "End with the same balance you began with.",
    aarohMistakes: ["Speeding up in the middle", "Losing the bridge note between cells"],
    avarohMistakes: ["Dropping the final landing", "Rushing the close"],
    minimumScore: 92,
    pitchToleranceCents: 9,
    lockBandCents: 6,
    releaseBandCents: 12,
    noiseMax: 16,
    stabilityMin: 86,
    sustainTargetMs: 675,
    maxGapMs: 170,
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
