import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { nodeCommands } from "@/lib/commands/node";
import { notify } from "@/lib/notify";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    updateDocNode: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/notify", () => {
  const fn = vi.fn();
  return {
    notify: Object.assign(fn, {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      promise: vi.fn(),
    }),
  };
});

const makeDocRow = (overrides: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id: "doc-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "doc",
  entity_type: null,
  entity_id: null,
  position_x: 100,
  position_y: 100,
  width: 280,
  height: 180,
  group_id: null,
  display_config: {
    title: "Vibecoding Prompt",
    content: "You are an expert pair programmer.",
  },
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
  ...overrides,
});

import { workspaceNodeTypes } from "@/components/workspace/node-registry";

function renderDocNode(row: WorkspaceNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const DocNodeBound = workspaceNodeTypes.doc as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;

  return render(
    <QueryClientProvider client={queryClient}>
      <DocNodeBound id={row.id} data={{ row }} />
    </QueryClientProvider>,
  );
}

describe("DocNode component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders preview mode by default when content already exists", () => {
    const row = makeDocRow();
    renderDocNode(row);

    expect(screen.getByTestId("doc-node")).toBeInTheDocument();
    expect(screen.getByTestId("doc-node-title")).toHaveTextContent(
      "Vibecoding Prompt",
    );
    expect(screen.getByTestId("doc-node-preview")).toBeInTheDocument();
    expect(
      screen.getByText("You are an expert pair programmer."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("doc-node-textarea")).not.toBeInTheDocument();
  });

  it("renders edit mode by default for newly created doc node (empty title and content)", () => {
    const row = makeDocRow({
      display_config: { title: "", content: "" },
    });
    renderDocNode(row);

    expect(screen.getByTestId("doc-node-textarea")).toBeInTheDocument();
    expect(screen.queryByTestId("doc-node-preview")).not.toBeInTheDocument();
  });

  it("allows double-click inline title editing and commits on Enter", async () => {
    const row = makeDocRow();
    renderDocNode(row);

    const titleSpan = screen.getByTestId("doc-node-title");
    fireEvent.doubleClick(titleSpan);

    const input = screen.getByTestId("doc-node-title-input");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(nodeCommands.updateDocNode).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          nodeId: "doc-1",
          title: "New Title",
        },
      );
    });
  });

  it("cancels title editing on Escape key", () => {
    const row = makeDocRow();
    renderDocNode(row);

    fireEvent.doubleClick(screen.getByTestId("doc-node-title"));
    const input = screen.getByTestId("doc-node-title-input");
    fireEvent.change(input, { target: { value: "Cancelled Title" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(
      screen.queryByTestId("doc-node-title-input"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("doc-node-title")).toHaveTextContent(
      "Vibecoding Prompt",
    );
    expect(nodeCommands.updateDocNode).not.toHaveBeenCalled();
  });

  it("enters edit mode on double-clicking preview area and commits on Ctrl+Enter", async () => {
    const row = makeDocRow();
    renderDocNode(row);

    const previewArea = screen.getByTestId("doc-node-preview");
    fireEvent.doubleClick(previewArea);

    const textarea = screen.getByTestId("doc-node-textarea");
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, {
      target: { value: "Updated markdown **content**" },
    });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(nodeCommands.updateDocNode).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          nodeId: "doc-1",
          content: "Updated markdown **content**",
        },
      );
    });
  });

  it("toggles edit and preview via header toggle button", async () => {
    const row = makeDocRow();
    renderDocNode(row);

    const toggleBtn = screen.getByTestId("doc-node-toggle-edit");
    // Click to enter edit mode
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("doc-node-textarea")).toBeInTheDocument();

    // Change text and click toggleBtn (now check icon) to commit
    fireEvent.change(screen.getByTestId("doc-node-textarea"), {
      target: { value: "Committed via button" },
    });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(nodeCommands.updateDocNode).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          nodeId: "doc-1",
          content: "Committed via button",
        },
      );
    });
  });

  it("copies content to clipboard and shows feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const row = makeDocRow();
    renderDocNode(row);

    const copyBtn = screen.getByTestId("doc-node-copy");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "You are an expert pair programmer.",
      );
      expect(notify).toHaveBeenCalled();
    });
  });

  it("calls nodeCommands.remove when remove button is clicked", async () => {
    const row = makeDocRow();
    renderDocNode(row);

    const removeBtn = screen.getByTestId("doc-node-remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(nodeCommands.remove).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        row,
      );
    });
  });
});
