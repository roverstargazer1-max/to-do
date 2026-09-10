"use client";

import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { LANGUAGES } from "@/lib/i18n/languages";
import type { Locale } from "@/lib/i18n/types";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useUiStore } from "@/lib/store/uiStore";

/**
 * Preferences → Language row (ticket 02). Follows the Time Format card
 * pattern; options render in their own script and switching is instant
 * and local-only (spec D-01, D-05, D-09).
 */
export function LanguageSetting() {
  const { t } = useTranslation();
  const language = useUiStore((state) => state.language ?? "en");
  const setLanguage = useUiStore((state) => state.setLanguage);
  const { trigger } = useHaptic();

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-background">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-secondary/30">
          <Languages className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{t("settings.language.label")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.language.description")}
          </p>
        </div>
      </div>
      <Select
        value={language}
        onValueChange={(value) => {
          trigger("toggle");
          setLanguage?.(value as Locale);
        }}
      >
        <SelectTrigger
          className="w-full"
          aria-label={t("settings.language.label")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
