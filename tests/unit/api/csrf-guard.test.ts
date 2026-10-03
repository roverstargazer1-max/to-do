import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { validateCsrfOrigin } from "@/lib/api/csrf-guard";

describe("CSRF Guard & Same-Origin Validator", () => {
  it("allows same-origin requests with matching host", () => {
    const request = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    const result = validateCsrfOrigin(request);
    expect(result.ok).toBe(true);
  });

  it("blocks cross-site requests signaled by Sec-Fetch-Site", () => {
    const request = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    });
    const result = validateCsrfOrigin(request);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Cross-site requests are not allowed");
  });

  it("blocks cross-origin requests with mismatched Origin header", () => {
    const request = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        origin: "https://evil-attacker.com",
      },
    });
    const result = validateCsrfOrigin(request);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Cross-origin requests are not allowed");
  });

  it("allows requests where Origin is omitted but Sec-Fetch-Site is same-origin or none", () => {
    const request = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        "sec-fetch-site": "none",
      },
    });
    const result = validateCsrfOrigin(request);
    expect(result.ok).toBe(true);
  });

  it("enforces required custom action header when specified", () => {
    const request = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-kagelin-action": "wipe",
      },
    });
    const result = validateCsrfOrigin(request, "wipe");
    expect(result.ok).toBe(true);

    const badRequest = new NextRequest("http://localhost:3000/api/db/wipe", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    const badResult = validateCsrfOrigin(badRequest, "wipe");
    expect(badResult.ok).toBe(false);
    expect(badResult.status).toBe(400);
  });
});
