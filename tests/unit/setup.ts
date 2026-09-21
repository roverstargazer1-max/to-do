import "@testing-library/jest-dom";
import { vi } from "vitest";
import { registerLocalDal } from "@/lib/api/local-dal";
import { createNodeLocalDal } from "@/lib/api/local-dal-node";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollTo = vi.fn();
}

// Mock IntersectionObserver
const IntersectionObserverMock = vi.fn(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  takeRecords: vi.fn(),
  unobserve: vi.fn(),
}));

Object.defineProperty(globalThis, "IntersectionObserver", {
  value: IntersectionObserverMock,
  configurable: true,
  writable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "IntersectionObserver", {
    value: IntersectionObserverMock,
    configurable: true,
    writable: true,
  });
}

// Mock ResizeObserver
class ResizeObserverMock {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
  configurable: true,
  writable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverMock,
    configurable: true,
    writable: true,
  });
}

// Mock CSS.supports
Object.defineProperty(global, "CSS", {
  value: {
    supports: vi.fn().mockReturnValue(true),
  },
  writable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "CSS", {
    value: {
      supports: vi.fn().mockReturnValue(true),
    },
    writable: true,
  });
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
  writable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
}

// Isolate SQLite database per Vitest worker process to prevent concurrent test collision
import * as os from "node:os";
import * as path from "node:path";

if (!process.env.KAGELIN_DB_PATH) {
  const poolId = process.env.VITEST_POOL_ID ?? process.pid;
  process.env.KAGELIN_DB_PATH = path.join(
    os.tmpdir(),
    `kagelin-test-${poolId}.db`,
  );
}

// Register the server-side SQLite DAL only after the per-worker DB path is set,
// so every repository call resolves the isolated test database.
registerLocalDal(createNodeLocalDal());
