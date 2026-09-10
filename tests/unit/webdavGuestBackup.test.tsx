/**
 * WebDAV Back Up / Restore is available to Guests too (CONTEXT.md → "WebDAV
 * backup"), reusing the same in-memory credentials field a registered user
 * uses. A Guest's data source is `mockStore`, never Supabase — and since
 * ticket 09 the guest canvas (IndexedDB workspace store) rides the same
 * Backup ZIP: export carries it, restore overwrites it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { parseBackupZip } from "@/lib/backup/export-import";

const GUEST_TASK = { id: "task-1", content: "Task in the Guest store" };

const mockSupabase = {
  from: vi.fn(() => ({
    upsert: vi.fn(async () => ({ error: null })),
    delete: () => ({ in: vi.fn(async () => ({ error: null })) }),
  })),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, isGuestMode: true }),
}));

const mockStoreSpy = vi.hoisted(() => ({
  getTasks: vi.fn(() => [{ id: "task-1", content: "Task in the Guest store" }]),
  getProjects: vi.fn(() => []),
  getHabits: vi.fn(() => []),
  getHabitEntries: vi.fn(() => []),
  getFocusLogs: vi.fn(() => []),
  getEvents: vi.fn(() => []),
  restoreBackup: vi.fn(),
}));

vi.mock("@/lib/mock/mock-store", () => ({
  mockStore: mockStoreSpy,
}));

// The guest canvas lives in IndexedDB (ADR 0018); jsdom has none, so the
// store is mocked — the tests assert the backup/restore CONTRACT with the
// canvas: which rows the payload carries, and that restore is one fixed
// overwrite path (ticket 09).
const guestWorkspaceStoreSpy = vi.hoisted(() => ({
  listWorkspaces: vi.fn(async () => [
    {
      id: "ws-1",
      user_id: "guest",
      name: "Guest canvas",
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    },
  ]),
  listAllNodes: vi.fn(async () => [
    {
      id: "node-1",
      workspace_id: "ws-1",
      user_id: "guest",
      kind: "task",
      entity_type: "task",
      entity_id: "task-1",
      position_x: 12,
      position_y: 34,
      width: null,
      height: null,
      display_config: null,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    },
  ]),
  restoreBackup: vi.fn(async () => {}),
}));

vi.mock("@/lib/workspace/guest-store", () => ({
  guestWorkspaceStore: guestWorkspaceStoreSpy,
}));

const uploadWebDavBackup = vi.fn(
  async (_credentials: unknown, _blob: Blob) => ({ success: true }),
);
const downloadWebDavBackup = vi.fn(async (_credentials: unknown) => ({
  success: true,
  data: {
    metadata: {
      version: 1,
      appVersion: "1.0.0",
      exportedAt: "2026-08-25T00:00:00.000Z",
    },
    tasks: [{ id: "remote-task", content: "Task from the WebDAV server" }],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [],
    workspaces: [
      {
        id: "remote-ws",
        user_id: "guest",
        name: "Remote canvas",
        created_at: "2026-08-25T00:00:00.000Z",
        updated_at: "2026-08-25T00:00:00.000Z",
      },
    ],
    workspace_nodes: [
      {
        id: "remote-node",
        workspace_id: "remote-ws",
        user_id: "guest",
        kind: "task",
        entity_type: "task",
        entity_id: "remote-task",
        position_x: 56,
        position_y: 78,
        width: null,
        height: null,
        display_config: null,
        created_at: "2026-08-25T00:00:00.000Z",
        updated_at: "2026-08-25T00:00:00.000Z",
      },
    ],
  },
}));

vi.mock("@/lib/backup/webdav-sync", () => ({
  testWebDavConnection: vi.fn(async () => ({ success: true })),
  uploadWebDavBackup: (credentials: unknown, blob: Blob) =>
    uploadWebDavBackup(credentials, blob),
  downloadWebDavBackup: (credentials: unknown) =>
    downloadWebDavBackup(credentials),
}));

vi.mock("@/lib/notify", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    promise: vi.fn((p) => p),
  },
}));

vi.mock("@/lib/hooks/useHaptic", () => ({
  useHaptic: () => ({
    trigger: vi.fn(),
    isPhone: false,
    hapticsEnabled: false,
  }),
}));

vi.mock("@/components/settings/ImportDialog", () => ({
  ImportDialog: () => null,
}));

import { BackupSyncSettings } from "@/components/settings/BackupSyncSettings";

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<BackupSyncSettings />, { wrapper });
}

function openWebDav() {
  const tab = screen.getByRole("tab", { name: /webdav/i });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  fireEvent.change(screen.getByLabelText(/server url/i), {
    target: { value: "https://cloud.example.com/remote.php/dav/files/me" },
  });
}

describe("WebDAV backup for Guests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("shows the WebDAV tab and backs up the Guest store, not Supabase", async () => {
    renderSettings();
    openWebDav();

    fireEvent.click(screen.getByRole("button", { name: /back up/i }));

    await waitFor(() => expect(uploadWebDavBackup).toHaveBeenCalled());

    const payload = await parseBackupZip(uploadWebDavBackup.mock.calls[0][1]);
    expect(payload.tasks).toEqual([GUEST_TASK]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("backs up the guest canvas with it: workspaces and nodes, row ids preserved (ticket 09)", async () => {
    renderSettings();
    openWebDav();

    fireEvent.click(screen.getByRole("button", { name: /back up/i }));

    await waitFor(() => expect(uploadWebDavBackup).toHaveBeenCalled());

    const payload = await parseBackupZip(uploadWebDavBackup.mock.calls[0][1]);
    expect(guestWorkspaceStoreSpy.listWorkspaces).toHaveBeenCalled();
    expect(guestWorkspaceStoreSpy.listAllNodes).toHaveBeenCalled();
    // The same Backup ZIP is the WebDAV artifact — canvas sections ride along,
    // row ids and placement verbatim.
    expect(payload.workspaces).toEqual([
      expect.objectContaining({ id: "ws-1", name: "Guest canvas" }),
    ]);
    expect(payload.workspace_nodes).toEqual([
      expect.objectContaining({
        id: "node-1",
        workspace_id: "ws-1",
        entity_id: "task-1",
        position_x: 12,
        position_y: 34,
      }),
    ]);
  });

  it("restores into the Guest store, not Supabase, once confirmed", async () => {
    renderSettings();
    openWebDav();

    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    fireEvent.click(await screen.findByRole("button", { name: /replace/i }));

    await waitFor(() => expect(mockStoreSpy.restoreBackup).toHaveBeenCalled());

    expect(mockStoreSpy.restoreBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [{ id: "remote-task", content: "Task from the WebDAV server" }],
      }),
    );
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("restores the canvas with the data: one fixed overwrite path, row ids preserved (ticket 09)", async () => {
    renderSettings();
    openWebDav();

    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    fireEvent.click(await screen.findByRole("button", { name: /replace/i }));

    await waitFor(() =>
      expect(guestWorkspaceStoreSpy.restoreBackup).toHaveBeenCalled(),
    );

    // The payload's workspace rows arrive verbatim — overwrite, no merge.
    expect(guestWorkspaceStoreSpy.restoreBackup).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "remote-ws", name: "Remote canvas" })],
      [
        expect.objectContaining({
          id: "remote-node",
          workspace_id: "remote-ws",
          entity_id: "remote-task",
          position_x: 56,
          position_y: 78,
        }),
      ],
    );
  });
});
