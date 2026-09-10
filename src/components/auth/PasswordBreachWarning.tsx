import { useTranslation } from "@/lib/i18n/useTranslation";

export function PasswordBreachWarning({ breached }: { breached: boolean }) {
  const { t } = useTranslation();
  if (!breached) return null;

  return (
    <p className="text-xs text-amber-600 dark:text-amber-500">
      {t("auth.password.breachWarning")}
    </p>
  );
}
