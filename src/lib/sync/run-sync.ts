import { tr } from "@/lib/i18n/tr";
import "./register-adapters";

export interface RunSyncSummary {
  configured: number;
  created: number;
  updated: number;
  archived: number;
  pushed: number;
  errors: string[];
}

export function formatSyncSummary(s: RunSyncSummary): string {
  const parts: string[] = [];
  if (s.created) parts.push(tr("calendar.sync.added", { count: s.created }));
  if (s.updated) parts.push(tr("calendar.sync.updated", { count: s.updated }));
  if (s.archived)
    parts.push(tr("calendar.sync.removed", { count: s.archived }));
  if (s.pushed) parts.push(tr("calendar.sync.pushed", { count: s.pushed }));
  return parts.length
    ? tr("calendar.sync.summary", { parts: parts.join(", ") })
    : tr("calendar.sync.upToDate");
}

export async function runCalendarSync(): Promise<RunSyncSummary> {
  return {
    configured: 0,
    created: 0,
    updated: 0,
    archived: 0,
    pushed: 0,
    errors: [],
  };
}

export async function runCalendarPush(): Promise<RunSyncSummary> {
  return {
    configured: 0,
    created: 0,
    updated: 0,
    archived: 0,
    pushed: 0,
    errors: [],
  };
}
