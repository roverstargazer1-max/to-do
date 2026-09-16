"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { notify } from "@/lib/notify";
import { visualMutations } from "@/lib/mutations/visual";
import type {
  VisualRelation,
  VisualRelationType,
  VisualEndpointType,
} from "@/lib/types/visual";
import type { WorkspaceNode } from "@/lib/types/workspace";

const RELATION_TYPES: VisualRelationType[] = [
  "reference",
  "supports",
  "evidence-for",
  "derived-from",
];

const NODE_ENDPOINT_TYPES = new Set<VisualEndpointType>([
  "image_node",
  "workspace_node",
  "step",
  "decision",
  "doc",
  "task",
  "habit",
  "project",
  "focus",
]);

interface VisualRelationsPanelProps {
  workspaceId: string;
  nodes: WorkspaceNode[];
  selectedNodeIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function endpointType(node: WorkspaceNode): VisualEndpointType {
  if (node.kind === "image") return "image_node";
  return NODE_ENDPOINT_TYPES.has(node.kind as VisualEndpointType)
    ? (node.kind as VisualEndpointType)
    : "workspace_node";
}

function endpointLabel(
  relation: VisualRelation,
  side: "source" | "target",
  nodesById: Map<string, WorkspaceNode>,
): string {
  const type = side === "source" ? relation.source_type : relation.target_type;
  const id = side === "source" ? relation.source_id : relation.target_id;
  const node = type !== "visual_asset" ? nodesById.get(id) : undefined;
  const display = (node?.display_config ?? {}) as Record<string, unknown>;
  const title = display.title ?? display.question;
  return `${type}:${typeof title === "string" && title.trim() ? title : id}`;
}

export function VisualRelationsPanel({
  workspaceId,
  nodes,
  selectedNodeIds,
  open,
  onOpenChange,
}: VisualRelationsPanelProps) {
  const { t } = useTranslation();
  const [relations, setRelations] = useState<VisualRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationType, setRelationType] =
    useState<VisualRelationType>("reference");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [description, setDescription] = useState("");

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const endpointOptions = useMemo(
    () =>
      nodes
        .filter((node) => node.kind !== "group")
        .map((node) => {
          const display = (node.display_config ?? {}) as Record<
            string,
            unknown
          >;
          const title = display.title ?? display.question;
          return {
            id: node.id,
            type: endpointType(node),
            label:
              typeof title === "string" && title.trim()
                ? title
                : `${node.kind}:${node.id}`,
          };
        }),
    [nodes],
  );

