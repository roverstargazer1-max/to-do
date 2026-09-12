"use client";

import { useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/lib/store/timerStore";
import { useTimer } from "@/components/TimerProvider";
import { useAuth } from "@/components/AuthProvider";
import type { TimerMode } from "@/lib/types/timer";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import { NodeCard } from "./NodeCard";
import type { WorkspaceNodeComponentProps } from "./node-registry";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

const MODE_LABEL_KEYS = {
  focus: "workspace.focusNode.modeFocus",
  shortBreak: "workspace.focusNode.modeShortBreak",
  longBreak: "workspace.focusNode.modeLongBreak",
} as const satisfies Record<TimerMode, string>;

/**
 * The focus Node — a projection of the timer singleton, not a second timer
 * (ADR 0020). Kind `focus`, no entity reference: running state reads the
 * same `timerStore` every timer surface reads, and the countdown derives
 * from the same server-anchored deadline machinery (`endsAt` + server
 * clock) the focus page's countdown uses. Start/pause/stop call the same
 * provider actions the focus page calls — `TimerProvider` wraps the app
 * shell, so the node is inside its context and no second write path is
 * even constructible. Multiple focus nodes are lenses on the one
 * singleton.
 *
 * `start()` without an argument resumes the partial session anchored to
 * the time that remains and falls back to the active task, so task
 * association behaves exactly as it does from the focus page's controls.
 *
 * The timer is deliberately not command-ified: this node publishes no
 * Domain Events and executes no timer commands; removing the node is the
 * only layout write (spec: User Stories 10, 13, 14). History (completed
 * sessions in focus logs) is a different source and is not shown here.
 */
export function FocusNode({ data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  // The singleton every timer surface reads — a projection, never a copy.
  const mode = useTimerStore((s) => s.state.mode);
  const isRunning = useTimerStore((s) => s.state.isRunning);
  const remainingSeconds = useTimerStore((s) => s.state.remainingSeconds);
  const completedSessions = useTimerStore((s) => s.state.completedSessions);

  // The same actions the focus page calls, through the shared provider.
  const { start, pause, stop } = useTimer();

  const [removing, setRemoving] = useState(false);

  // node.remove — layout only; the timer singleton is never touched.
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const removeButton = (
    <button
      type="button"
      onClick={handleRemove}
      disabled={removing}
      data-testid="focus-node-remove"
      aria-label={t("workspace.node.removeFocusAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  const controlButton =
    "nodrag h-7 w-7 grid place-content-center rounded-md border border-border bg-background text-foreground/80 hover:text-foreground hover:border-foreground/40 active:scale-95 transition-[colors,transform] duration-200 ease-seijaku";

  return (
    <div data-testid="focus-node" className="relative w-full h-full">
      <span data-testid="focus-node-timer" className="sr-only">
        {isRunning ? "running" : "paused"}
      </span>

      <NodeCard kind={t("workspace.node.kindFocus")} action={removeButton}>
        <div className="flex flex-col items-center gap-1.5 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(MODE_LABEL_KEYS[mode])}
          </p>
          <p
            data-testid="focus-node-countdown"
            className="text-2xl font-light font-mono tracking-tight tabular-nums text-foreground"
          >
            {formatTime(remainingSeconds)}
          </p>

          <div className="flex items-center gap-2 pt-0.5">
            {isRunning ? (
              <button
                type="button"
                onClick={pause}
                data-testid="focus-node-pause"
                aria-label={t("workspace.focusNode.pauseAria")}
                className={controlButton}
              >
                <Pause className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                data-testid="focus-node-start"
                aria-label={t("workspace.focusNode.startAria")}
                className={controlButton}
              >
                <Play className="h-3.5 w-3.5 ml-0.5" strokeWidth={2.25} />
              </button>
            )}
            <button
              type="button"
              onClick={stop}
              data-testid="focus-node-stop"
              aria-label={t("workspace.focusNode.stopAria")}
              className={`${controlButton} text-muted-foreground hover:text-foreground`}
            >
              <Square className="h-3 w-3" strokeWidth={2.25} />
            </button>
          </div>

          {mode === "focus" && (
            <p className="text-[10px] text-muted-foreground/80 font-medium">
              {t("workspace.focusNode.session", {
                number: completedSessions + 1,
              })}
            </p>
          )}
        </div>
      </NodeCard>
    </div>
  );
}
