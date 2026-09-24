import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubSyncCard } from "@/components/settings/GitHubSyncCard";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";

/** Live object handed back by the mocked useSmartSync hook. Mutate before
 * render to stage a DLP-hold; assert on the action fns to verify wiring. */
const smartSync = vi.hoisted(() => ({
  isOperating: false,
  operationType: null as "sync" | "push" | null,
  dlp: null as {
    reason: "local-empty" | "cliff-drop" | "remote-unreadable";
    counts: { local: number; remote: number };
  } | null,
  run: vi.fn(),
  runPush: vi.fn(),
  confirmDlp: vi.fn(),
  cancelDlp: vi.fn(),
}));

vi.mock("@/lib/hooks/useSmartSync", () => ({
  useSmartSync: () => smartSync,
}));

vi.mock("@/lib/hooks/useHaptic", () => ({
  useHaptic: () => ({ trigger: vi.fn() }),
}));

// Force desktop so the shared confirmation dialog renders the Radix
// AlertDialog instead of the vaul Drawer (drawers are risky under jsdom).
vi.mock("@/lib/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/i18n/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/i18n/useDateFormatter", () => ({
  useDateFormatter: () => ({
    formatMonthDayYear: () => "2026-09-22",
    formatClock: () => "09:00",
  }),
}));

describe("GitHubSyncCard", () => {
  beforeEach(() => {
    localStorage.clear();
    useGitHubSyncStore.setState({
      token: "ghp_testtoken",
      repo: "testuser/my-repo",
      branch: "main",
      deviceLabel: "MacBook Test",
    });
    smartSync.isOperating = false;
    smartSync.operationType = null;
    smartSync.dlp = null;
    smartSync.run.mockReset();
    smartSync.runPush.mockReset();
    smartSync.confirmDlp.mockReset();
    smartSync.cancelDlp.mockReset();
  });

  it("wires the Sync Now and Push buttons to the smart-sync hook actions", () => {
    render(<GitHubSyncCard />);

    fireEvent.click(
      screen.getByRole("button", { name: "settings.backup.github.syncNow" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings.backup.github.push" }),
    );

    expect(smartSync.run).toHaveBeenCalledTimes(1);
    expect(smartSync.runPush).toHaveBeenCalledTimes(1);
  });

  it("shows the DLP confirmation dialog when the hook holds a push", () => {
    smartSync.dlp = {
      reason: "local-empty",
      counts: { local: 0, remote: 3 },
    };
    render(<GitHubSyncCard />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("settings.github.dlp.title")).toBeInTheDocument();
  });

  it("runs the held push when the DLP dialog's confirm is clicked", () => {
    smartSync.dlp = {
      reason: "local-empty",
      counts: { local: 0, remote: 3 },
    };
    render(<GitHubSyncCard />);

    fireEvent.click(
      screen.getByRole("button", { name: "settings.github.dlp.confirm" }),
    );

    expect(smartSync.confirmDlp).toHaveBeenCalled();
  });

  it("cancels the held push without confirming when the DLP dialog is dismissed", () => {
    smartSync.dlp = {
      reason: "cliff-drop",
      counts: { local: 1, remote: 10 },
    };
    render(<GitHubSyncCard />);

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(smartSync.cancelDlp).toHaveBeenCalled();
    expect(smartSync.confirmDlp).not.toHaveBeenCalled();
  });

  it("renders no alert dialog when the hook has no held push", () => {
    render(<GitHubSyncCard />);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens the create backup branch dialog when the backup branch button is clicked", () => {
    render(<GitHubSyncCard />);

    const backupBtn = screen.getByRole("button", {
      name: "settings.backup.github.backupBranch",
    });
    expect(backupBtn).toBeInTheDocument();

    fireEvent.click(backupBtn);

    expect(
      screen.getByText("settings.backup.github.backupDialogTitle"),
    ).toBeInTheDocument();
  });
});
