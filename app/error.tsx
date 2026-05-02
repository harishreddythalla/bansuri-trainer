"use client";

import { useEffect } from "react";

export default function Error({
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
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.5, marginBottom: 16 }}>
          The page crashed while rendering. Try again or refresh the page.
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
          Retry
        </button>
      </div>
    </div>
  );
}
