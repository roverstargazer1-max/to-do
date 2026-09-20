"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  Monitor,
  User,
  ArrowLeft,
  RotateCcw,
  Trash2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useSearchParams } from "next/navigation";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useUiStore, type GoalsState } from "@/lib/store/uiStore";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Target } from "lucide-react";
import { Vibrate } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAnchoredBack } from "@/lib/hooks/useBackAnchor";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClearGuestData,
  useResetDemoData,
} from "@/lib/hooks/useGuestStoreActions";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { LanguageSetting } from "@/components/settings/LanguageSetting";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PwaInstallRow } from "@/components/settings/PwaInstallRow";
import { DeleteUserDataDialog } from "@/components/settings/DeleteUserDataDialog";
import { BackupSyncSettings } from "@/components/settings/BackupSyncSettings";
import { AccountSection } from "@/components/settings/AccountSection";
import { PrivacySection } from "@/components/settings/PrivacySection";
import { useProfile } from "@/lib/hooks/useProfile";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangelogPopup } from "@/components/ui/ChangelogPopup";
import { AboutSheet } from "@/components/settings/AboutSheet";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { Info } from "lucide-react";

const SECTION_TAB_TRIGGER_CLASS =
  "rounded-md gap-2 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-seijaku-fast h-9 border border-transparent data-[state=active]:border-brand/20 text-muted-foreground hover:text-foreground hover:bg-secondary/40";
const DESKTOP_SECTION_TAB_TRIGGER_CLASS = cn(
  SECTION_TAB_TRIGGER_CLASS,
  "w-full justify-start text-left px-3.5",
);

// Preferences intentionally spans full width instead of this cap.
const SECTION_MAX_WIDTH = "max-w-5xl";

function AccountInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-secondary/30">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

interface SettingsClientProps {
  version: string;
}

