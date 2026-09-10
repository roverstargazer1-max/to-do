"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Calendar, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";

const navItems: {
  labelKey: TranslationKey;
  icon: typeof CheckSquare;
  path: string;
}[] = [
  { labelKey: "common.nav.allTasks", icon: CheckSquare, path: "/" },
  { labelKey: "common.nav.calendar", icon: Calendar, path: "/calendar" },
  { labelKey: "common.nav.stats", icon: BarChart3, path: "/stats" },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { trigger, isPhone } = useHaptic();
  const { t } = useTranslation();

  // Prefetch all routes on mount for instant navigation
  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.path));
  }, [router]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-sidebar md:hidden nav-safe-bottom">
      <div className="flex items-stretch justify-around h-[var(--mobile-nav-content-height)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <motion.button
              key={item.path}
              onTapStart={() => trigger("toggle")} // Subtle vibration for nav
              whileTap={isPhone ? { scale: 0.95 } : {}}
              onClick={() => router.push(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 gap-1 py-[var(--mobile-nav-item-pad)] transition-colors cursor-pointer outline-none",
                isActive
                  ? "text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium leading-4">
                {t(item.labelKey)}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
