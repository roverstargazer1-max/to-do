import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";
import type { Workspace } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
}));

const publishDomainEvent = vi.fn();
vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (...args: unknown[]) => publishDomainEvent(...args),
}));

import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceCommands } from "@/lib/commands/workspace";

const makeWorkspace = (id: string): Workspace => ({
  id,
  user_id: "user-1",
  name: `Workspace ${id}`,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
});

describe("workspaceCommands", () => {
  let queryClient: QueryClientType;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    publishDomainEvent.mockClear();
    vi.mocked(workspaceMutations.create).mockReset();
    vi.mocked(workspaceMutations.rename).mockReset();
    vi.mocked(workspaceMutations.delete).mockReset();
  });

  describe("create", () => {
    it("runs the service, invalidates the list, and publishes workspace.created", async () => {
      const workspace = makeWorkspace("ws-1");
      vi.mocked(workspaceMutations.create).mockResolvedValue(workspace);

      const result = await workspaceCommands.create(
        { queryClient, isGuestMode: false },
        { name: "Sprint 14", color: "#3B82F6" },
      );

      expect(result).toEqual(workspace);
      expect(workspaceMutations.create).toHaveBeenCalledWith({
        id: expect.any(String),
        name: "Sprint 14",
        color: "#3B82F6",
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "workspace.created",
        workspaceId: "ws-1",
      });
      // The invalidation is promise-based inside the command; let it land.
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.list(false),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });

    it("publishes nothing when the service fails", async () => {
      vi.mocked(workspaceMutations.create).mockRejectedValue(new Error("boom"));

      await expect(
        workspaceCommands.create(
          { queryClient, isGuestMode: true },
          { name: "x" },
        ),
      ).rejects.toThrow("boom");

      expect(publishDomainEvent).not.toHaveBeenCalled();
    });
  });

  describe("rename", () => {
    it("publishes workspace.renamed and invalidates the list", async () => {
      const workspace = {
        ...makeWorkspace("ws-1"),
        name: "Renamed",
        color: "#10B981",
      };
      vi.mocked(workspaceMutations.rename).mockResolvedValue(workspace);

      await workspaceCommands.rename(
        { queryClient, isGuestMode: false },
        "ws-1",
        "Renamed",
        "#10B981",
      );

      expect(workspaceMutations.rename).toHaveBeenCalledWith(
        "ws-1",
        "Renamed",
        "#10B981",
      );
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "workspace.renamed",
        workspaceId: "ws-1",
      });
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.list(false),
        });
      });
    });
  });

  describe("delete", () => {
    it("publishes workspace.deleted and invalidates the nodes family with the workspace prefix", async () => {
      vi.mocked(workspaceMutations.delete).mockResolvedValue(undefined);

      await workspaceCommands.delete(
        { queryClient, isGuestMode: false },
        "ws-1",
      );

      expect(workspaceMutations.delete).toHaveBeenCalledWith("ws-1");
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "workspace.deleted",
        workspaceId: "ws-1",
      });
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.of("ws-1"),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });

    it("publishes nothing when the delete fails", async () => {
      vi.mocked(workspaceMutations.delete).mockRejectedValue(new Error("boom"));

      await expect(
        workspaceCommands.delete({ queryClient, isGuestMode: false }, "ws-1"),
      ).rejects.toThrow("boom");

      expect(publishDomainEvent).not.toHaveBeenCalled();
    });
  });
});
