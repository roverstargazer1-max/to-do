import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import QueryProvider, {
  createQueryClient,
  ELECTRON_GC_TIME,
  DEFAULT_GC_TIME,
} from "@/components/QueryProvider";

// Mock idb-keyval
vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

describe("QueryProvider & queryClient configuration", () => {
  const originalEnv = process.env.NEXT_PUBLIC_IS_ELECTRON;

  afterEach(() => {
    process.env.NEXT_PUBLIC_IS_ELECTRON = originalEnv;
    vi.clearAllMocks();
  });

  describe("createQueryClient factory", () => {
    it("configures 5-minute gcTime in Electron mode", () => {
      const client = createQueryClient(true);
      const defaultQueryOptions = client.getDefaultOptions().queries;

      expect(defaultQueryOptions?.gcTime).toBe(ELECTRON_GC_TIME);
      expect(defaultQueryOptions?.gcTime).toBe(5 * 60 * 1000);
      expect(defaultQueryOptions?.staleTime).toBe(5 * 60 * 1000);
    });

    it("configures 7-day gcTime in standard web/PWA mode", () => {
      const client = createQueryClient(false);
      const defaultQueryOptions = client.getDefaultOptions().queries;

      expect(defaultQueryOptions?.gcTime).toBe(DEFAULT_GC_TIME);
      expect(defaultQueryOptions?.gcTime).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("registers core mutation defaults in both modes", () => {
      const electronClient = createQueryClient(true);
      const webClient = createQueryClient(false);

      expect(electronClient.getMutationDefaults(["createTask"])).toBeDefined();
      expect(electronClient.getMutationDefaults(["node.move"])).toBeDefined();
      expect(electronClient.getMutationDefaults(["createHabit"])).toBeDefined();

      expect(webClient.getMutationDefaults(["createTask"])).toBeDefined();
      expect(webClient.getMutationDefaults(["node.move"])).toBeDefined();
      expect(webClient.getMutationDefaults(["createHabit"])).toBeDefined();
    });
  });

  describe("Provider rendering", () => {
    it("renders children cleanly in Electron desktop mode", () => {
      process.env.NEXT_PUBLIC_IS_ELECTRON = "true";

      render(
        <QueryProvider>
          <div data-testid="desktop-child">Desktop View</div>
        </QueryProvider>,
      );

      expect(screen.getByTestId("desktop-child")).toHaveTextContent(
        "Desktop View",
      );
    });

    it("renders children cleanly in web/PWA mode", async () => {
      process.env.NEXT_PUBLIC_IS_ELECTRON = "false";

      await React.act(async () => {
        render(
          <QueryProvider>
            <div data-testid="web-child">Web View</div>
          </QueryProvider>,
        );
      });

      expect(screen.getByTestId("web-child")).toHaveTextContent("Web View");
    });
  });
});
