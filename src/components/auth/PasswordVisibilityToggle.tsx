"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function PasswordVisibilityToggle({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label?: string;
}) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("auth.password.toggleVisibility");
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={
        visible
          ? t("auth.password.hideLabel", { label: resolvedLabel })
          : t("auth.password.showLabel", { label: resolvedLabel })
      }
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors"
    >
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </button>
  );
}
