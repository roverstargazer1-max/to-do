/**
 * The Workspaces page's empty state (ticket 09): a registered user who
 * signed up from Guest mode finds an empty canvas — the signup migration
 * carries domain data and drops layout (the calendar-events precedent,
 * ADR 0014/0018). The messaging says so plainly, where it's first seen;
 * a Guest sees the plain create-a-canvas copy and no migration note.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import WorkspacesPage from "@//../app/workspaces/page";

const useAuthMock = vi.fn();
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("@/components/workspace/WorkspaceActionsProvider", () => ({
  useWorkspaceActions: () => ({
    openCreateWorkspace: vi.fn(),
    openRenameWorkspace: vi.fn(),
    openDeleteWorkspace: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<WorkspacesPage />, { wrapper });
}

describe("WorkspacesPage empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isGuestMode: true });
  });

  it("a Guest sees the plain create-a-canvas copy, no migration note", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No workspaces yet")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("signup-layout-note")).not.toBeInTheDocument();
  });

  it("a registered user gets the plain signup note: domain data migrated, canvas did not (ticket 09)", async () => {
    useAuthMock.mockReturnValue({ isGuestMode: false });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No workspaces yet")).toBeInTheDocument(),
    );
    // Says so plainly, in user-visible words.
    expect(screen.getByTestId("signup-layout-note")).toHaveTextContent(
      /tasks and habits migrated/i,
    );
    expect(screen.getByTestId("signup-layout-note")).toHaveTextContent(
      /don.t carry over/i,
    );
  });
});
