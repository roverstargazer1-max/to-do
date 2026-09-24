import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictResolutionDialog } from "@/components/settings/ConflictResolutionDialog";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import type { BackupData } from "@/lib/backup/types";
import type { MergeResult } from "@/lib/sync/merge-engine";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }),
}));

vi.mock("@/lib/backup/local-backup", () => ({
  restoreLocalBackupData: vi.fn(async () => {}),
}));

vi.mock("@/lib/sync/github-sync", () => ({
  buildSyncConfig: vi.fn((input) => input),
  uploadDataToGitHub: vi.fn(async () => ({
    success: true,
    commitSha: "sha-resolved-123",
    meta: { updatedAt: "2026-09-24T10:00:00.000Z" },
  })),
}));

vi.mock("@/lib/sync/base-snapshot", () => ({
  saveBaseSnapshot: vi.fn(async () => {}),
  clearBaseSnapshot: vi.fn(async () => {}),
  getBaseSnapshot: vi.fn(async () => null),
}));

vi.mock("@/lib/notify", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createEmptyData(): BackupData {
  return {
    metadata: {
      version: 1,
      appVersion: "1.0.0",
      exportedAt: "2026-09-24T00:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };
}

describe("ConflictResolutionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitHubSyncStore.getState().clearConfig();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ConflictResolutionDialog isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render when pendingConflict is null", () => {
    const { container } = render(
      <ConflictResolutionDialog isOpen={true} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders conflict cards and resolves conflicts successfully", async () => {
    const mockMergeResult: MergeResult = {
      clean: false,
      mergedData: createEmptyData(),
      conflicts: [
        {
          id: "task-conflict-1",
          entityType: "task",
          title: "Math Homework",
          conflictType: "modify-modify",
          base: { id: "task-conflict-1", content: "Homework", priority: 3 },
          local: {
            id: "task-conflict-1",
            content: "Math Homework (Mac)",
            priority: 1,
          },
          remote: {
            id: "task-conflict-1",
            content: "Math Homework (Win)",
            priority: 4,
          },
          differingFields: ["content", "priority"],
        },
      ],
      stats: {
        added: 0,
        updated: 0,
        deleted: 0,
        conflicts: 1,
        deduped: 0,
        orphanedTasksReassigned: 0,
      },
    };

    useGitHubSyncStore.getState().setConfig({
      token: "ghp_test123",
      repo: "user/repo",
      deviceLabel: "MacBook",
    });

    useGitHubSyncStore.getState().setPendingConflict({
      deviceLabel: "Windows PC",
      mergeResult: mockMergeResult,
      localData: createEmptyData(),
      remoteData: createEmptyData(),
      remoteMeta: null,
    });

    const onClose = vi.fn();

    render(<ConflictResolutionDialog isOpen={true} onClose={onClose} />);

    // Should display dialog title and conflict title
    expect(screen.getByText("Math Homework")).toBeInTheDocument();
    expect(screen.getByText("content, priority")).toBeInTheDocument();

    // Verify batch buttons are present
    expect(
      screen.getByRole("button", { name: /全部采用本地|Use All Local/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /全部采用云端|Use All Remote/i }),
    ).toBeInTheDocument();

    // Verify action choices on the card
    const keepRemoteButtons = screen.getAllByRole("button", {
      name: /保留云端|Keep Remote/i,
    });
    fireEvent.click(keepRemoteButtons[0]);

    // Apply and Push
    const applyButton = screen.getByRole("button", {
      name: /完成合并并同步|Apply & Sync/i,
    });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(useGitHubSyncStore.getState().pendingConflict).toBeNull();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
