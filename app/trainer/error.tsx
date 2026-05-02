"use client";

import { useEffect } from "react";

export default function TrainerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        color: "white",
        background: "#0b1220",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Trainer failed to render</div>
        <div style={{ fontSize: 14, opacity: 0.72, lineHeight: 1.5, marginBottom: 16 }}>
          Something in the trainer page threw an error. Retry after the route resets.
        </div>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            padding: "10px 14px",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          Retry trainer
        </button>
      </div>
    </div>
  );
}
