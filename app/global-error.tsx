"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "white",
          background: "#0b1220",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Application error</div>
          <div style={{ fontSize: 14, opacity: 0.72, lineHeight: 1.5, marginBottom: 16 }}>
            A root layout error prevented the app from rendering.
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
      </body>
    </html>
  );
}
