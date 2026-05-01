import { curriculumTracks, type CurriculumCheckpoint, type CurriculumModule } from "@/data/curriculum";
import type { SwaraTarget } from "@/lib/swara";

type LegacySequenceStep = {
  target: SwaraTarget;
  sustainTargetMs: number;
  isAnchor?: boolean;
};

export type LessonStep = {
  id: string;
  title: string;
  type: CurriculumCheckpoint["type"];
  target?: SwaraTarget;
  sustainTargetMs: number;
  minimumScore: number;
  pitchToleranceCents: number;
  lockBandCents: number;
  releaseBandCents: number;
  noiseMax: number;
  stabilityMin: number;
  requiredConsecutiveClears: number;
  allowedProfiles: string[];
  unavailableBehavior: "hide" | "disable" | "show_dash";
  coaching: string;
  commonMistakes: string[];
  stage?: "active" | "planned";
  checkpointGroupId: string;
  checkpointGroupTitle: string;
  repeatCount?: number;
  steps?: LegacySequenceStep[];
  sequenceRules?: {
    maxGapMs: number;
    requireStrictTempo: boolean;
    resetMode: "loop";
  };
  ragaRules?: {
    allowedSwaras?: Array<"Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni">;
    arohana?: LegacySequenceStep[];
    avarohana?: LegacySequenceStep[];
    pakad?: LegacySequenceStep[][];
    vadi?: "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni";
    samvadi?: "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni";
    nyas?: Array<"Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni">;
    forbiddenPhrases?: string[];
  };
};

export type LessonModule = {
  id: string;
  title: string;
  description: string;
  steps: LessonStep[];
};

function flattenModule(module: CurriculumModule): LessonModule {
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    steps: module.checkpointGroups.flatMap((group) =>
      group.checkpoints.map((checkpoint) => {
        if (checkpoint.type === "sequence") {
          return {
            id: checkpoint.id,
            title: checkpoint.title,
            type: checkpoint.type,
            sustainTargetMs: Math.round(checkpoint.steps[0]?.sustainTargetMs ?? 0),
            minimumScore: checkpoint.minimumScore,
            pitchToleranceCents: checkpoint.pitchToleranceCents,
            lockBandCents: checkpoint.lockBandCents,
            releaseBandCents: checkpoint.releaseBandCents,
            noiseMax: checkpoint.noiseMax,
            stabilityMin: checkpoint.stabilityMin,
            requiredConsecutiveClears: checkpoint.requiredConsecutiveClears,
            allowedProfiles: checkpoint.allowedProfiles,
            unavailableBehavior: checkpoint.unavailableBehavior,
            coaching: checkpoint.coaching,
            commonMistakes: checkpoint.commonMistakes,
            stage: checkpoint.stage,
            checkpointGroupId: group.id,
            checkpointGroupTitle: group.title,
            repeatCount: checkpoint.repeatCount,
            steps: checkpoint.steps.map((step) => ({
              target: step.target,
              sustainTargetMs: step.sustainTargetMs,
              isAnchor: step.isAnchor,
            })),
            sequenceRules: checkpoint.sequenceRules,
            ragaRules: checkpoint.ragaRules
              ? {
                  allowedSwaras: checkpoint.ragaRules.allowedSwaras,
                  arohana: checkpoint.ragaRules.arohana?.map((step) => ({
                    target: step.target,
                    sustainTargetMs: step.sustainTargetMs,
                    isAnchor: step.isAnchor,
                  })),
                  avarohana: checkpoint.ragaRules.avarohana?.map((step) => ({
                    target: step.target,
                    sustainTargetMs: step.sustainTargetMs,
                    isAnchor: step.isAnchor,
                  })),
                  pakad: checkpoint.ragaRules.pakad?.map((phrase) =>
                    phrase.map((step) => ({
                      target: step.target,
                      sustainTargetMs: step.sustainTargetMs,
                      isAnchor: step.isAnchor,
                    })),
                  ),
                  vadi: checkpoint.ragaRules.vadi,
                  samvadi: checkpoint.ragaRules.samvadi,
                  nyas: checkpoint.ragaRules.nyas,
                  forbiddenPhrases: checkpoint.ragaRules.forbiddenPhrases,
                }
              : undefined,
          } satisfies LessonStep;
        }

        return {
          id: checkpoint.id,
          title: checkpoint.title,
          type: checkpoint.type,
          target: "target" in checkpoint ? checkpoint.target : undefined,
          sustainTargetMs: Math.round(
            "sustainSeconds" in checkpoint ? checkpoint.sustainSeconds * 1000 : 0,
          ),
          minimumScore: checkpoint.minimumScore,
          pitchToleranceCents: checkpoint.pitchToleranceCents,
          lockBandCents: checkpoint.lockBandCents,
          releaseBandCents: checkpoint.releaseBandCents,
          noiseMax: checkpoint.noiseMax,
          stabilityMin: checkpoint.stabilityMin,
          requiredConsecutiveClears: checkpoint.requiredConsecutiveClears,
          allowedProfiles: checkpoint.allowedProfiles,
          unavailableBehavior: checkpoint.unavailableBehavior,
          coaching: checkpoint.coaching,
          commonMistakes: checkpoint.commonMistakes,
          stage: checkpoint.stage,
          checkpointGroupId: group.id,
          checkpointGroupTitle: group.title,
        } satisfies LessonStep;
      }),
    ),
  };
}

export const foundationModules: LessonModule[] = curriculumTracks[0].modules.map(flattenModule);
