import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pairGuestAssetBridgeBrowser = vi.hoisted(() => vi.fn());
const createGuestAssetBridgeHandler = vi.hoisted(() =>
  vi.fn(() => ({
    handle: vi.fn(),
  })),
);
const sessionStop = vi.hoisted(() => vi.fn(async () => undefined));
const notify = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, { error: vi.fn() });
});

vi.mock("@/lib/i18n/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/notify", () => ({ notify }));

vi.mock("@/lib/workspace/blueprint/commands", () => ({
  defaultBlueprintCommandAdapters: {},
}));

vi.mock("@/lib/workspace/guest-store", () => ({
  guestWorkspaceStore: {
    listWorkspaces: vi.fn(async () => [{ id: "ws-1" }]),
    listNodes: vi.fn(async () => []),
    listEdges: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/visual/guest-store", () => ({ guestVisualAssetStore: {} }));

vi.mock("@/lib/visual/guest-asset-bridge", () => ({
  createGuestAssetBridgeHandler,
  pairGuestAssetBridgeBrowser,
}));

import { GuestAssetBridgeButton } from "@/components/workspace/GuestAssetBridgeButton";

describe("GuestAssetBridgeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pairGuestAssetBridgeBrowser.mockResolvedValue({
      grant: { token: "grant-1", origin: "http://localhost:3000" },
      session: { stop: sessionStop },
    });
  });

  it("actively pairs the current Guest Workspace with the local MCP and can revoke it", async () => {
    render(<GuestAssetBridgeButton workspaceId="ws-1" />);

    fireEvent.click(screen.getByTestId("guest-asset-bridge-button"));
    fireEvent.change(
      screen.getByLabelText("workspace.guestBridge.pairingCode"),
      {
        target: { value: "PAIR-1" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.guestBridge.pair" }),
    );

    await waitFor(() =>
      expect(pairGuestAssetBridgeBrowser).toHaveBeenCalledWith(
        "http://127.0.0.1:37373/kagelin/guest-asset-bridge",
        { workspaceIds: ["ws-1"] },
        expect.objectContaining({ handle: expect.any(Function) }),
        expect.objectContaining({ pairingCode: "PAIR-1" }),
      ),
    );
    expect(screen.getByTestId("guest-asset-bridge-button")).toHaveTextContent(
      "workspace.guestBridge.paired",
    );

    fireEvent.click(screen.getByTestId("guest-asset-bridge-button"));
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.guestBridge.disconnect" }),
    );
    await waitFor(() => expect(sessionStop).toHaveBeenCalledOnce());
  });
});
