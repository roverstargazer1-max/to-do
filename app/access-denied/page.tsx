"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { slideUp } from "@/lib/motion";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function AccessDeniedPage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div {...slideUp} className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive-surface flex items-center justify-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <h1 className="text-3xl font-semibold">
          {t("common.accessDenied.title")}
        </h1>

        <p className="text-muted-foreground max-w-md">
          {t("common.accessDenied.description")}
        </p>

        <Button variant="outline" onClick={() => router.push("/login")}>
          {t("common.accessDenied.backToLogin")}
        </Button>
      </motion.div>
    </div>
  );
}
