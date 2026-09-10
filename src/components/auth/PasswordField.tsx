"use client";

import { AuthPasswordField } from "@/components/auth/AuthPasswordField";
import { PasswordBreachWarning } from "@/components/auth/PasswordBreachWarning";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function PasswordField({
  id,
  label,
  labelClassName,
  value,
  onChange,
  onBlur,
  disabled,
  autoComplete,
  toggleLabel,
  passwordTooShort,
  breached,
  children,
}: {
  id: string;
  label: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoComplete?: string;
  toggleLabel?: string;
  passwordTooShort: boolean;
  breached: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AuthPasswordField
      id={id}
      label={label}
      labelClassName={labelClassName}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      autoComplete={autoComplete}
      minLength={MIN_PASSWORD_LENGTH}
      toggleLabel={toggleLabel}
    >
      {passwordTooShort && (
        <p className="text-xs text-muted-foreground">
          {t("auth.password.tooShort", { min: MIN_PASSWORD_LENGTH })}
        </p>
      )}
      <PasswordBreachWarning breached={breached} />
      {children}
    </AuthPasswordField>
  );
}
