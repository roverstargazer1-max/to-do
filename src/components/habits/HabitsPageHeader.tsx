"use client";

import { Plus, LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { HabitOptionsMenu } from "@/components/habits/HabitOptionsMenu";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface HabitsPageHeaderProps {
  viewMode: "grid" | "compact";
  onViewModeChange: (mode: "grid" | "compact") => void;
  onNewHabit: () => void;
}

export function HabitsPageHeader({
  viewMode,
  onViewModeChange,
  onNewHabit,
}: HabitsPageHeaderProps) {
  const { trigger } = useHaptic();
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 shrink-0 max-md:justify-between">
      <Tabs
        value={viewMode}
        onValueChange={(v) => {
          trigger("toggle");
          onViewModeChange(v as "grid" | "compact");
        }}
        className="h-10"
      >
        <TabsList className="bg-secondary/10 p-1 rounded-lg h-10 border border-border/40 shadow-none">
          <TabsTrigger
            value="grid"
            className="rounded-md gap-2 px-2.5 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-all motion-reduce:transition-none h-8 border border-transparent data-[state=active]:border-brand/20"
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
            <span className="hidden md:inline">{t("habits.view.grid")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="compact"
            className="rounded-md gap-2 px-2.5 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-all motion-reduce:transition-none h-8 border border-transparent data-[state=active]:border-brand/20"
          >
            <Rows3 className="h-4 w-4" strokeWidth={2.25} />
            <span className="hidden md:inline">{t("habits.view.compact")}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        onClick={onNewHabit}
        className="hidden md:flex h-9 items-center gap-2 px-4 rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 border-none shadow-sm shadow-brand/10 transition-seijaku text-[13px] font-semibold"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        <span>{t("habits.header.newHabit")}</span>
      </Button>
      <HabitOptionsMenu />
    </div>
  );
}
