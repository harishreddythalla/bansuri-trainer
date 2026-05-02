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
};

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

const MIN_PRACTICE_HOLD_MS = 2400;

function normalizePracticeHoldMs(value: number) {
  return value < 1000 ? MIN_PRACTICE_HOLD_MS : value;
}

function normalizePracticeHoldSeconds(value: number) {
  return value < 1 ? MIN_PRACTICE_HOLD_MS / 1000 : value;
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

function module(
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

export const curriculumTracks: CurriculumTrack[] = [
  {
    id: "hindustani-path",
    title: "Hindustani Path",
    description: "From clean Sa to alankars and raga phrases, with a slow ramp and strict gating.",
    order: 1,
    modules: [
      module("tone-foundation", "Tone Foundation", "Sound first. Breath, embouchure, and a stable Madhya Sa.", 1, [], [
        group(
          "tone-foundation-core",
          "Stable Sa",
          "tone",
          1,
          "none",
          "Find a centered Sa and then hold it without drifting.",
          [
            single(
              "madhya-sa-center",
              "Center and hold your first Sa",
              "Find a clean Madhya Sa and keep it stable.",
              { swara: "Sa", octave: "Madhya", state: "Shuddha" },
              2.4,
              65,
              25,
              12,
              28,
              45,
              55,
              cMediumAndUp,
              "Relax the embouchure and let the note settle before moving on.",
              ["Overblowing", "Tilting the flute too steeply", "Squeezing the corners of the mouth"],
              "disable",
            ),
            single(
              "madhya-sa-steadiness",
              "Hold Sa steadily",
              "Extend the same Sa with cleaner breath control.",
              { swara: "Sa", octave: "Madhya", state: "Shuddha" },
              5,
              75,
              18,
              10,
              24,
              40,
              65,
              cMediumAndUp,
              "Keep the airflow soft and even; do not chase volume.",
              ["Letting the pitch sag near the end", "Breath pressure spikes", "Finger leaks"],
              "disable",
            ),
          ],
        ),
      ]),
      module("swara-placement", "Swara Placement", "Place each Madhya swara accurately before combining them.", 2, ["tone-foundation"], [
        group(
          "madhya-swaras",
          "Seven swaras in Madhya",
          "swara",
          1,
          "clear_previous_group",
          "Map each swara to its hole pattern and settle it in tune.",
          [
            single("madhya-re", "Find Re", "Place Madhya Re cleanly.", { swara: "Re", octave: "Madhya", state: "Shuddha" }, 2.2, 72, 20, 12, 25, 35, 60, cMediumAndUp, "Lift fingers gently and avoid overshooting sharp.", ["Jumping sharp", "Half-hole leakage"], "disable"),
            single("madhya-ga", "Find Ga", "Place Madhya Ga cleanly.", { swara: "Ga", octave: "Madhya", state: "Shuddha" }, 2.2, 72, 20, 12, 25, 35, 60, cMediumAndUp, "Let the note settle before pushing more air.", ["Raising the breath too quickly", "Half-covered holes"], "disable"),
            single("madhya-ma", "Find Ma", "Place Madhya Ma cleanly.", { swara: "Ma", octave: "Madhya", state: "Shuddha" }, 2.2, 74, 18, 10, 22, 30, 65, cMediumAndUp, "Seal the holes fully to reduce airy leakage.", ["Air leaks", "Overturning the flute"], "disable"),
            single("madhya-pa", "Find Pa", "Place Madhya Pa cleanly.", { swara: "Pa", octave: "Madhya", state: "Shuddha" }, 2.2, 74, 18, 10, 22, 30, 65, cMediumAndUp, "Keep the note centered before sustaining.", ["Forcing extra breath", "Wobbling the embouchure"], "disable"),
            single("madhya-dha", "Find Dha", "Place Madhya Dha cleanly.", { swara: "Dha", octave: "Madhya", state: "Shuddha" }, 2.2, 74, 18, 10, 22, 30, 65, cMediumAndUp, "Use a relaxed, focused airstream.", ["Pitching too low", "Covered hole leaks"], "disable"),
            single("madhya-ni", "Find Ni", "Place Madhya Ni cleanly.", { swara: "Ni", octave: "Madhya", state: "Shuddha" }, 2.2, 74, 18, 10, 22, 30, 65, cMediumAndUp, "Let the top note ring without pinching.", ["Overtightening the lips", "Chasing volume"], "disable"),
          ],
        ),
      ]),
      module("interval-links", "Interval Links", "Learn adjacent swara motion as real musical motion.", 3, ["swara-placement"], [
        group(
          "adjacent-links",
          "Adjacent pairs",
          "interval",
          1,
          "clear_previous_group",
          "Move one clean step at a time and keep the line smooth.",
          [
            sequence("sa-re-link", "Sa to Re", "Link Sa and Re as a two-note interval.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 72, 18, 10, 24, 35, 65, cMediumAndUp, "Keep the transition relaxed and let the second note land cleanly.", ["Sliding too slowly", "Missing the target by forcing the change"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("re-ga-link", "Re to Ga", "Move Re to Ga without collapsing the tone.", [
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 72, 18, 10, 24, 35, 65, cMediumAndUp, "Use only the fingers needed for the next note.", ["Lift too many fingers", "Overblowing at the transition"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("ga-ma-link", "Ga to Ma", "Move Ga to Ma cleanly.", [
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 72, 18, 10, 24, 35, 65, cMediumAndUp, "Hold the airflow steady; do not let the pitch jump.", ["Air spike", "Incomplete finger closure"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("ma-pa-link", "Ma to Pa", "Move Ma to Pa cleanly.", [
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 74, 18, 10, 22, 35, 68, cMediumAndUp, "Keep the embouchure steady across the jump.", ["Pitch sliding out of center", "Breath becoming noisy"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("pa-dha-link", "Pa to Dha", "Move Pa to Dha cleanly.", [
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 74, 18, 10, 22, 35, 68, cMediumAndUp, "Shift fingers with less motion, not more air.", ["Forcing the note higher", "Unstable hole coverage"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("dha-ni-link", "Dha to Ni", "Move Dha to Ni cleanly.", [
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 74, 18, 10, 22, 35, 68, cMediumAndUp, "Let the last note settle rather than jumping past it.", ["Breath pulse too strong", "Over-rotating the flute"], { maxGapMs: 650, requireStrictTempo: false }),
            sequence("ni-sa-link", "Ni back to Sa", "Return from Ni to Sa cleanly.", [
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
              { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 380, isAnchor: true },
            ], 1, 75, 18, 10, 22, 35, 68, cMediumAndUp, "Keep the top Sa centered even as the register shifts.", ["Missing the octave jump", "Overblowing the upper Sa"], { maxGapMs: 650, requireStrictTempo: false }),
          ],
        ),
      ]),
      module("scale-runs-alankars", "Scale Runs and Alankars", "Turn notes into patterns, not isolated targets.", 4, ["interval-links"], [
        group(
          "simple-alankars",
          "Pattern drills",
          "sequence",
          1,
          "clear_previous_group",
          "Build speed only after the sequence is clean and even.",
          [
            sequence("basic-arohana-avarohana", "Simple ascent/descent", "Play a full ascent and descent.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 240, isAnchor: true },
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 240, isAnchor: true },
            ], 2, 78, 15, 10, 30, 30, 70, cMediumAndUp, "Read the whole line before playing. Do not rush the turnback.", ["Uneven spacing", "Forgetting the octave anchor"], { maxGapMs: 300, requireStrictTempo: true }),
            sequence("four-note-climb", "Four-note climb", "Climb in four-note groups.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 200, isAnchor: true },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 160 },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 200, isAnchor: true },
            ], 2, 78, 15, 10, 30, 30, 70, cMediumAndUp, "Keep the pattern shape consistent across each four-note cell.", ["Rushing the middle note", "Squeezing the final note"], { maxGapMs: 560, requireStrictTempo: false }),
            sequence("repeated-notes", "Repeated note taps", "Repeat notes without losing clarity.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            ], 2, 80, 15, 10, 28, 28, 72, cMediumAndUp, "Make the repeated note feel like one controlled pulse, not two separate guesses.", ["Delayed finger release", "Air spikes between repeats"], { maxGapMs: 260, requireStrictTempo: true }),
            sequence("zigzag-pattern", "Zig-zag pattern", "Move up and down without losing the line.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 150 },
            ], 2, 80, 15, 10, 28, 28, 72, cMediumAndUp, "Keep each turn compact and consistent.", ["Jumping too far between notes", "Losing breath consistency"], { maxGapMs: 260, requireStrictTempo: true }),
          ],
        ),
      ]),
      module("raga-grammar", "Raga Grammar", "Learn actual phrasing instead of generic scales.", 5, ["scale-runs-alankars"], [
        group(
          "raga-bhoopali",
          "Bhoopali",
          "raga_grammar",
          1,
          "clear_previous_group",
          "Teach the pentatonic feel and the Bhoopali vowel-like contour.",
          [
            sequence("bhoopali-pakad", "Bhoopali pakad", "Play the defining Bhoopali phrase.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
              { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
            ], 2, 82, 12, 8, 25, 25, 75, cMediumAndUp, "Lean on Ga and Dha, and avoid sounding like a major scale exercise.", ["Touching Ma or Ni", "Rushing the cadential notes"], { maxGapMs: 320, requireStrictTempo: false }, "disable", 2, "active", {
              allowedSwaras: ["Sa", "Re", "Ga", "Pa", "Dha"],
              arohana: [
                { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 180 },
              ],
              avarohana: [
                { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              ],
              pakad: [[
                { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
                { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              ]],
              vadi: "Ga",
              samvadi: "Dha",
              nyas: ["Ga", "Dha"],
              forbiddenPhrases: ["Sa Re Ga Ma", "Sa Re Ga Ma Pa"],
            }),
          ],
        ),
        group(
          "raga-yaman",
          "Yaman",
          "raga_grammar",
          2,
          "clear_previous_group",
          "Introduce Teevra Ma and the bright upward pull of Yaman.",
          [
            sequence("yaman-pakad", "Yaman entry", "Play the Yaman entry phrase with Teevra Ma.", [
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ma", octave: "Madhya", state: "Teevra" }, sustainTargetMs: 240, isAnchor: true },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 240, isAnchor: true },
            ], 2, 84, 12, 8, 25, 25, 76, cMediumAndUp, "Hear the raised Ma before you move into it; do not make it sound like a natural Ma.", ["Using Shuddha Ma by habit", "Forcing the upper register"], { maxGapMs: 320, requireStrictTempo: false }, "disable", 2, "active", {
              allowedSwaras: ["Ni", "Re", "Ga", "Ma", "Pa", "Dha", "Sa"],
              vadi: "Ga",
              samvadi: "Ni",
              nyas: ["Ma", "Ni"],
              forbiddenPhrases: ["Ma (Shuddha)", "Sa Re Ga Ma"],
            }),
          ],
        ),
        group(
          "raga-bilawal",
          "Bilawal",
          "raga_grammar",
          3,
          "clear_previous_group",
          "Keep the notes natural and clear in a major-like frame.",
          [
            sequence("bilawal-pakad", "Bilawal phrase", "Play a clean Bilawal phrase with no altered notes.", [
              { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
              { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
            ], 2, 82, 12, 8, 25, 25, 75, cMediumAndUp, "Keep the scale natural but phrased like music, not a run.", ["Flattening the line into a generic scale", "Rushing the top Sa"], { maxGapMs: 320, requireStrictTempo: false }, "disable", 2, "active", {
              allowedSwaras: ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni"],
              vadi: "Pa",
              samvadi: "Re",
              nyas: ["Pa", "Sa"],
              forbiddenPhrases: ["Ma#"],
            }),
          ],
        ),
      ]),
      module("ornamentation", "Ornamentation", "Advanced bends, oscillations, and rapid clusters.", 6, ["raga-grammar"], [
        group(
          "ornamentation-preview",
          "Future ornamentation",
          "ornamentation",
          1,
          "clear_module",
          "Meend, Gamak, Khatka, and Murki belong here once the pitch engine is extended.",
          [
            single("ornamentation-placeholder", "Coming soon", "Reserved for continuous glides and oscillations.", { swara: "Sa", octave: "Madhya", state: "Shuddha" }, 0.5, 0, 0, 0, 0, 0, 0, bassAndMedium, "This block is intentionally hidden from the current flow.", ["Placeholder"], "hide", 1, "planned"),
          ],
          undefined,
          "planned",
        ),
      ]),
    ],
  },
  {
    id: "carnatic-path",
    title: "Carnatic Path",
    description: "Varisais first, then rhythm and phrase discipline in Mayamalavagowla.",
    order: 2,
    modules: [
      module("tone-sruti", "Tone and Sruti Alignment", "Center the flute tone against the drone before the varisais begin.", 1, [], [
        group("sruti-basics", "Tone checks", "tone", 1, "none", "Get one clean stable Sa and hold it against the tanpura.", [
          single("carnatic-sa", "Stable Sa", "Hold the Carnatic tonic cleanly.", { swara: "Sa", octave: "Madhya", state: "Shuddha" }, 2.4, 68, 22, 12, 26, 40, 60, cMediumAndUp, "Match the shruti before worrying about speed.", ["Overblowing", "Ignoring the drone"], "disable"),
        ]),
      ]),
      module("varisai-foundations", "Varisai Foundations", "Sarali, Janta, Dhatu, and Melstayi build the grammar of Carnatic practice.", 2, ["tone-sruti"], [
        group("sarali-varisai", "Sarali Varisai", "sequence", 1, "clear_previous_group", "Straight line movement in Mayamalavagowla.", [
          sequence("sarali-1", "Sarali 1", "Basic ascent and descent.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
          ], 1, 76, 16, 10, 30, 30, 70, cMediumAndUp, "Keep the line even and the talam steady.", ["Rushing the ascent", "Losing shruti on the upper Sa"], { maxGapMs: 260, requireStrictTempo: true }),
        ]),
        group("janta-varisai", "Janta Varisai", "sequence", 2, "clear_previous_group", "Double each note so the fingers and breath learn repetition.", [
          sequence("janta-1", "Janta 1", "Repeat each swara as a pair.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140, isAnchor: true },
          ], 1, 78, 15, 10, 30, 30, 72, cMediumAndUp, "Use crisp, equal taps on both iterations of the note.", ["Second note too weak", "Uneven spacing"], { maxGapMs: 240, requireStrictTempo: true }),
        ]),
        group("dhatu-varisai", "Dhatu Varisai", "sequence", 3, "clear_previous_group", "Skip-note patterns train leaps and finger control.", [
          sequence("dhatu-1", "Dhatu 1", "Move in zig-zag patterns.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Pa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Dha", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
          ], 1, 78, 15, 10, 30, 30, 72, cMediumAndUp, "Keep the skipped notes intentional, not accidental.", ["Confusing the zig-zag shape", "Losing breath stability"], { maxGapMs: 260, requireStrictTempo: true }),
        ]),
        group("melstayi-varisai", "Melstayi and Mandhra", "sequence", 4, "clear_previous_group", "Test octave command without rushing the jump.", [
          sequence("melstayi-1", "Melstayi 1", "Move into the higher octave and back.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Sa", octave: "Taar", state: "Shuddha" }, sustainTargetMs: 220, isAnchor: true },
            { target: { swara: "Ni", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
          ], 2, 80, 15, 10, 28, 28, 72, cMediumAndUp, "Treat the octave move as one breath decision, not a random jump.", ["Overblowing the upper Sa", "Missing the return to Madhya"], { maxGapMs: 300, requireStrictTempo: true }),
        ]),
      ]),
    ],
  },
  {
    id: "riyaaz-engine",
    title: "Riyaaz Engine",
    description: "Daily drill loops that keep tone, time, and memory in shape.",
    order: 3,
    modules: [
      module("riyaaz-core", "Core Conditioning", "Daily long notes and breath stability.", 1, [], [
        group("long-swaras", "Long swaras", "riyaaz", 1, "none", "Play one note per breath and keep the line centered.", [
          single("daily-sa", "Long Sa", "Hold Sa with a long, even breath.", { swara: "Sa", octave: "Madhya", state: "Shuddha" }, 6, 78, 15, 10, 20, 30, 70, cMediumAndUp, "Aim for a stable tone, not just a long one.", ["Pitch drift", "Breath sag"], "disable"),
        ]),
      ]),
      module("riyaaz-intervals", "Motor Skills", "Intervals and repeat-pattern motor memory.", 2, ["riyaaz-core"], [
        group("daily-ladder", "Swara ladder", "sequence", 1, "clear_previous_group", "Move through the scale in a daily loop.", [
          sequence("daily-ladder-1", "Daily ladder", "Step through a short practice ladder.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 180 },
          ], 2, 78, 15, 10, 30, 30, 70, cMediumAndUp, "Use this as a warm-up rather than a sprint.", ["Rushing the first note", "Losing tone at the fourth note"], { maxGapMs: 280, requireStrictTempo: true }),
        ]),
      ]),
      module("riyaaz-patterns", "Pattern Work", "Alankars and short cycles for daily fluency.", 3, ["riyaaz-intervals"], [
        group("daily-alankar", "Daily alankar", "sequence", 1, "clear_previous_group", "Repeat a core alankar in a daily cadence.", [
          sequence("daily-alankar-1", "Alankar loop", "Practice a short daily alankar loop.", [
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ma", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Ga", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Re", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
            { target: { swara: "Sa", octave: "Madhya", state: "Shuddha" }, sustainTargetMs: 140 },
          ], 2, 80, 15, 10, 28, 28, 72, cMediumAndUp, "Keep the loop exact each time; daily practice should feel predictable.", ["Letting the middle note blur", "Varying the return path"], { maxGapMs: 260, requireStrictTempo: true }),
        ]),
      ]),
      module("riyaaz-review", "Review and Endurance", "Rote revision keeps old checkpoints alive.", 4, ["riyaaz-patterns"], [
        group("daily-review", "Revision loop", "riyaaz", 1, "clear_module", "Review older checkpoints and build endurance.", [
          single("daily-review-sa", "Revision Sa", "Revisit a stable Sa after the warm-up.", { swara: "Sa", octave: "Madhya", state: "Shuddha" }, 10, 82, 12, 8, 20, 25, 75, cMediumAndUp, "Use the same embouchure every day so the body learns the shape.", ["Changing breath angle", "Growing tired halfway through"], "disable"),
        ]),
      ]),
    ],
  },
];

function flattenTrack(track: CurriculumTrack): LegacyModule[] {
  return track.modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    description: mod.description,
    steps: mod.checkpointGroups.flatMap((group) =>
      group.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        groupId: group.id,
        groupTitle: group.title,
      })),
    ),
  }));
}

export const activeHindustaniModules = flattenTrack(curriculumTracks[0]);
