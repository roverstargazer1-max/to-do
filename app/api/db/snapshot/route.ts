import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getDatabase } from "@/lib/db/index";

export async function GET(_request: NextRequest) {
  let tempSnapshotPath: string | null = null;
  try {
    const db = getDatabase();
    tempSnapshotPath = path.join(
      os.tmpdir(),
      `kagelin-snapshot-${Date.now()}.db`,
    );

    // Zero-downtime point-in-time snapshot using SQLite VACUUM INTO
    db.prepare("VACUUM INTO ?").run(tempSnapshotPath);

    const buffer = fs.readFileSync(tempSnapshotPath);
    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="kagelin-backup-${dateStr}.db"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create database snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempSnapshotPath && fs.existsSync(tempSnapshotPath)) {
      try {
        fs.unlinkSync(tempSnapshotPath);
      } catch {}
    }
  }
}
