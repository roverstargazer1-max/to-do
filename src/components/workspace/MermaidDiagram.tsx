"use client";

import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";

export interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    let isCancelled = false;

    async function renderChart() {
      if (!chart.trim()) {
        setSvg(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      if (typeof window === "undefined") {
        setIsLoading(false);
        return;
      }

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "neutral",
          themeVariables: {
            darkMode: isDark,
            background: "transparent",
            fontFamily: "inherit",
            primaryColor: isDark ? "#27272a" : "#f4f4f5",
            primaryBorderColor: isDark ? "#3f3f46" : "#e4e4e7",
            primaryTextColor: isDark ? "#fafafa" : "#09090b",
            lineColor: isDark ? "#71717a" : "#a1a1aa",
          },
          securityLevel: "loose",
        });

        const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);
        if (!isCancelled) {
          setSvg(renderedSvg);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const errEl = document.querySelector(`[id^="dmermaid"]`);
          if (errEl) errEl.remove();

          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setIsLoading(false);
        }
      }
    }

    void renderChart();

    return () => {
      isCancelled = true;
    };
  }, [chart, isDark]);

  if (error) {
    return (
      <div
        data-testid="mermaid-error"
        className="my-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
      >
        <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mermaid Diagram Error
        </div>
        <pre className="overflow-x-auto text-[11px] font-mono leading-tight">
          {chart}
        </pre>
      </div>
    );
  }

  if (isLoading && !svg) {
    return (
      <div
        data-testid="mermaid-loading"
        className="my-2 flex h-24 w-full items-center justify-center rounded border border-border/40 bg-muted/20 text-xs text-muted-foreground animate-pulse"
      >
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="mermaid-diagram"
      className={`nodrag nowheel my-2 flex w-full max-w-full justify-center overflow-x-auto rounded border border-border/50 bg-background/50 p-2.5 text-foreground transition-colors [&_svg]:max-w-full [&_svg]:h-auto ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
