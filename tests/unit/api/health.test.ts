import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/index", () => {
  let mockShouldFail = false;
  return {
    getDatabase: () => {
      if (mockShouldFail) throw new Error("database disk image is malformed");
      return {
        prepare: () => ({
          get: () => ({ 1: 1 }),
        }),
      };
    },
    __setMockShouldFail: (fail: boolean) => {
      mockShouldFail = fail;
    },
  };
});

import { GET } from "@/../app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 healthy when SQLite database is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "healthy",
      database: "connected",
      storage: "sqlite",
    });
  });

  it("returns 503 when the database query fails", async () => {
     
    const dbIndex = (await import("@/lib/db/index")) as any;
    dbIndex.__setMockShouldFail(true);

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.database).toBe("unreachable");

    dbIndex.__setMockShouldFail(false);
  });
});
