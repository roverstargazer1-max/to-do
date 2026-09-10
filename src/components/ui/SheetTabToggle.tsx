"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/useTranslation";

export type SheetTab = "edit" | "insights";

interface SheetTabToggleProps {
  value: SheetTab;
  onValueChange: (value: SheetTab) => void;
}

export function SheetTabToggle({ value, onValueChange }: SheetTabToggleProps) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as SheetTab)}
    >
      <TabsList className="inline-flex bg-secondary/10 p-1 rounded-lg h-11 border border-border/40 shadow-none">
        <TabsTrigger
          value="edit"
          className="rounded-md px-4 h-9 text-[13px] font-medium tracking-tight border border-transparent text-muted-foreground transition-seijaku-fast hover:text-foreground hover:bg-secondary/40 data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand/20 data-[state=active]:shadow-none"
        >
          {t("common.tab.edit")}
        </TabsTrigger>
        <TabsTrigger
          value="insights"
          className="rounded-md px-4 h-9 text-[13px] font-medium tracking-tight border border-transparent text-muted-foreground transition-seijaku-fast hover:text-foreground hover:bg-secondary/40 data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:border-brand/20 data-[state=active]:shadow-none"
        >
          {t("common.tab.insights")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
