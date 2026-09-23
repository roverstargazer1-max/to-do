import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpChannelCard } from "@/components/settings/McpChannelCard";
import { notify } from "@/lib/notify";
import { maskMcpToken } from "@/lib/mcp/client-config-snippets";
import type { ElectronBridge, McpChannelStatus } from "@/lib/types/electron";

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (c: boolean) => void;
    "aria-label"?: string;
  }) => (
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      aria-label={ariaLabel}
    />
  ),
}));

// The real dialog mounts a Drawer/AlertDialog pair plus back-navigation
// plumbing; the card only needs the confirm affordance.
vi.mock("@/components/ui/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({
    isOpen,
    onClose,
    onConfirm,
    title,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    confirmLabel?: string;
    title?: string;
    description?: string;
    children?: ReactNode;
  }) =>
    isOpen ? (
      <div>
        <button type="button" onClick={onConfirm}>
          {`confirm: ${title}`}
        </button>
        <button type="button" onClick={onClose}>
          cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/lib/notify", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const URL = "http://127.0.0.1:4321/api/mcp";
const TOKEN = "8Qw3ZtRk1sVp0LmN7yBcXdEfGh2Jk4Mn6Pq8Rs0Tu1W";
const ROTATED_TOKEN = "r0t4t3dK3y0123456789abcdefghijklmnopqrst0";

function status(overrides: Partial<McpChannelStatus> = {}): McpChannelStatus {
  return {
    available: true,
    running: true,
    enabled: false,
    token: TOKEN,
    url: URL,
    ...overrides,
  };
}

function createBridge(overrides: Partial<ElectronBridge> = {}): ElectronBridge {
  return {
    platform: "darwin",
    isElectron: true,
    onUpdateAvailable: () => {},
    onUpdateDownloaded: () => {},
    mcp: {
      getStatus: vi.fn().mockResolvedValue(status()),
      setEnabled: vi.fn().mockResolvedValue(status({ enabled: true })),
      resetToken: vi
        .fn()
        .mockResolvedValue(status({ enabled: true, token: ROTATED_TOKEN })),
    },
    ...overrides,
  };
}

function installBridge(bridge: ElectronBridge | undefined) {
  Object.defineProperty(window, "electron", {
    value: bridge,
    configurable: true,
    writable: true,
  });
}

describe("McpChannelCard", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    vi.mocked(notify.success).mockClear();
    vi.mocked(notify.error).mockClear();
    installBridge(createBridge());
  });

  it("loads the endpoint status from the desktop bridge", async () => {
    render(<McpChannelCard />);

    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText(URL)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Enable MCP endpoint" }),
    ).not.toBeChecked();
  });

  it("toggles the endpoint through the bridge", async () => {
    const bridge = createBridge();
    installBridge(bridge);
    render(<McpChannelCard />);

    fireEvent.click(
      await screen.findByRole("switch", { name: "Enable MCP endpoint" }),
    );

    await waitFor(() => {
      expect(bridge.mcp?.setEnabled).toHaveBeenCalledWith(true);
    });
    expect(await screen.findByText("Listening")).toBeInTheDocument();
  });

  it("keeps the token masked until the user reveals it", async () => {
    render(<McpChannelCard />);

    await screen.findByText("Disabled");
    expect(screen.getByText(maskMcpToken(TOKEN))).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show token" }));

    expect(screen.getByText(TOKEN)).toBeInTheDocument();
  });

  it("copies the endpoint url and each client configuration", async () => {
    const writeText = vi.mocked(navigator.clipboard.writeText);
    render(<McpChannelCard />);

    await screen.findByText("Disabled");
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy configuration: Claude Desktop",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy configuration: Claude Code CLI",
      }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    const copied = writeText.mock.calls.map(([value]) => value);
    expect(copied[1]).toContain('"mcpServers"');
    expect(copied[1]).toContain(`Bearer ${TOKEN}`);
    expect(copied[2]).toContain("claude mcp add --transport http kagelin");
    expect(copied[2]).toContain(`Bearer ${TOKEN}`);
    expect(notify.success).toHaveBeenCalled();
  });

  it("asks for confirmation before rotating the token", async () => {
    const bridge = createBridge();
    installBridge(bridge);
    render(<McpChannelCard />);

    await screen.findByText("Disabled");
    expect(bridge.mcp?.resetToken).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset token" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "confirm: Reset the MCP access token?",
      }),
    );

    await waitFor(() => expect(bridge.mcp?.resetToken).toHaveBeenCalled());
    expect(await screen.findByText(ROTATED_TOKEN)).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith("MCP token reset");
  });

  it("explains that the endpoint only exists in the desktop build", async () => {
    installBridge(undefined);
    render(<McpChannelCard />);

    expect(
      await screen.findByText(/served by the desktop app's embedded server/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows the same hint when the desktop build reports no endpoint", async () => {
    installBridge(
      createBridge({
        mcp: {
          getStatus: vi
            .fn()
            .mockResolvedValue(status({ available: false, token: null })),
          setEnabled: vi.fn().mockResolvedValue(status({ available: false })),
          resetToken: vi.fn().mockResolvedValue(status({ available: false })),
        },
      }),
    );
    render(<McpChannelCard />);

    expect(
      await screen.findByText(/served by the desktop app's embedded server/),
    ).toBeInTheDocument();
  });
});
