"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaces } from "@/lib/hooks/useWorkspaces";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { EmptyState } from "@/components/ui/EmptyState";
import { Frame } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function WorkspaceCanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
  const { data: workspaces, isLoading } = useWorkspaces();

  const workspace = workspaces?.find((w) => w.id === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-124px)] md:h-dvh">
        <div className="w-6 h-6 rounded-full border border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <EmptyState
        icon={Frame}
        title={t("workspace.canvas.notFoundTitle")}
        description={t("workspace.canvas.notFoundDescription")}
        action={{
          label: t("workspace.canvas.backToWorkspaces"),
          onClick: () => router.replace("/workspaces"),
        }}
        className="py-16"
      />
    );
  }

  return (
    // Viewport units, not h-full: template.tsx's motion wrapper has no height,
    // so a percentage chain dies at zero — the calendar/habits pages set this
    // house pattern (dvh minus the mobile chrome; full height on desktop).
    <div className="flex flex-col h-[calc(100dvh-124px)] md:h-dvh w-full overflow-hidden">
      <WorkspaceCanvas key={workspace.id} workspaceId={workspace.id} />
    </div>
  );
}