  const loadRelations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRelations(await visualMutations.listRelations(workspaceId));
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void loadRelations();
  }, [loadRelations, open]);

  useEffect(() => {
    if (!open || selectedNodeIds.length < 2) return;
    const [nextSource, nextTarget] = selectedNodeIds;
    setSourceId(nextSource ?? "");
    setTargetId(nextTarget ?? "");
  }, [open, selectedNodeIds]);

  const createRelation = async () => {
    const source = endpointOptions.find((item) => item.id === sourceId);
    const target = endpointOptions.find((item) => item.id === targetId);
    if (!source || !target || source.id === target.id) {
      setError(t("workspace.visualRelations.invalidEndpoints"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await visualMutations.createRelation({
        workspaceId,
        relationType,
        sourceType: source.type,
        sourceId: source.id,
        targetType: target.type,
        targetId: target.id,
        description: description.trim() || null,
      });
      setDescription("");
      await loadRelations();
      notify(t("workspace.visualRelations.created"));
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : String(createError);
      setError(message);
      notify.error(t("workspace.visualRelations.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const updateRelation = async (
    relation: VisualRelation,
    nextType: VisualRelationType,
    nextDescription: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await visualMutations.updateRelation({
        workspaceId,
        relationId: relation.id,
        relationType: nextType,
        sourceType: relation.source_type,
        sourceId: relation.source_id,
        targetType: relation.target_type,
        targetId: relation.target_id,
        sourceVersionId: relation.source_version_id,
        targetVersionId: relation.target_version_id,
        description: nextDescription.trim() || null,
        expectedUpdatedAt: relation.updated_at,
      });
      await loadRelations();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : String(updateError),
      );
      notify.error(t("workspace.visualRelations.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteRelation = async (relationId: string) => {
    setSaving(true);
    setError(null);
    try {
      await visualMutations.removeRelation(workspaceId, relationId);
      setRelations((current) =>
        current.filter((item) => item.id !== relationId),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
      notify.error(t("workspace.visualRelations.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="visual-relations-panel"
      >
        <SheetTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {t("workspace.visualRelations.title")}
        </SheetTitle>
        <SheetDescription>
          {t("workspace.visualRelations.description")}
        </SheetDescription>

        <div className="mt-5 space-y-5">
          <section className="space-y-3 border-b border-border pb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("workspace.visualRelations.createTitle")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs">
                <Label htmlFor="visual-relation-source">
                  {t("workspace.visualRelations.source")}
                </Label>
                <select
                  id="visual-relation-source"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={saving}
                >
                  <option value="">
                    {t("workspace.visualRelations.chooseEndpoint")}
                  </option>
                  {endpointOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs">
                <Label htmlFor="visual-relation-target">
                  {t("workspace.visualRelations.target")}
                </Label>
                <select
                  id="visual-relation-target"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={saving}
                >
                  <option value="">
                    {t("workspace.visualRelations.chooseEndpoint")}
                  </option>
                  {endpointOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-1.5 text-xs">
              <Label htmlFor="visual-relation-type">
                {t("workspace.visualRelations.relationType")}
              </Label>
              <select
                id="visual-relation-type"
                value={relationType}
                onChange={(event) =>
                  setRelationType(event.target.value as VisualRelationType)
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={saving}
              >
                {RELATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label={t("workspace.visualRelations.descriptionLabel")}
              placeholder={t(
                "workspace.visualRelations.descriptionPlaceholder",
              )}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void createRelation()}
              disabled={saving || endpointOptions.length < 2}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("workspace.visualRelations.create")}
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("workspace.visualRelations.existingTitle")}
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("workspace.visualRelations.loading")}
              </div>
            ) : relations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("workspace.visualRelations.empty")}
              </p>
            ) : (
              <div className="space-y-3">
                {relations.map((relation) => (
                  <RelationRow
                    key={`${relation.id}:${relation.updated_at}`}
                    relation={relation}
                    sourceLabel={endpointLabel(relation, "source", nodesById)}
                    targetLabel={endpointLabel(relation, "target", nodesById)}
                    disabled={saving}
                    onSave={(nextType, nextDescription) =>
                      void updateRelation(relation, nextType, nextDescription)
                    }
                    onDelete={() => void deleteRelation(relation.id)}
                  />
                ))}
              </div>
            )}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RelationRow({
  relation,
  sourceLabel,
  targetLabel,
  disabled,
  onSave,
  onDelete,
}: {
  relation: VisualRelation;
  sourceLabel: string;
  targetLabel: string;
  disabled: boolean;
  onSave: (type: VisualRelationType, description: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<VisualRelationType>(relation.relation_type);
  const [description, setDescription] = useState(relation.description ?? "");

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="text-xs leading-relaxed">
        <span className="font-medium">{sourceLabel}</span>
        <span className="px-1.5 text-muted-foreground">→</span>
        <span className="font-medium">{targetLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label={t("workspace.visualRelations.relationType")}
          value={type}
          onChange={(event) =>
            setType(event.target.value as VisualRelationType)
          }
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
          disabled={disabled}
        >
          {RELATION_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onSave(type, description)}
          disabled={disabled}
        >
          {t("workspace.visualRelations.save")}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onDelete}
          disabled={disabled}
          aria-label={t("workspace.visualRelations.delete")}
          title={t("workspace.visualRelations.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Input
        aria-label={t("workspace.visualRelations.descriptionLabel")}
        placeholder={t("workspace.visualRelations.descriptionPlaceholder")}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={disabled}
        className="h-8 text-xs"
      />
    </div>
  );
}
