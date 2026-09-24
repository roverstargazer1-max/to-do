import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateBackupBranchDialog } from "@/components/settings/CreateBackupBranchDialog";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import * as localBackup from "@/lib/backup/local-backup";
import * as githubSync from "@/lib/sync/github-sync";
import { notify } from "@/lib/notify";

vi.mock("@/lib/backup/local-backup", () => ({
  collectLocalBackupData: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/hooks/useHaptic", () => ({
  useHaptic: () => ({ trigger: vi.fn() }),
}));

vi.mock("@/lib/i18n/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CreateBackupBranchDialog", () => {
  const sampleBackupData = {
    metadata: {
      version: 1,
      appVersion: "1.5.0",
      exportedAt: "2026-09-24T11:00:00.000Z",
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useGitHubSyncStore.setState({
      token: "ghp_mock_token_12345",
      repo: "myuser/myrepo",
      branch: "main",
      hasUnsyncedChanges: true, // Should remain unchanged after backup!
    });
    vi.mocked(localBackup.collectLocalBackupData).mockResolvedValue(
      sampleBackupData,
    );
  });

  it("renders dialog elements when open", () => {
    render(<CreateBackupBranchDialog isOpen={true} onClose={vi.fn()} />);

    expect(
      screen.getByText("settings.backup.github.backupDialogTitle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings.backup.github.backupDialogDesc"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings.backup.github.backupRemarkLabel"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings.backup.github.backupBranchPreview"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings.backup.github.backupCommitPreview"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.backup.github.backupCancel",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.backup.github.backupConfirm",
      }),
    ).toBeInTheDocument();
  });

  it("dynamically updates branch and commit message previews when user enters remark", () => {
    render(<CreateBackupBranchDialog isOpen={true} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(
      "settings.backup.github.backupRemarkPlaceholder",
    );

    // Initial previews (no remark)
    const commitPreview = screen.getByText(
      /^backup: \d{4}-\d{2}-\d{2} \d{2}h$/,
    );
    expect(commitPreview).toBeInTheDocument();

    // Type remark
    fireEvent.change(input, { target: { value: "Clean DB before v2" } });

    // Commit preview becomes the full remark
    expect(screen.getByText("backup: Clean DB before v2")).toBeInTheDocument();

    // Branch preview contains the slug
    const branchCode = screen.getByText(
      /backup\/\d{4}-\d{2}-\d{2}-\d{2}-clean-db-before/,
    );
    expect(branchCode).toBeInTheDocument();
  });

  it("calls collectLocalBackupData and createBackupBranchSnapshot on confirm, preserving store branch and dirty state", async () => {
    const createSnapshotSpy = vi
      .spyOn(githubSync, "createBackupBranchSnapshot")
      .mockResolvedValueOnce({
        success: true,
        branchName: "backup/2026-09-24-11-clean-db",
        commitSha: "sha-abc-123",
        viewUrl:
          "https://github.com/myuser/myrepo/tree/backup/2026-09-24-11-clean-db",
      });

    const onClose = vi.fn();
    render(<CreateBackupBranchDialog isOpen={true} onClose={onClose} />);

    const input = screen.getByPlaceholderText(
      "settings.backup.github.backupRemarkPlaceholder",
    );
    fireEvent.change(input, { target: { value: "clean-db" } });

    const confirmBtn = screen.getByRole("button", {
      name: "settings.backup.github.backupConfirm",
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(localBackup.collectLocalBackupData).toHaveBeenCalledTimes(1);
      expect(createSnapshotSpy).toHaveBeenCalledTimes(1);
    });

    expect(createSnapshotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "ghp_mock_token_12345",
        repo: "myuser/myrepo",
        branch: "main",
      }),
      expect.objectContaining({
        remark: "clean-db",
        data: sampleBackupData,
      }),
    );

    // Toast triggered with view branch action
    expect(notify.success).toHaveBeenCalledWith(
      "settings.backup.github.backupSuccess",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "settings.backup.github.viewBranch",
        }),
      }),
    );

    // Dialog closed
    expect(onClose).toHaveBeenCalled();

    // CRITICAL: working branch and unsynced changes in store remain unaffected
    const state = useGitHubSyncStore.getState();
    expect(state.branch).toBe("main");
    expect(state.hasUnsyncedChanges).toBe(true);
  });

  it("handles failure by displaying error toast and leaving dialog open", async () => {
    vi.spyOn(githubSync, "createBackupBranchSnapshot").mockResolvedValueOnce({
      success: false,
      error: "settings.github.error.baseBranchNotFound",
    });

    const onClose = vi.fn();
    render(<CreateBackupBranchDialog isOpen={true} onClose={onClose} />);

    const confirmBtn = screen.getByRole("button", {
      name: "settings.backup.github.backupConfirm",
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith(
        "settings.github.error.baseBranchNotFound",
      );
    });

    // Dialog should not close on error so user can inspect or retry
    expect(onClose).not.toHaveBeenCalled();
  });
});
