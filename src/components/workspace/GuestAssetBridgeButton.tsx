"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cable, Check, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { notify } from "@/lib/notify";
import { defaultBlueprintCommandAdapters } from "@/lib/workspace/blueprint/commands";
import { guestWorkspaceStore } from "@/lib/workspace/guest-store";
import { guestVisualAssetStore } from "@/lib/visual/guest-store";
import {
  createGuestAssetBridgeHandler,
  pairGuestAssetBridgeBrowser,
  type GuestAssetBridgeBrowserSession,
} from "@/lib/visual/guest-asset-bridge";

const DEFAULT_ENDPOINT = "http://127.0.0.1:37373/kagelin/guest-asset-bridge";

interface GuestAssetBridgeButtonProps {
  workspaceId: string;
}

function localBridgeEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("The local MCP bridge endpoint is not a valid URL.");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "The Guest asset bridge can only connect to a local MCP endpoint.",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

/** User-controlled pairing entry point for the browser-owned Guest bridge. */
export function GuestAssetBridgeButton({
  workspaceId,
}: GuestAssetBridgeButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [pairingCode, setPairingCode] = useState("");
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<GuestAssetBridgeBrowserSession | null>(null);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
    };
  }, []);

  const pair = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalizedEndpoint = localBridgeEndpoint(endpoint);
      const handler = createGuestAssetBridgeHandler(
        guestVisualAssetStore,
        {
          get: async (id) =>
            (await guestWorkspaceStore.listWorkspaces()).find(
              (workspace) => workspace.id === id,
            ) ?? null,
          listNodes: (id) => guestWorkspaceStore.listNodes(id),
          listEdges: (id) => guestWorkspaceStore.listEdges(id),
          listWorkspaces: () => guestWorkspaceStore.listWorkspaces(),
        },
        { commandAdapters: defaultBlueprintCommandAdapters },
      );
      const result = await pairGuestAssetBridgeBrowser(
        normalizedEndpoint,
        {
          workspaceIds: [workspaceId],
        },
        handler,
        {
          pairingCode: pairingCode.trim(),
          onError: (bridgeError) => {
            const message =
              bridgeError instanceof Error
                ? bridgeError.message
                : String(bridgeError);
            setPaired(false);
            setError(message);
            sessionRef.current = null;
          },
        },
      );
      sessionRef.current = result.session;
      setPaired(true);
      setPairingCode("");
      setOpen(false);
      notify(t("workspace.guestBridge.paired"));
    } catch (pairError) {
      const message =
        pairError instanceof Error ? pairError.message : String(pairError);
      setError(message);
      notify.error(t("workspace.guestBridge.pairFailed"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await sessionRef.current?.stop();
      sessionRef.current = null;
      setPaired(false);
      setOpen(false);
      notify(t("workspace.guestBridge.disconnected"));
    } catch (disconnectError) {
      const message =
        disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError);
      setError(message);
      notify.error(t("workspace.guestBridge.disconnectFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title={t("workspace.guestBridge.open")}
          aria-label={t("workspace.guestBridge.open")}
          data-testid="guest-asset-bridge-button"
          className="gap-2 bg-background"
        >
          {paired ? (
            <Check className="h-4 w-4 text-green-600" strokeWidth={2.5} />
          ) : (
            <Cable className="h-4 w-4" strokeWidth={2.25} />
          )}
          <span className="hidden sm:inline">
            {paired
              ? t("workspace.guestBridge.paired")
              : t("workspace.guestBridge.open")}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="guest-asset-bridge-dialog">
        <DialogHeader>
          <DialogTitle>{t("workspace.guestBridge.title")}</DialogTitle>
          <DialogDescription>
            {t("workspace.guestBridge.description")}
          </DialogDescription>
        </DialogHeader>

        {paired ? (
          <div className="space-y-4">
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
              <p className="font-medium">{t("workspace.guestBridge.active")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("workspace.guestBridge.scope", { workspaceId })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void disconnect()}
              disabled={busy}
              className="gap-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="h-4 w-4" />
              )}
              {t("workspace.guestBridge.disconnect")}
            </Button>
          </div>
        ) : (
          <form onSubmit={pair} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="guest-bridge-endpoint">
                {t("workspace.guestBridge.endpoint")}
              </Label>
              <Input
                id="guest-bridge-endpoint"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder={DEFAULT_ENDPOINT}
                autoComplete="url"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-bridge-pairing-code">
                {t("workspace.guestBridge.pairingCode")}
              </Label>
              <Input
                id="guest-bridge-pairing-code"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                placeholder={t("workspace.guestBridge.pairingCodePlaceholder")}
                autoComplete="one-time-code"
                required
                disabled={busy}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("workspace.guestBridge.scope", { workspaceId })}
            </p>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy
                  ? t("workspace.guestBridge.pairing")
                  : t("workspace.guestBridge.pair")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
