import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DbReactivityProvider } from "@/components/providers/DbReactivityProvider";
import { LegacyMigrationProvider } from "@/components/providers/LegacyMigrationProvider";

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type));
    }
  }

  close() {
    this.closed = true;
  }
}

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
  return { client, ...utils };
}

describe("DbReactivityProvider", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes to the local change stream, debounces bursts by 150ms, and invalidates target domains", async () => {
    const { client } = renderWithClient(
      <DbReactivityProvider>
        <span data-testid="child" />
      </DbReactivityProvider>,
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    expect(MockEventSource.instances[0].url).toBe("/api/db/live");

    act(() => {
      MockEventSource.instances[0].emit("change");
      MockEventSource.instances[0].emit("change");
      MockEventSource.instances[0].emit("change");
    });

    // Debounced: should not fire immediately
    expect(invalidate).not.toHaveBeenCalled();

    // Wait for 150ms debounce window to complete
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));

    const options = invalidate.mock.calls[0][0];
    expect(options?.refetchType).toBe("active");
    expect(typeof options?.predicate).toBe("function");

    const predicate = options!.predicate!;
    expect(predicate({ queryKey: ["tasks", "list"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["projects"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["habits", "123"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["calendar-events"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["workspace", "board"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["workspaces"] } as any)).toBe(true);
    expect(predicate({ queryKey: ["unrelated-cache-entry"] } as any)).toBe(
      false,
    );
  });

  it("suppresses immediate active refetches when document is hidden", async () => {
    const originalHidden = document.hidden;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    try {
      const { client } = renderWithClient(
        <DbReactivityProvider>
          <span />
        </DbReactivityProvider>,
      );
      const invalidate = vi.spyOn(client, "invalidateQueries");

      await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

      act(() => {
        MockEventSource.instances[0].emit("change");
      });

      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
      expect(invalidate.mock.calls[0][0]?.refetchType).toBe("none");
    } finally {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => originalHidden,
      });
    }
  });

  it("closes the stream when unmounted", async () => {
    const { unmount } = renderWithClient(
      <DbReactivityProvider>
        <span />
      </DbReactivityProvider>,
    );

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });
});

describe("LegacyMigrationProvider", () => {
  const flag = "kanso_sqlite_migrated_v1";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("posts legacy localStorage data to the migration endpoint and records the flag", async () => {
    localStorage.setItem(
      "kanso_guest_data_v11",
      JSON.stringify({
        tasks: [{ id: "task-1", content: "Legacy task" }],
        projects: [],
        habits: [],
        events: [],
      }),
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <LegacyMigrationProvider>
        <span />
      </LegacyMigrationProvider>,
    );

    await waitFor(() => expect(localStorage.getItem(flag)).toBe("true"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/db/migrate-legacy");
    expect(init.method).toBe("POST");
  });

  it("marks the database as migrated without posting when no legacy data exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <LegacyMigrationProvider>
        <span />
      </LegacyMigrationProvider>,
    );

    await waitFor(() => expect(localStorage.getItem(flag)).toBe("true"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the check entirely once the idempotency flag is set", async () => {
    localStorage.setItem(flag, "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <LegacyMigrationProvider>
        <span />
      </LegacyMigrationProvider>,
    );

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(localStorage.getItem(flag)).toBe("true");
  });
});
