"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { nodeCommands } from "@/lib/commands/node";
import { NodeCard } from "./NodeCard";
import type { WorkspaceNodeComponentProps } from "./node-registry";

/**
 * The placeholder Node — what an unknown kind renders instead of throwing.
 * A canvas last opened by a newer app version must still render after a
 * downgrade (spec: User Story 22; ADR 0018: kinds are validated at the
 * client boundary, the column stays tolerant text). Also what a known kind
 * renders when its row fails the kind's schema — degrade, never error.
 */
export function UnknownNode({ data }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const removeButton = (
    <button
      type="button"
      onClick={handleRemove}
      disabled={removing}
      data-testid={`unknown-node-remove-${row.id}`}
      aria-label={t("workspace.node.removeUnknownAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  return (
    <div data-testid={`unknown-node-${row.id}`} className="relative w-full">
      <NodeCard kind={t("workspace.node.kindUnknown")} action={removeButton}>
        <div className="px-3 py-2.5">
          <p className="text-sm text-muted-foreground">
            {t("workspace.unknown.body", { kind: row.kind })}
          </p>
          <p className="text-[11px] text-muted-foreground/70 pt-0.5">
            {t("workspace.unknown.hint")}
          </p>
        </div>
      </NodeCard>
    </div>
  );
}
