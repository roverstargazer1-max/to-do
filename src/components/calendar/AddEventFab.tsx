"use client";

import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface AddEventFabProps {
  onClick: () => void;
}

export default function AddEventFab({ onClick }: AddEventFabProps) {
  const { trigger, isPhone } = useHaptic();
  const { t } = useTranslation();

  return (
    <motion.button
      onTapStart={() => trigger("thud")}
      whileTap={isPhone ? { scale: 0.95 } : {}}
      onClick={onClick}
      className={cn(
        buttonVariants({ size: "lg" }),
        "fixed right-6 h-12 w-12 rounded-xl shadow-lg md:hidden cursor-pointer z-40 will-change-transform",
        "[@media(max-height:400px)]:right-3 [@media(max-height:400px)]:h-10 [@media(max-height:400px)]:w-10",
      )}
      style={{
        bottom: "calc(var(--mobile-nav-height) + 0.75rem)",
      }}
      aria-label={t("calendar.event.create")}
    >
      <Plus className="h-5 w-5 [@media(max-height:400px)]:h-4 [@media(max-height:400px)]:w-4" />
    </motion.button>
  );
}
