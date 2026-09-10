"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";

/**
 * The orphan Node's body (ADR 0019): what a node renders when its entity
 * query misses — the honest-degradation placeholder. It names what was lost
 * and states the one affordance: dismiss. Dismiss IS `node.remove`, executed
 * by the node's own remove control; nothing about the referenced entity can
 * be touched from here (re-linking is a later-phase decision, out of scope).
 *
 * The body is purely presentational — each kind's node component supplies
 * the row and keeps its remove control, so dismiss stays the same layout
 * write every node already performs. Orphan-ness is derived at read: this
 * renders only while the entity query misses; if the entity returns (undo,
 * Backup restore), the next fetch revives the live body for free.
 */
export function NodeOrphanBody({
  lostLabel,
}: {
  /** What was lost, named plainly — "Task", "Habit", "Event". */
  lostLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="px-3 py-2.5" data-testid="node-orphan-body">
      <p className="text-sm text-muted-foreground">
        {t("workspace.orphan.body", { label: lostLabel })}
      </p>
      <p className="text-[11px] text-muted-foreground/70 pt-0.5">
        {t("workspace.orphan.hint")}
      </p>
    </div>
  );
}
