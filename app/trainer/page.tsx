"use client";

import { Header } from "@/components/header";
import dynamic from "next/dynamic";

const SwaraTrainer = dynamic(
  () => import("@/components/swara-trainer").then((mod) => mod.SwaraTrainer),
  { ssr: false }
);

export default function TrainerPage() {
  return (
    <>
      <Header />
      <SwaraTrainer />
    </>
  );
}
