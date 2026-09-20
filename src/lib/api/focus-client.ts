import type { FocusLog } from "@/lib/types/focus";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const focusClient = {
  async logSession(input: {
    task_id?: string | null;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    session_type?: string;
    notes?: string | null;
  }): Promise<FocusLog> {
    const dal = getLocalDal();
    if (dal) return dal.focus.logSession(input);
    const res = await fetch(`${getBaseUrl()}/api/db/focus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok)
      throw new Error(`Failed to log focus session: ${res.statusText}`);
    return res.json();
  },

  async createLog(input: {
    task_id?: string | null;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    session_type?: string;
    notes?: string | null;
  }): Promise<FocusLog> {
    return this.logSession(input);
  },

  async list(
    userId = "local_user",
    limit = 50,
  ): Promise<{ logs: FocusLog[]; totalSeconds: number }> {
    const dal = getLocalDal();
    if (dal) {
      return {
        logs: dal.focus.list(userId, limit),
        totalSeconds: dal.focus.getTotalFocusSeconds(userId),
      };
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/focus?userId=${encodeURIComponent(userId)}&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`Failed to get focus logs: ${res.statusText}`);
    return res.json();
  },
};
