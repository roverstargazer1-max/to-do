import { NextRequest, NextResponse } from "next/server";
import { taskRepository } from "@/lib/db/repositories/task-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "local_user";
    const projectId = searchParams.get("projectId");
    const showCompleted = searchParams.get("showCompleted") === "true";
    const filter = searchParams.get("filter") || undefined;

    const tasks = taskRepository.list({
      userId,
      projectId: projectId || undefined,
      showCompleted,
      filter,
    });
    return NextResponse.json(tasks);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.content) {
      return NextResponse.json(
        { error: "Task content is required" },
        { status: 400 },
      );
    }
    const task = taskRepository.create(body);
    return NextResponse.json(task, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "reorder") {
      if (!Array.isArray(body.taskIds)) {
        return NextResponse.json(
          { error: "taskIds array is required for reorder" },
          { status: 400 },
        );
      }
      taskRepository.reorder(body.taskIds);
      return NextResponse.json({ success: true });
    }

    const { id, action, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 },
      );
    }

    if (action === "toggleComplete") {
      const task = taskRepository.toggleComplete(id);
      if (!task)
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      return NextResponse.json(task);
    }

    const task = taskRepository.update(id, updates);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 },
      );
    }
    const success = taskRepository.delete(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
