import { PRIVACY_URL } from "@/lib/links";
import { useTranslation } from "@/lib/i18n/useTranslation";

export function PrivacyPolicyLink() {
  const { t } = useTranslation();
  return (
    <a
      href={PRIVACY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {t("auth.legal.privacy")}
    </a>
  );
}
