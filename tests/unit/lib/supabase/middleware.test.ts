import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type SetAllFn = (
  cookies: { name: string; value: string; options?: object }[],
) => void;

const mockGetUser = vi.fn();
const mockSignOut = vi.fn();
let capturedSetAll: SetAllFn | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (_url: string, _key: string, opts: { cookies: { setAll: SetAllFn } }) => {
      capturedSetAll = opts.cookies.setAll;
      return {
        auth: {
          getUser: mockGetUser,
          signOut: mockSignOut,
        },
      };
    },
  ),
}));

import { updateSession } from "@/lib/supabase/middleware";

function requestAdminMetrics() {
  return updateSession(new NextRequest("http://localhost:3000/admin/metrics"));
}

describe("updateSession cookie propagation on redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps refreshed auth cookies when redirecting an unauthenticated request", async () => {
    // Simulates Supabase refreshing the token during getUser().
    mockGetUser.mockImplementation(async () => {
      capturedSetAll!([
        { name: "sb-x-auth-token", value: "REFRESHED", options: { path: "/" } },
      ]);
      return { data: { user: null }, error: null };
    });

    const res = await requestAdminMetrics();

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.cookies.get("sb-x-auth-token")?.value).toBe("REFRESHED");
  });

  it("keeps the cleared auth cookies when signOut() forces a redirect", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid claim: missing sub claim", status: 401 },
    });
    // Simulates signOut() clearing cookies via the same setAll channel.
    mockSignOut.mockImplementation(async () => {
      capturedSetAll!([
        {
          name: "sb-x-auth-token",
          value: "",
          options: { path: "/", maxAge: 0 },
        },
      ]);
    });

    const res = await requestAdminMetrics();

    expect(res.status).toBe(307);
    expect(res.cookies.get("sb-x-auth-token")?.value).toBe("");
  });
});

describe("updateSession in local single-user mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER = "true";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER;
  });

  it("redirects /login and /signup to root /", async () => {
    const loginReq = new NextRequest("http://localhost:3000/login");
    const loginRes = await updateSession(loginReq);
    expect(loginRes.status).toBe(307);
    expect(new URL(loginRes.headers.get("location")!).pathname).toBe("/");

    const signupReq = new NextRequest("http://localhost:3000/signup");
    const signupRes = await updateSession(signupReq);
    expect(signupRes.status).toBe(307);
    expect(new URL(signupRes.headers.get("location")!).pathname).toBe("/");
  });

  it("does not redirect unauthenticated app requests to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const appReq = new NextRequest("http://localhost:3000/workspaces");
    const appRes = await updateSession(appReq);
    expect(appRes.status).toBe(200);
    expect(appRes.headers.get("location")).toBeNull();
  });
});
