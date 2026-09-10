"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { slideUp } from "@/lib/motion";
import * as Sentry from "@sentry/nextjs";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    console.error("Unhandled render error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div {...slideUp} className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive-surface flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <h1 className="text-3xl font-semibold">{t("common.error.title")}</h1>

        <p className="text-muted-foreground max-w-md">
          {t("common.error.description")}
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.push("/")}>
            {t("common.error.goHome")}
          </Button>
          <Button onClick={() => reset()}>{t("common.error.tryAgain")}</Button>
        </div>
      </motion.div>
    </div>
  );
}
