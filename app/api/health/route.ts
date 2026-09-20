import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/index";

export async function GET() {
  try {
    const db = getDatabase();
    db.prepare("SELECT 1").get();
    return NextResponse.json({
      status: "healthy",
      database: "connected",
      storage: "sqlite",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { status: "error", database: "unreachable", error: String(err) },
      { status: 503 },
    );
  }
}
