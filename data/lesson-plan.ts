import type { OctaveName, SwaraName, SwaraTarget } from "@/lib/swara";

export type LessonStep = {
  id: string;
  title: string;
  target: SwaraTarget;
  sustainTargetMs: number;
  minimumScore: number;
  coaching: string;
};

export type LessonModule = {
  id: string;
  title: string;
  description: string;
  steps: LessonStep[];
};

function step(
  id: string,
  title: string,
  swara: SwaraName,
  octave: OctaveName,
  sustainTargetMs: number,
  minimumScore: number,
  coaching: string,
): LessonStep {
  return {
    id,
    title,
    target: { swara, octave },
    sustainTargetMs,
    minimumScore,
    coaching,
  };
}

export const foundationModules: LessonModule[] = [
  {
    id: "first-breath",
    title: "First Breath",
    description: "Start with tone production and settle a clean, sustained Madhya Sa.",
    steps: [
      step(
        "madhya-sa-1",
        "Center and hold your first Sa",
        "Sa",
        "Madhya",
        2400,
        65,
        "Keep the embouchure relaxed, find a clean Sa, and hold it steadily before moving on.",
      ),
    ],
  },
  {
    id: "seven-swaras",
    title: "Seven Swaras",
    description: "Move across the basic swaras before attempting full patterns.",
    steps: [
      step("madhya-re", "Find Re", "Re", "Madhya", 2200, 72, "Lift fingers gently and avoid jumping sharp."),
      step("madhya-ga", "Find Ga", "Ga", "Madhya", 2200, 72, "Let the note settle before pushing more air."),
      step("madhya-ma", "Find Ma", "Ma", "Madhya", 2200, 74, "Seal the holes fully to reduce airy leakage."),
      step("madhya-pa", "Find Pa", "Pa", "Madhya", 2200, 74, "Listen for a centered tone before sustaining."),
    ],
  },
  {
    id: "octave-anchors",
    title: "Octave Anchors",
    description: "Build confidence in each register using anchor notes.",
    steps: [
      step("mandra-ni", "Drop into Mandra Ni", "Ni", "Mandra", 2400, 76, "Relax the airstream and let the register fall naturally."),
      step("madhya-sa-3", "Return to Madhya Sa", "Sa", "Madhya", 3000, 80, "Reset to center with a clean, stable attack."),
      step("tara-pa", "Reach Tara Pa", "Pa", "Tara", 1800, 78, "Use focused air support, but do not force the sound."),
    ],
  },
];
