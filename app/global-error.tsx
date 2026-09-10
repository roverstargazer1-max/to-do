"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { tr } from "@/lib/i18n/tr";
import { useUiStore } from "@/lib/store/uiStore";

/**
 * Catches errors thrown by the root layout itself (providers, fonts, etc.) —
 * `error.tsx` can't, since it renders *inside* the layout. Next.js requires
 * this file to render its own <html>/<body>; kept deliberately lean (no
 * Tailwind tokens, providers, or app components) since those are exactly what
 * may have just crashed. Two exceptions: Sentry (a monitoring SDK, and the
 * only way to see root-layout crashes) and the i18n store, whose module-level
 * zustand state survives a layout crash — `tr()` reads it without any React
 * context. Renders English on the server, the active locale after hydration;
 * `suppressHydrationWarning` absorbs that one-frame difference on the
 * document element, matching the root layout's policy.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useUiStore((s) => s.language ?? "en");

  useEffect(() => {
    console.error("Unhandled root layout error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={language} suppressHydrationWarning>
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          backgroundColor: "#1A1A1A",
          color: "#FCFCFA",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          {tr("common.globalError.title")}
        </h1>
        <p style={{ marginTop: "0.75rem", maxWidth: "28rem", opacity: 0.75 }}>
          {tr("common.globalError.description")}
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          {tr("common.globalError.tryAgain")}
        </button>
      </body>
    </html>
  );
}
