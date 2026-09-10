import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useClearGuestData,
  useResetDemoData,
} from "@/lib/hooks/useGuestStoreActions";
import { useDemoMode } from "@/lib/hooks/useDemoMode";
import { AuthProvider } from "@/components/AuthProvider";
import { mockStore } from "@/lib/mock/mock-store";
import React from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Stable singleton: a fresh client object per render would make
// `supabase.auth` unstable, re-running AuthProvider's session effect on
// every render — `await act` then never reaches a quiet React queue.
const mockAuth = {
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
};
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({ auth: mockAuth })),
}));

vi.mock("@/lib/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

// Guest workspaces live in IndexedDB (ADR 0018); jsdom has none, so the
// store's persistence layer is mocked to a plain map — the tests observe
// which key the actions drop. Hoisted: the mock factory must be able to
// reference the backing map.
const { idbBacking } = vi.hoisted(() => ({
  idbBacking: new Map<string, unknown>(),
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbBacking.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbBacking.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbBacking.delete(key);
  }),
}));

import { guestWorkspaceStore } from "@/lib/workspace/guest-store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

describe("useClearGuestData", () => {
  beforeEach(async () => {
    queryClient.clear();
    localStorage.clear();
    localStorage.setItem("kanso_guest_mode", "true");
    mockStore.reset();
    idbBacking.clear();
    // Drop the store's in-memory snapshot so each test starts cold.
    await guestWorkspaceStore.clear();
  });

  it("wipes the guest store and takes Demo mode with it", async () => {
    const { result: demoMode, rerender } = renderHook(() => useDemoMode(), {
      wrapper,
    });
    await waitFor(() => expect(demoMode.current).toBe(true));

    const { result: clearGuestData } = renderHook(() => useClearGuestData(), {
      wrapper,
    });

    await act(async () => {
      await clearGuestData.current();
    });

    expect(mockStore.getTasks()).toEqual([]);

    // removeQueries drops the cache entry; a subscribed observer only picks
    // a fresh query up on its next render (in the real app: navigation, auth
    // settle — any re-render). Trigger that render so the assertion reads
    // the post-clear store, not a microtask race.
    await act(async () => {
      rerender();
    });
    await waitFor(() => expect(demoMode.current).toBe(false));
  });

  it("clears guest workspaces with everything else — Start fresh is actually fresh (ticket 09)", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "Plan" });

    const { result: clearGuestData } = renderHook(() => useClearGuestData(), {
      wrapper,
    });

    await act(async () => {
      await clearGuestData.current();
    });

    // A partial clear would leave nodes referencing nothing; the canvas goes
    // with the rest of the store.
    expect(idbBacking.has("kanso-guest-workspaces")).toBe(false);
    expect(await guestWorkspaceStore.listWorkspaces()).toEqual([]);
    expect(await guestWorkspaceStore.listAllNodes()).toEqual([]);
  });
});

// Reset Demo repopulates seed data, so Demo mode goes from off back to on —
// the bar showing "Start fresh" again must reflect that, not a stale cache.
describe("useResetDemoData", () => {
  beforeEach(async () => {
    queryClient.clear();
    localStorage.clear();
    localStorage.setItem("kanso_guest_mode", "true");
    mockStore.clearData();
    idbBacking.clear();
    await guestWorkspaceStore.clear();
  });

  it("brings Demo mode back after it was cleared", async () => {
    const { result: demoMode, rerender } = renderHook(() => useDemoMode(), {
      wrapper,
    });
    await waitFor(() => expect(demoMode.current).toBe(false));

    const { result: resetDemoData } = renderHook(() => useResetDemoData(), {
      wrapper,
    });

    await act(async () => {
      await resetDemoData.current();
    });

    expect(mockStore.getTasks().length).toBeGreaterThan(0);

    // Same rebuild-on-next-render discipline as the clear test above: the
    // rerender makes the observer re-read the re-seeded store.
    await act(async () => {
      rerender();
    });
    await waitFor(() => expect(demoMode.current).toBe(true));
  });

  it("leaves guest workspaces alone — they are never demo content (ticket 09)", async () => {
    await guestWorkspaceStore.createWorkspace({ id: "ws-1", name: "Plan" });

    const { result: resetDemoData } = renderHook(() => useResetDemoData(), {
      wrapper,
    });

    await act(async () => {
      await resetDemoData.current();
    });

    expect(await guestWorkspaceStore.listWorkspaces()).toEqual([
      expect.objectContaining({ id: "ws-1", name: "Plan" }),
    ]);
  });
});
