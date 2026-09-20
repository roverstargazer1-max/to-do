import { NextRequest, NextResponse } from "next/server";
import { habitRepository } from "@/lib/db/repositories/habit-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "local_user";
    const habits = habitRepository.list(userId);
    return NextResponse.json(habits);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list habits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json(
        { error: "Habit name is required" },
        { status: 400 },
      );
    }
    const habit = habitRepository.create(body);
    return NextResponse.json(habit, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create habit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Habit ID is required" },
        { status: 400 },
      );
    }
    const habit = habitRepository.update(id, updates);
    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    return NextResponse.json(habit);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update habit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Habit ID is required" },
        { status: 400 },
      );
    }
    const success = habitRepository.delete(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete habit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
