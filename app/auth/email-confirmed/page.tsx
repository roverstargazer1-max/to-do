"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthConfirmationCard } from "@/components/auth/AuthConfirmationCard";
import { AuthShell } from "@/components/auth/AuthShell";
import { trackSignupCompleted } from "@/lib/telemetry/client";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function EmailConfirmedPage() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    trackSignupCompleted();
  }, []);

  return (
    <AuthShell>
      <AuthConfirmationCard
        motionKey="email-confirmed"
        title={t("auth.emailConfirmed.title")}
        description={t("auth.emailConfirmed.description")}
        actionLabel={t("auth.action.signIn")}
        onAction={() => router.push("/login")}
      />
    </AuthShell>
  );
}
