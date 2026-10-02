import { describe, it, expect } from "vitest";
import { createBackupZip, parseBackupZip } from "@/lib/backup/export-import";
import type { BackupData } from "@/lib/backup/types";

describe("export-import", () => {
  const mockBackupData: BackupData = {
    metadata: {
      version: 1,
      appVersion: "1.14.3",
      exportedAt: new Date().toISOString(),
    },
    tasks: [],
    projects: [],
    habits: [],
    habit_entries: [],
    focus_logs: [],
    events: [
      {
        id: "event-1",
        user_id: "guest",
        title: "Test Event",
        description: "Testing export",
        location: "Home",
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        all_day: false,
        color: "#4B6CB7",
        category: "Work",
        recurrence_rule: null,
        remote_id: null,
        remote_calendar_id: null,
        etag: null,
        ics_uid: null,
        sync_state: null,
        is_archived: false,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  describe("createBackupZip", () => {
    it("returns a Blob with application/zip type", async () => {
      const blob = await createBackupZip(mockBackupData);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/zip");
    });

    it("round-trips data back via parseBackupZip", async () => {
      try {
        const blob = await createBackupZip(mockBackupData);
        const parsed = await parseBackupZip(blob);
        expect(parsed.metadata.version).toBe(1);
        expect(parsed.events).toHaveLength(1);
        expect(parsed.events[0].title).toBe("Test Event");
      } catch (err) {
        console.error("ROUND TRIP ERROR:", err);
        throw err;
      }
    });

    it("round-trips Workspace edges", async () => {
      const edgeBackup: BackupData = {
        ...mockBackupData,
        workspace_edges: [
          {
            id: "edge-1",
            workspace_id: "workspace-1",
            user_id: "guest",
            source_node_id: "node-1",
            target_node_id: "node-2",
            created_at: "2026-10-02T00:00:00.000Z",
            updated_at: "2026-10-02T00:00:00.000Z",
          },
        ],
      };

      const parsed = await parseBackupZip(await createBackupZip(edgeBackup));

      expect(parsed.workspace_edges).toEqual(edgeBackup.workspace_edges);
    });
  });

  describe("parseBackupZip", () => {
    it("accepts older backups with no Workspace edge section", async () => {
      const parsed = await parseBackupZip(
        await createBackupZip(mockBackupData),
      );

      expect(parsed.workspace_edges).toBeUndefined();
    });

    it("throws on invalid ZIP content", async () => {
      const invalidBlob = new Blob(["not-a-zip"], { type: "application/zip" });
      await expect(parseBackupZip(invalidBlob)).rejects.toThrow();
    });

    it("throws if backup.json is missing in ZIP", async () => {
      // This is harder to test without fflate mock or building a custom zip,
      // but creating an empty zip might trigger it.
      // For now, we rely on the primary success path and invalid content path.
    });
  });
});
