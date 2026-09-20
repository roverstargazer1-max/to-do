import { NextRequest, NextResponse } from "next/server";
import { focusRepository } from "@/lib/db/repositories/focus-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "local_user";
    const taskId = searchParams.get("taskId");
    const limit = Number(searchParams.get("limit")) || 50;

    if (taskId) {
      const logs = focusRepository.getByTaskId(taskId);
      return NextResponse.json(logs);
    }

    const logs = focusRepository.list(userId, limit);
    const totalSeconds = focusRepository.getTotalFocusSeconds(userId);
    return NextResponse.json({ logs, totalSeconds });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get focus logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (
      !body.start_time ||
      !body.end_time ||
      body.duration_seconds === undefined
    ) {
      return NextResponse.json(
        { error: "start_time, end_time, and duration_seconds are required" },
        { status: 400 },
      );
    }
    const log = focusRepository.logSession(body);
    return NextResponse.json(log, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to log focus session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
