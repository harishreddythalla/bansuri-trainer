export type LearningTrack = {
  title: string;
  subtitle: string;
  progress: string;
  lessons: string[];
};

export const learningTracks: LearningTrack[] = [
  {
    title: "Foundation",
    subtitle: "Posture, airflow, stable tone, and first swaras",
    progress: "MVP active",
    lessons: ["First Sound", "Sa Stability", "7 Swaras", "3 Octaves"],
  },
  {
    title: "Riyaz Engine",
    subtitle: "Daily guided drills with score-based progression",
    progress: "MVP active",
    lessons: ["Sustain", "Swara Ladder", "Basic Alankars", "Beat Lock"],
  },
  {
    title: "Hindustani Path",
    subtitle: "Alankars, ragas, bandish, taans, and expression",
    progress: "Planned",
    lessons: ["Thaats", "Yaman", "Bhoopali", "Improvisation"],
  },
  {
    title: "Carnatic Path",
    subtitle: "Sarali, jantai, alankarams, geethams, varnams",
    progress: "Planned",
    lessons: ["Mayamalavagowla", "Sarali", "Geethams", "Gamaka Control"],
  },
];

export const dailyPlan = [
  {
    title: "Tone Check-in",
    duration: "4 min",
    description: "Confirm clean tone before swara work begins.",
  },
  {
    title: "Madhya Sa Mastery",
    duration: "6 min",
    description: "Hold Sa within tolerance and build airflow stability.",
  },
  {
    title: "Ascending Ladder",
    duration: "8 min",
    description: "Move Sa → Re → Ga → Ma with smooth finger transitions.",
  },
];