export function SettingsClient({ version }: SettingsClientProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const hapticsEnabled = useUiStore((state) => state.hapticsEnabled);
  const setHapticsEnabled = useUiStore((state) => state.setHapticsEnabled);
  const timeFormat = useUiStore((state) => state.timeFormat);
  const setTimeFormat = useUiStore((state) => state.setTimeFormat);
  const goals = useUiStore((state) => state.goals);
  const setGoals = useUiStore((state) => state.setGoals);
  const { user, isGuestMode } = useAuth();
  const anchoredBack = useAnchoredBack();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const clearGuestData = useClearGuestData();
  const resetDemoData = useResetDemoData();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "appearance" | "preferences" | "account"
  >(() => {
    const tab = searchParams.get("tab");
    // "goals" folded into Preferences — keep old deep links working.
    if (tab === "goals" || tab === "preferences") return "preferences";
    if (tab === "account") return "account";
    return "appearance";
  });
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { trigger } = useHaptic();
  const { profile } = useProfile({ enabled: activeTab === "account" });

  const handleTabChange = (v: string) => {
    trigger("toggle");
    setActiveTab(v as "appearance" | "preferences" | "account");
  };

  const handleClearData = async () => {
    clearGuestData();
    await queryClient.invalidateQueries();
  };

  const themeOptions = [
    { value: "light", label: t("settings.appearance.themeLight"), icon: Sun },
    { value: "dark", label: t("settings.appearance.themeDark"), icon: Moon },
    {
      value: "system",
      label: t("settings.appearance.themeSystem"),
      icon: Monitor,
    },
  ];

  const sectionTabs = [
    { value: "appearance", label: t("settings.tab.appearance") },
    { value: "preferences", label: t("settings.tab.preferences") },
    { value: "account", label: t("settings.tab.account") },
  ] as const;

  return (
    <>
      <div className="flex flex-col min-h-[calc(100svh-4rem)] p-4 md:p-6 gap-6 md:gap-8 relative overflow-hidden scrollbar-hide">
        <div className="md:hidden">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onPointerDown={() => trigger("toggle")}
              onClick={anchoredBack}
              className="h-9 w-9 shadow-none transition-seijaku-fast"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t("settings.back")}</span>
            </Button>
            <h1 className="type-h1">{t("settings.title")}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.subtitle")}
          </p>
        </div>

        <div className="md:hidden sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 bg-secondary/10 p-1 rounded-lg h-11 border border-border/40 shadow-none">
              {sectionTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={SECTION_TAB_TRIGGER_CLASS}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="hidden md:block">
          <h1 className="type-h1 mb-1">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("settings.subtitle")}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start w-full flex-1">
          <aside className="hidden md:block w-56 shrink-0 sticky top-6">
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <TabsList className="flex flex-col h-auto w-full bg-transparent p-0 border-0 shadow-none gap-1">
                {sectionTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={DESKTOP_SECTION_TAB_TRIGGER_CLASS}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </aside>

          <Separator
            orientation="vertical"
            className="hidden md:block self-stretch bg-brand/20 shrink-0"
          />

          <main className="space-y-8 md:space-y-12 flex flex-col flex-1 min-w-0 max-w-6xl w-full">
            {activeTab === "appearance" && (
              <section className={cn("space-y-4", SECTION_MAX_WIDTH)}>
                <div>
                  <h2 className="type-h3">{t("settings.appearance.title")}</h2>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("settings.appearance.theme")}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = theme === option.value;

                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            trigger("toggle");
                            setTheme(option.value);
                          }}
                          className={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-seijaku-fast",
                            isActive
                              ? "border-brand bg-secondary/30"
                              : "border-border/50 hover:border-border bg-background",
                          )}
                        >
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <span
                            className={cn(
                              "text-sm font-medium",
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {activeTab === "preferences" && (
              <div className="grid gap-8 xl:grid-cols-2 xl:gap-6">
                <section className="space-y-4">
                  <div>
                    <h2 className="type-h3">
                      {t("settings.preferences.title")}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {!isDesktop && (
                      <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-secondary/30">
                            <Vibrate className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {t("settings.haptics.label")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.haptics.description")}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={hapticsEnabled}
                          onCheckedChange={setHapticsEnabled}
                        />
                      </div>
                    )}

                    <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-background">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-secondary/30">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {t("settings.timeFormat.label")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.timeFormat.description")}
                          </p>
                        </div>
                      </div>
                      <Tabs
                        value={timeFormat}
                        onValueChange={(v) => {
                          trigger("toggle");
                          setTimeFormat(v as "12h" | "24h" | "system");
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid grid-cols-3 bg-secondary/10 p-1 rounded-lg h-10 border border-border/40 shadow-none">
                          <TabsTrigger
                            value="12h"
                            className="rounded-md text-[13px] font-medium data-[state=active]:bg-brand data-[state=active]:text-brand-foreground transition-seijaku-fast"
                          >
                            {t("settings.timeFormat.12h")}
                          </TabsTrigger>
                          <TabsTrigger
                            value="24h"
                            className="rounded-md text-[13px] font-medium data-[state=active]:bg-brand data-[state=active]:text-brand-foreground transition-seijaku-fast"
                          >
                            {t("settings.timeFormat.24h")}
                          </TabsTrigger>
                          <TabsTrigger
                            value="system"
                            className="rounded-md text-[13px] font-medium data-[state=active]:bg-brand data-[state=active]:text-brand-foreground transition-seijaku-fast"
                          >
                            {t("settings.timeFormat.system")}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <LanguageSetting />

                    <NotificationSettings />

                    <PwaInstallRow />

                    <PrivacySection />
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="type-h3">{t("settings.goals.title")}</h2>
                  </div>

                  <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-background">
                    <div className="flex items-center gap-3 pb-1">
                      <div className="p-2 rounded-full bg-secondary/30">
                        <Target className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {t("settings.goals.label")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.goals.description")}
                        </p>
                      </div>
                    </div>

                    <GoalField
                      label={t("settings.goals.dailyFocusHours")}
                      placeholder={t("settings.goals.off")}
                      value={goals.dailyFocusHours}
                      onCommit={(v) => setGoals({ dailyFocusHours: v })}
                    />
                    <GoalField
                      label={t("settings.goals.weeklyFocusHours")}
                      placeholder={t("settings.goals.off")}
                      value={goals.weeklyFocusHours}
                      onCommit={(v) => setGoals({ weeklyFocusHours: v })}
                    />
                    <GoalField
                      label={t("settings.goals.dailyTasksCompleted")}
                      placeholder={t("settings.goals.off")}
                      value={goals.dailyTasksCompleted}
                      onCommit={(v) => setGoals({ dailyTasksCompleted: v })}
                    />
                    <GoalField
                      label={t("settings.goals.weeklyTasksCompleted")}
                      placeholder={t("settings.goals.off")}
                      value={goals.weeklyTasksCompleted}
                      onCommit={(v) => setGoals({ weeklyTasksCompleted: v })}
                    />
                  </div>
                </section>
              </div>
            )}

            {isGuestMode && activeTab === "account" && (
              <section className={cn("space-y-4", SECTION_MAX_WIDTH)}>
                <div>
                  <h2 className="type-h3">{t("settings.guest.title")}</h2>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-lg border border-brand/20 bg-brand/5">
                    <p className="text-xs text-muted-foreground mb-4">
                      {t("settings.guest.description")}
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            trigger("thud");
                            resetDemoData();
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          {t("settings.guest.resetDemo")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() => {
                            trigger("thud");
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                          <span>{t("settings.guest.clearData")}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "account" && (
              <section className={cn("space-y-4", SECTION_MAX_WIDTH)}>
                <div>
                  <h2 className="type-h3">{t("settings.account.title")}</h2>
                </div>

                <div className="space-y-3">
                  {profile?.display_name &&
                    profile.display_name !== user?.email && (
                      <AccountInfoRow
                        icon={User}
                        label={t("settings.account.name")}
                        value={profile.display_name}
                      />
                    )}

                  <AccountInfoRow
                    icon={User}
                    label={
                      process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER === "true"
                        ? "本地主账号"
                        : t("settings.account.email")
                    }
                    value={
                      process.env.NEXT_PUBLIC_LOCAL_SINGLE_USER === "true"
                        ? user?.email || "local-owner@kagelin.local"
                        : user?.email || t("settings.account.notSignedIn")
                    }
                  />

                  <AccountSection />
                </div>

                <BackupSyncSettings />
              </section>
            )}

            <div
              className={cn(
                "pt-16 pb-12 transition-all duration-300",
                SECTION_MAX_WIDTH,
              )}
            >
              <div className="border-t border-border/40 w-16 mx-auto mb-8 opacity-50" />
              <button
                type="button"
                onClick={() => {
                  trigger("toggle");
                  setIsAboutOpen(true);
                }}
                className="group mx-auto flex flex-col items-center gap-2 transition-seijaku-fast"
              >
                <div className="flex items-center gap-2">
                  <span className="type-micro text-muted-foreground/80 group-hover:text-foreground transition-colors">
                    Kagelin • v{version}
                  </span>
                  <PreviewBadge version={version} />
                </div>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors tracking-[0.04em] uppercase font-medium">
                  <Info className="h-2.5 w-2.5" />
                  {t("settings.about")}
                </span>
              </button>
            </div>
          </main>
        </div>
      </div>

      <DeleteUserDataDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleClearData}
      />

      <ChangelogPopup
        open={isChangelogOpen}
        onOpenChange={setIsChangelogOpen}
      />

      <AboutSheet
        open={isAboutOpen}
        onOpenChange={setIsAboutOpen}
        version={version}
        onOpenChangelog={() => {
          // Nested Radix dialogs are janky — hand off instead of stacking.
          setIsAboutOpen(false);
          setIsChangelogOpen(true);
        }}
      />
    </>
  );
}

interface GoalFieldProps {
  label: string;
  value: GoalsState[keyof GoalsState];
  placeholder: string;
  onCommit: (value: number | null) => void;
}

/** Local draft; commits to the store on blur. */
function GoalField({ label, value, placeholder, onCommit }: GoalFieldProps) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [prevValue, setPrevValue] = useState(value);

  // Resync on external store changes (e.g. demo reset), during render per
  // React's derived-state guidance rather than useEffect.
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value != null ? String(value) : "");
  }

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    onCommit(Number.isFinite(parsed) && parsed >= 0 ? parsed : null);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className="w-24 text-right"
      />
    </div>
  );
}
