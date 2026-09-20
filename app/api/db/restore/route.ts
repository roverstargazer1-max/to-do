import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import { getDatabase, closeDatabase } from "@/lib/db/index";
import { getDatabasePath } from "@/lib/db/config";

export async function POST(request: NextRequest) {
  try {
    let buffer: Buffer | null = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (file && typeof file.arrayBuffer === "function") {
          buffer = Buffer.from(await file.arrayBuffer());
        }
      } catch {}
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.base64) {
        buffer = Buffer.from(body.base64, "base64");
      }
    }

    if (!buffer || buffer.length === 0) {
      try {
        const raw = await request.arrayBuffer();
        if (raw.byteLength > 0) {
          buffer = Buffer.from(raw);
        }
      } catch {}
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { error: "No valid database file provided" },
        { status: 400 },
      );
    }

    // Validate SQLite magic header (first 16 bytes: "SQLite format 3\0")
    const header = buffer.subarray(0, 16).toString("utf-8");
    if (!header.startsWith("SQLite format 3")) {
      return NextResponse.json(
        { error: "Invalid file format: not a valid SQLite database" },
        { status: 400 },
      );
    }

    const targetDbPath = getDatabasePath();

    // Safely close connection before replacing files
    closeDatabase();

    // Remove existing wal and shm files
    const walPath = `${targetDbPath}-wal`;
    const shmPath = `${targetDbPath}-shm`;
    if (fs.existsSync(walPath)) {
      try {
        fs.unlinkSync(walPath);
      } catch {}
    }
    if (fs.existsSync(shmPath)) {
      try {
        fs.unlinkSync(shmPath);
      } catch {}
    }

    // Replace the database file
    fs.writeFileSync(targetDbPath, buffer);

    // Reopen and run migrations if newer
    getDatabase(targetDbPath);

    return NextResponse.json({
      success: true,
      message: "Database restored successfully",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to restore database";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
