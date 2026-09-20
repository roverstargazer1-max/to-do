import { NextRequest, NextResponse } from "next/server";
import { calendarRepository } from "@/lib/db/repositories/calendar-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "local_user";
    const start = searchParams.get("start") || undefined;
    const end = searchParams.get("end") || undefined;

    const events = calendarRepository.list({ userId, start, end });
    return NextResponse.json(events);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list calendar events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: "title, start_time, and end_time are required" },
        { status: 400 },
      );
    }
    const event = calendarRepository.create(body);
    return NextResponse.json(event, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create calendar event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 },
      );
    }
    const event = calendarRepository.update(id, updates);
    if (!event) {
      return NextResponse.json(
        { error: "Calendar event not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(event);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update calendar event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 },
      );
    }
    const success = calendarRepository.delete(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete calendar event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
