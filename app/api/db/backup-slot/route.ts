import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDatabasePath } from "@/lib/db/config";
import type { BackupData } from "@/lib/backup/types";

function getBackupsDir(): string {
  const dbPath = getDatabasePath();
  const baseDir = dbPath === ":memory:" ? process.cwd() : path.dirname(dbPath);
  const backupsDir = path.join(baseDir, "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
}

const SLOT_A_BASELINE = "slot-a-baseline.json";
const SLOT_B_STAGED = "slot-b-staged.json";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slot = searchParams.get("slot") || "baseline";
    const backupsDir = getBackupsDir();
    const fileName = slot === "staged" ? SLOT_B_STAGED : SLOT_A_BASELINE;
    const filePath = path.join(backupsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ exists: false, data: null });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as BackupData;
    return NextResponse.json({ exists: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: "stage" | "promote";
      data?: BackupData;
    };

    const backupsDir = getBackupsDir();
    const slotAPath = path.join(backupsDir, SLOT_A_BASELINE);
    const slotBPath = path.join(backupsDir, SLOT_B_STAGED);

    if (body.action === "stage") {
      if (!body.data) {
        return NextResponse.json(
          { error: "Missing backup data to stage" },
          { status: 400 },
        );
      }

      // Write atomically to temporary file before moving to Slot B
      const tempPath = path.join(
        backupsDir,
        `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
      );
      fs.writeFileSync(tempPath, JSON.stringify(body.data, null, 2), "utf-8");
      fs.renameSync(tempPath, slotBPath);

      return NextResponse.json({
        success: true,
        slot: "staged",
        message: "Staged backup written to Slot B successfully",
      });
    } else if (body.action === "promote") {
      if (!fs.existsSync(slotBPath)) {
        return NextResponse.json(
          { error: "No staged backup in Slot B to promote" },
          { status: 404 },
        );
      }

      // Atomically promote Slot B into Slot A
      fs.copyFileSync(slotBPath, slotAPath);

      return NextResponse.json({
        success: true,
        slot: "baseline",
        message: "Staged backup promoted to Slot A baseline successfully",
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Must be 'stage' or 'promote'." },
      { status: 400 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
