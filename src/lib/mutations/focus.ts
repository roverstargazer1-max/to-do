import { focusClient } from "@/lib/api/focus-client";
import type { TimerSettings } from "@/lib/types/timer";

interface LogFocusSessionInput {
  task_id: string;
  durationSeconds: number;
}

export interface UpsertTimerStateInput {
  user_id: string;
  mode: string;
  remaining_seconds: number;
  is_running: boolean;
  active_task_id: string | null;
  ends_at: string | null;
  source_device_id: string;
  completed_sessions: number;
  settings: TimerSettings;
  updated_at?: string;
}

interface ClaimTimerCompletionInput extends UpsertTimerStateInput {
  claim_ends_at: string;
}

export const focusMutations = {
  logSession: async (input: LogFocusSessionInput): Promise<void> => {
    const { task_id, durationSeconds } = input;
    const now = new Date();
    const startTime = new Date(
      now.getTime() - durationSeconds * 1000,
    ).toISOString();
    const endTime = now.toISOString();

    await focusClient.logSession({
      task_id,
      start_time: startTime,
      end_time: endTime,
      duration_seconds: durationSeconds,
    });
  },

  upsertTimerState: async (_input: UpsertTimerStateInput): Promise<void> => {
    // Pure local standalone: timer state is held in client runtime
  },

  claimTimerCompletion: async (
    _input: ClaimTimerCompletionInput,
  ): Promise<boolean> => {
    // Pure local standalone: single-device always wins
    return true;
  },
};
