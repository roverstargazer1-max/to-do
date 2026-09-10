"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function AuthEmailField({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px]">
        {t("auth.email.label")}
      </Label>
      <div className="relative">
        <Mail
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          strokeWidth={2.25}
        />
        <Input
          id={id}
          type="email"
          placeholder={t("auth.email.placeholder")}
          className="pl-9 h-11 text-base md:text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
        />
      </div>
      {children}
    </div>
  );
}
