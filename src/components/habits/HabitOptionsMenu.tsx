"use client";

import { useRef } from "react";
import { MoreVertical, Database, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BetaBadge } from "@/components/ui/beta-badge";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useUhabitsImport } from "@/lib/hooks/useUhabitsImport";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function HabitOptionsMenu() {
  const { trigger } = useHaptic();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { importUhabits, isImporting } = useUhabitsImport();
  const { t } = useTranslation();

  const handleImportClick = () => {
    trigger("toggle");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importUhabits(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".db"
        className="hidden"
        onChange={handleFileChange}
        aria-label={t("habits.options.importFile")}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 bg-transparent hover:bg-secondary/40 border-none shadow-none transition-seijaku-fast rounded-lg"
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="sr-only">{t("habits.options.srLabel")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 shadow-lg border-border/40"
        >
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("habits.options.data")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleImportClick}
            disabled={isImporting}
            className="cursor-pointer gap-2 py-2"
          >
            <Database className="h-4 w-4 text-brand" />
            <span>{t("habits.options.loop")}</span>
            <BetaBadge className="ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
