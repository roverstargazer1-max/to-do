"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecurrenceRule } from "@/lib/utils/recurrence";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";

interface RecurrencePickerProps {
  value: RecurrenceRule | null;
  onChange: (value: RecurrenceRule | null) => void;
  variant?: "default" | "icon";
  isMobile?: boolean;
}

const PRESET_RULES: {
  labelKey: TranslationKey;
  value: RecurrenceRule | null;
}[] = [
  { labelKey: "tasks.recurrence.doesNotRepeat", value: null },
  { labelKey: "tasks.recurrence.daily", value: { freq: "DAILY", interval: 1 } },
  {
    labelKey: "tasks.recurrence.weekly",
    value: { freq: "WEEKLY", interval: 1 },
  },
  {
    labelKey: "tasks.recurrence.monthly",
    value: { freq: "MONTHLY", interval: 1 },
  },
  {
    labelKey: "tasks.recurrence.yearly",
    value: { freq: "YEARLY", interval: 1 },
  },
];

const FREQ_PRESET_KEY: Record<
  NonNullable<RecurrenceRule["freq"]>,
  TranslationKey
> = {
  DAILY: "tasks.recurrence.daily",
  WEEKLY: "tasks.recurrence.weekly",
  MONTHLY: "tasks.recurrence.monthly",
  YEARLY: "tasks.recurrence.yearly",
};

const FREQ_UNIT_KEY: Record<
  NonNullable<RecurrenceRule["freq"]>,
  TranslationKey
> = {
  DAILY: "tasks.recurrence.unitDay",
  WEEKLY: "tasks.recurrence.unitWeek",
  MONTHLY: "tasks.recurrence.unitMonth",
  YEARLY: "tasks.recurrence.unitYear",
};

// Helper to get the letter code for the badge
function getRecurrenceBadge(value: RecurrenceRule | null) {
  if (!value) return null;

  if (value.interval === 1) {
    switch (value.freq) {
      case "DAILY":
        return "D";
      case "WEEKLY":
        return "W";
      case "MONTHLY":
        return "M";
      case "YEARLY":
        return "Y";
    }
  }
  return "C"; // Custom
}

export default function RecurrencePicker({
  value,
  onChange,
  variant = "default",
  isMobile = false,
}: RecurrencePickerProps) {
  const [open, setOpen] = useState(false);
  const isIconVariant = variant === "icon";
  const hasRecurrence = !!value;
  const badgeLetter = hasRecurrence ? getRecurrenceBadge(value) : null;
  const { trigger } = useHaptic();
  const { t } = useTranslation();

  // Locale-aware stand-in for the former `formatRecurrenceRule` util.
  const formatRule = (rule: RecurrenceRule | null): string => {
    if (!rule) return t("tasks.recurrence.doesNotRepeat");
    if (rule.interval === 1) return t(FREQ_PRESET_KEY[rule.freq]);
    return t("tasks.recurrence.everyInterval", {
      interval: rule.interval,
      unit: t(FREQ_UNIT_KEY[rule.freq]),
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isIconVariant ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-9 p-0 transition-all group relative border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-none",
              hasRecurrence
                ? "text-brand bg-brand/10 hover:bg-brand/20 hover:text-brand border-transparent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
            onClick={() => {
              trigger("toggle");
            }}
            title={!isMobile ? formatRule(value) : undefined}
          >
            <Repeat className="h-4 w-4 transition-all" strokeWidth={2} />
            {hasRecurrence && badgeLetter && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-brand text-brand-foreground rounded-full flex items-center justify-center">
                {badgeLetter}
              </span>
            )}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal h-9 text-[13px]"
          >
            <Repeat className="mr-2 h-4 w-4" />
            {formatRule(value)}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {PRESET_RULES.map((preset) => (
            <Button
              key={preset.labelKey}
              variant={
                value?.freq === preset.value?.freq &&
                value?.interval === preset.value?.interval
                  ? "secondary"
                  : "ghost"
              }
              className="w-full justify-start h-8 text-[13px]"
              onClick={() => {
                trigger("toggle");
                // Maintain existing mode if switching between presets
                onChange(
                  preset.value
                    ? { ...preset.value, mode: value?.mode || "flexible" }
                    : null,
                );
                if (!preset.value) setOpen(false);
              }}
            >
              {t(preset.labelKey)}
            </Button>
          ))}

          {value && (
            <div className="pt-2 mt-1 border-t border-border">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("tasks.recurrence.type")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-foreground/[0.04] dark:bg-foreground/[0.06] p-0.5 rounded-md border border-border/40">
                <Button
                  variant={value.mode === "strict" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-6 text-[11px] px-2 shadow-none rounded-[4px] transition-all",
                    value.mode === "strict"
                      ? "bg-brand text-brand-foreground font-semibold shadow-sm hover:bg-brand hover:text-brand-foreground"
                      : "text-muted-foreground hover:text-muted-foreground hover:bg-transparent",
                  )}
                  onClick={() => {
                    trigger("toggle");
                    onChange({ ...value, mode: "strict" });
                  }}
                >
                  {t("tasks.recurrence.strict")}
                </Button>
                <Button
                  variant={
                    !value.mode || value.mode === "flexible"
                      ? "secondary"
                      : "ghost"
                  }
                  size="sm"
                  className={cn(
                    "h-6 text-[11px] px-2 shadow-none rounded-[4px] transition-all",
                    !value.mode || value.mode === "flexible"
                      ? "bg-brand text-brand-foreground font-semibold shadow-sm hover:bg-brand hover:text-brand-foreground"
                      : "text-muted-foreground hover:text-muted-foreground hover:bg-transparent",
                  )}
                  onClick={() => {
                    trigger("toggle");
                    onChange({ ...value, mode: "flexible" });
                  }}
                >
                  {t("tasks.recurrence.flexible")}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-1 leading-tight">
                {value.mode === "strict"
                  ? t("tasks.recurrence.strictHint")
                  : t("tasks.recurrence.flexibleHint")}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
