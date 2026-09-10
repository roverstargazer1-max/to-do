"use client";

import {
  Bell,
  BellOff,
  Globe,
  Coffee,
  Moon,
  Calendar,
  Clock,
  Timer,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useProfile } from "@/lib/hooks/useProfile";
import { useAuth } from "@/components/AuthProvider";
import { notify } from "@/lib/notify";
import { sendPushNotification } from "@/lib/push-api";
import { useAndroidBatteryHint } from "@/lib/hooks/useAndroidBatteryHint";
import { AndroidBatteryHint } from "@/components/settings/AndroidBatteryHint";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tr } from "@/lib/i18n/tr";
import { isIOS, isStandalone } from "@/lib/utils/platform";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo } from "react";

const getInitialTimezones = () => {
  if (typeof window === "undefined")
    return ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
  try {
    return (
      Intl as unknown as { supportedValuesOf: (key: string) => string[] }
    ).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
  }
};

export function NotificationSettings() {
  const {
    isSupported,
    permission,
    notificationsEnabled,
    isSyncing,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    showNotification,
  } = usePushNotifications();
  const { isGuestMode } = useAuth();
  const { profile, updateProfile, updateSettings } = useProfile();
  const { trigger } = useHaptic();
  const { localeTag } = useDateFormatter();
  const { t } = useTranslation();

  const [timezones] = useState<string[]>(getInitialTimezones);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  const {
    isAndroidChromeBrowser,
    isOpen: batteryHintOpen,
    promptIfDue: promptBatteryHintIfDue,
    dismiss: handleDismissBatteryHint,
    reopen: handleReopenBatteryHint,
  } = useAndroidBatteryHint();

  const timezoneOptions = useMemo(() => {
    const now = new Date();
    return timezones.map((tz) => {
      try {
        const formatter = new Intl.DateTimeFormat(localeTag, {
          timeZone: tz,
          timeZoneName: "shortOffset",
        });
        const parts = formatter.formatToParts(now);
        const offset =
          parts.find((p) => p.type === "timeZoneName")?.value || "";
        return {
          id: tz,
          label: tz.replace(/_/g, " "),
          offset: offset.replace("GMT", "UTC"),
          searchable: `${tz} ${offset}`.toLowerCase().replace(/[_/]/g, " "),
        };
      } catch {
        return {
          id: tz,
          label: tz.replace(/_/g, " "),
          offset: "",
          searchable: tz.toLowerCase().replace(/[_/]/g, " "),
        };
      }
    });
  }, [timezones, localeTag]);

  // Keeps the current selection visible even if search/pagination would cut it.
  const filteredTimezones = useMemo(() => {
    const search = timezoneSearch.toLowerCase().trim();
    const currentTz = profile?.timezone || "UTC";

    const results = search
      ? timezoneOptions.filter((opt) => opt.searchable.includes(search))
      : timezoneOptions;

    const topResults = results.slice(0, 100);
    const isSelectedInTop = topResults.some((opt) => opt.id === currentTz);

    if (!isSelectedInTop) {
      const selectedOpt = results.find((opt) => opt.id === currentTz);
      if (selectedOpt) {
        return [selectedOpt, ...topResults];
      }
    }

    return topResults;
  }, [timezoneOptions, timezoneSearch, profile?.timezone]);

  const handleTogglePush = async (checked: boolean) => {
    if (isSyncing) return;
    trigger("toggle");

    if (!isSupported) {
      notify.error(tr("settings.notifications.toast.unsupported"));
      return;
    }

    if (checked) {
      const result = await requestPermission({ forceRefresh: true });
      if (result.permission === "granted" && result.subscription) {
        notify.success(tr("settings.notifications.toast.enabled"));
        promptBatteryHintIfDue();
      } else if (result.permission === "denied") {
        notify.error(tr("settings.notifications.toast.denied"));
      } else {
        notify.error(tr("settings.notifications.toast.activateFailed"));
      }
    } else {
      await unsubscribe();
      notify.success(tr("settings.notifications.toast.disabled"));
    }
  };

  const updateNotifySetting = async (key: string, checked: boolean) => {
    trigger("tick");
    try {
      await updateSettings.mutateAsync({
        notifications: {
          ...profile?.settings?.notifications,
          [key]: checked,
        },
      } as Parameters<typeof updateSettings.mutateAsync>[0]);
    } catch {
      notify.error(tr("settings.notifications.toast.updateFailed"));
    }
  };

  const handleTestNotification = async () => {
    trigger("toggle");
    if (permission !== "granted") {
      notify.error(tr("settings.notifications.toast.enableFirst"));
      return;
    }

    try {
      const activeSubscription = await subscribeToPush("granted", {
        forceRefresh: true,
      });

      if (!activeSubscription) {
        notify.error(tr("settings.notifications.toast.refreshFailed"));
        return;
      }

      await sendPushNotification({
        endpoint: activeSubscription.endpoint,
        title: tr("settings.notifications.test.title"),
        body: tr("settings.notifications.test.body"),
        data: { type: "test" },
      });
      notify.success(tr("settings.notifications.toast.testSent"));
    } catch {
      notify.error(tr("settings.notifications.toast.testFailed"));
    }
  };

  const handleLocalTestNotification = () => {
    trigger("toggle");
    if (permission !== "granted") {
      notify.error(tr("settings.notifications.toast.enableFirst"));
      return;
    }

    showNotification(tr("settings.notifications.test.localTitle"), {
      body: tr("settings.notifications.test.localBody"),
      tag: "kanso-local-test",
    });
    notify.success(tr("settings.notifications.toast.localTriggered"));
  };

  if (!isSupported) {
    // iOS only exposes push APIs once installed to the Home Screen — "not
    // supported" here means the browser tab, not the device.
    const iosNeedsInstall = isIOS() && !isStandalone();

    return (
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
        <div className="flex items-center gap-3 mb-2">
          <BellOff className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            {iosNeedsInstall
              ? "Add Kagelin to your Home Screen to turn on notifications"
              : "Notifications Not Supported"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {iosNeedsInstall
            ? "Tap Share, then Add to Home Screen."
            : "Your browser doesn't support push notifications"}
        </p>
      </div>
    );
  }

  const settings = profile?.settings?.notifications;
  const showBatteryHintArea =
    isAndroidChromeBrowser &&
    !isGuestMode &&
    permission === "granted" &&
    notificationsEnabled;

  return (
    <div className="space-y-6">
      {/* 1. Master Toggle */}
      <div className="space-y-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-secondary/30">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("settings.notifications.push.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isGuestMode
                      ? t("settings.notifications.push.guestHint")
                      : permission === "granted"
                        ? t("settings.notifications.push.grantedHint")
                        : t("settings.notifications.push.enableHint")}
                  </p>
                </div>
              </div>
              <Switch
                checked={
                  !isGuestMode &&
                  notificationsEnabled &&
                  permission === "granted"
                }
                onCheckedChange={handleTogglePush}
                disabled={isGuestMode || permission === "denied" || isSyncing}
                aria-label={t("settings.notifications.push.title")}
              />
            </div>
          </TooltipTrigger>
          {isGuestMode && (
            <TooltipContent className="hidden md:block">
              {t("settings.notifications.push.guestTooltip")}
            </TooltipContent>
          )}
        </Tooltip>
        {!isGuestMode &&
          permission === "granted" &&
          notificationsEnabled &&
          !isSyncing && (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleTestNotification}
              >
                <Bell className="h-4 w-4 mr-2" />
                {t("settings.notifications.sendTest")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] text-muted-foreground hover:text-foreground h-7"
                onClick={handleLocalTestNotification}
              >
                {t("settings.notifications.triggerLocal")}
              </Button>
            </div>
          )}
        {showBatteryHintArea &&
          (batteryHintOpen ? (
            <AndroidBatteryHint onDismiss={handleDismissBatteryHint} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[10px] text-muted-foreground hover:text-foreground h-7"
              onClick={handleReopenBatteryHint}
            >
              {t("settings.notifications.androidLate")}
            </Button>
          ))}
      </div>

      {/* 2. Timezone Selection */}
      {!isGuestMode && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("settings.notifications.localTime.title")}
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("settings.notifications.localTime.description")}
            </p>
            <Select
              value={profile?.timezone || "UTC"}
              onValueChange={(val) => {
                trigger("toggle");
                updateProfile.mutate({ timezone: val });
                setTimezoneSearch("");
              }}
            >
              <SelectTrigger
                className="w-full"
                aria-label={t("settings.notifications.timezone.select")}
              >
                <SelectValue
                  placeholder={t("settings.notifications.timezone.select")}
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] w-[--radix-select-trigger-width]">
                <div className="sticky top-0 z-10 bg-popover px-2 py-2 pt-4 border-b border-border/50">
                  <input
                    type="text"
                    placeholder={t(
                      "settings.notifications.timezone.searchPlaceholder",
                    )}
                    aria-label={t("settings.notifications.timezone.search")}
                    value={timezoneSearch}
                    onChange={(e) => setTimezoneSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // Prevent Radix Select from intercepting key events
                      e.stopPropagation();
                    }}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div className="overflow-y-auto max-h-[240px]">
                  {filteredTimezones.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      {t("settings.notifications.timezone.empty")}
                    </div>
                  ) : (
                    filteredTimezones.map((tz) => {
                      return (
                        <SelectItem key={tz.id} value={tz.id}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="truncate">{tz.label}</span>
                            {tz.offset && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">
                                {tz.offset}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </div>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* 3. Detailed Schedules */}
      {permission === "granted" && notificationsEnabled && !isGuestMode && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("settings.notifications.schedules.title")}
            </h3>
          </div>

          <div className="space-y-2">
            <ToggleRow
              icon={Coffee}
              title={t("settings.notifications.schedules.morningTitle")}
              description={t(
                "settings.notifications.schedules.morningDescription",
              )}
              checked={settings?.morning_briefing ?? true}
              onChange={(c) => updateNotifySetting("morning_briefing", c)}
            />

            <ToggleRow
              icon={Moon}
              title={t("settings.notifications.schedules.eveningTitle")}
              description={t(
                "settings.notifications.schedules.eveningDescription",
              )}
              checked={settings?.evening_plan ?? true}
              onChange={(c) => updateNotifySetting("evening_plan", c)}
            />

            <ToggleRow
              icon={Calendar}
              title={t("settings.notifications.schedules.dueTitle")}
              description={t("settings.notifications.schedules.dueDescription")}
              checked={settings?.due_date_alerts ?? true}
              onChange={(c) => updateNotifySetting("due_date_alerts", c)}
            />

            <ToggleRow
              icon={Timer}
              title={t("settings.notifications.schedules.timerTitle")}
              description={t(
                "settings.notifications.schedules.timerDescription",
              )}
              checked={settings?.timer_alerts ?? true}
              onChange={(c) => updateNotifySetting("timer_alerts", c)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
