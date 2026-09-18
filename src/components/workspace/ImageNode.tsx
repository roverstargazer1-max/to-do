"use client";

import { useState, memo } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import { useVisualAsset } from "@/lib/hooks/useVisualAsset";
import { NodeCard } from "./NodeCard";
import type { WorkspaceNodeComponentProps } from "./node-registry";

/** Asset-backed image node. Missing bytes are visible and recoverable. */
export const ImageNode = memo(function ImageNode({
  data,
  selected,
}: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const display = (row.display_config ?? {}) as Record<string, unknown>;
  const assetId = row.entity_type === "visual_asset" ? row.entity_id : null;
  const versionId =
    typeof display.versionId === "string" ? display.versionId : null;
  const { asset, version, url, loading, error } = useVisualAsset(
    assetId,
    versionId,
  );
  const [removing, setRemoving] = useState(false);
  const title = String(
    display.title ?? asset?.title ?? t("workspace.node.kindImage"),
  );
  const altText = String(display.altText ?? asset?.alt_text ?? title);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (removeError) {
      console.error("Failed to remove image node:", removeError);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const action = (
    <button
      type="button"
      onClick={() => void handleRemove()}
      disabled={removing}
      data-testid="image-node-remove"
      aria-label={t("workspace.node.removeImageAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  return (
    <div data-testid="image-node" className="relative w-full h-full">
      <NodeCard
        kind={
          <span className="flex items-center gap-1.5">
            <ImageIcon
              className="h-3 w-3 text-muted-foreground"
              aria-hidden="true"
            />
            <span>{t("workspace.node.kindImage")}</span>
          </span>
        }
        action={action}
        minWidth={180}
        minHeight={120}
        selected={selected}
      >
        <div className="p-2 h-full min-h-[9rem] flex flex-col gap-2">
          {loading ? (
            <div
              className="flex-1 grid place-content-center text-xs text-muted-foreground"
              data-testid="image-node-loading"
            >
              {t("workspace.imageNode.loading")}
            </div>
          ) : url && version ? (
            // This is a revocable object URL for private asset bytes; it cannot
            // be sent through Next's remote image optimizer.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={altText}
              className="min-h-0 flex-1 w-full rounded-sm object-contain bg-muted/30"
              data-testid="image-node-preview"
            />
          ) : (
            <div
              className="flex-1 grid place-content-center gap-1 text-center text-xs text-muted-foreground"
              data-testid="image-node-missing"
            >
              <ImageIcon
                className="mx-auto h-6 w-6 opacity-60"
                aria-hidden="true"
              />
              <span>{t("workspace.imageNode.unavailable")}</span>
              <span className="text-[10px] opacity-70">
                {error?.message ?? t("workspace.imageNode.missingHint")}
              </span>
            </div>
          )}
          {asset ? (
            <div
              className="text-[10px] text-muted-foreground truncate"
              title={asset.sha256}
            >
              {asset.width}×{asset.height} · {asset.mime_type}
            </div>
          ) : null}
        </div>
      </NodeCard>
    </div>
  );
});
