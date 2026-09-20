import { NextRequest, NextResponse } from "next/server";
import { projectRepository } from "@/lib/db/repositories/project-repository";
import { taskRepository } from "@/lib/db/repositories/task-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "local_user";
    const projects = projectRepository.list(userId);
    return NextResponse.json(projects);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    }
    const project = projectRepository.create(body);
    return NextResponse.json(project, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, ...updates } = body;
    if (!id) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 },
      );
    }

    if (action === "archive") {
      const project = projectRepository.update(id, { is_archived: true });
      return NextResponse.json(project);
    }

    if (action === "unarchive") {
      const project = projectRepository.update(id, { is_archived: false });
      return NextResponse.json(project);
    }

    if (action === "moveTasksToInbox") {
      taskRepository.moveProjectTasksToInbox(id);
      return NextResponse.json({ success: true });
    }

    if (action === "deleteTasks") {
      taskRepository.deleteProjectTasks(id);
      return NextResponse.json({ success: true });
    }

    const project = projectRepository.update(id, updates);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 },
      );
    }
    const success = projectRepository.delete(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
