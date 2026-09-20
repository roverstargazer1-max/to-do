import { describe, it, expect, vi, beforeEach } from "vitest";
import { persistImportSource } from "@/lib/mutations/importSource";

// In-memory IndexedDB stand-in for local storage.
const idbStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
}));

const payload = {
  source_app: "uhabits",
  file_name: "Loop Backup.db",
  raw: { habits: [{ id: 1 }], repetitions: [{ habit: 1, value: 2 }] },
};

beforeEach(() => {
  idbStore.clear();
});

describe("persistImportSource", () => {
  it("appends the raw source to the local storage list", async () => {
    await persistImportSource(payload);
    await persistImportSource({ ...payload, file_name: "Second.db" });

    const stored = idbStore.get("kanso_import_sources") as Array<{
      file_name: string;
      raw: unknown;
      captured_at: string;
    }>;
    expect(stored).toHaveLength(2);
    expect(stored[0].file_name).toBe("Loop Backup.db");
    expect(stored[1].file_name).toBe("Second.db");
    expect(stored[0].raw).toEqual(payload.raw);
    expect(stored[0].captured_at).toBeDefined();
  });
});
