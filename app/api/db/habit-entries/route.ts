import { NextRequest, NextResponse } from "next/server";
import { habitRepository } from "@/lib/db/repositories/habit-repository";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { habitId, date, value } = body;
    if (!habitId || !date) {
      return NextResponse.json(
        { error: "habitId and date are required" },
        { status: 400 },
      );
    }
    const entry = habitRepository.recordEntry(habitId, date, value ?? 1);
    const streak = habitRepository.calculateStreak(habitId);
    return NextResponse.json({ entry, streak }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to record habit entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get("habitId");
    const date = searchParams.get("date");
    if (!habitId || !date) {
      return NextResponse.json(
        { error: "habitId and date query parameters are required" },
        { status: 400 },
      );
    }
    const success = habitRepository.deleteEntry(habitId, date);
    const streak = habitRepository.calculateStreak(habitId);
    return NextResponse.json({ success, streak });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete habit entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
