import type { BackupData } from "./types";

export async function stageBackup(data: BackupData): Promise<boolean> {
  try {
    const res = await fetch("/api/db/backup-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "stage",
        data,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function promoteBackup(): Promise<boolean> {
  try {
    const res = await fetch("/api/db/backup-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "promote",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSlotBackup(
  slot: "baseline" | "staged" = "baseline",
): Promise<BackupData | null> {
  try {
    const res = await fetch(`/api/db/backup-slot?slot=${slot}`);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      exists: boolean;
      data: BackupData | null;
    };
    return body.data;
  } catch {
    return null;
  }
}
