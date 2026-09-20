import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * zh-CN rendering smoke tests (ticket 09).
 *
 * The suite runs in English by default and keeps asserting English strings;
 * these tests are the only ones that flip the store to zh-CN and assert the
 * visible Chinese copy — one representative surface per UI area. They assert
 * DOM-visible text only (matching the repo's convention) and never touch
 * existing tests.
 *
 * Switching is instant and in-memory (spec D-09), so setting the language on
 * the store before render is exactly what the Preferences control does.
 */
import { useUiStore } from "@/lib/store/uiStore";

// Radix primitives need the pointer-capture APIs jsdom lacks.
window.HTMLElement.prototype.releasePointerCapture = function () {};
window.HTMLElement.prototype.hasPointerCapture = function () {
  return false;
};
window.HTMLElement.prototype.scrollIntoView = function () {};

import { LanguageSetting } from "@/components/settings/LanguageSetting";
import { PrivacySection } from "@/components/settings/PrivacySection";
import { PwaInstallRow } from "@/components/settings/PwaInstallRow";
import { NodeOrphanBody } from "@/components/workspace/NodeOrphanBody";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { BetaBadge } from "@/components/ui/beta-badge";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { ColorPicker } from "@/components/shared/ColorPicker";
import { Calendar } from "@/components/ui/calendar";
import { formatLongMonthDay } from "@/lib/i18n/date-format";
import { en } from "@/lib/i18n/dictionaries/en";
import { zhCN } from "@/lib/i18n/dictionaries/zh-CN";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("zh-CN rendering smoke tests", () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ language: "zh-CN" });
  });

  afterEach(() => {
    useUiStore.setState({ language: "en" });
    vi.restoreAllMocks();
  });

  it("settings: the Language row renders Chinese labels", () => {
    renderWithProviders(<LanguageSetting />);

    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(screen.getByText("选择界面显示语言")).toBeInTheDocument();
    // Language names render in their own script, never translated.
    expect(screen.getByRole("combobox", { name: "语言" })).toHaveTextContent(
      "简体中文",
    );
  });

  it("settings: privacy copy resolves to Chinese", () => {
    renderWithProviders(<PrivacySection />);

    expect(screen.getByText("共享匿名遥测数据")).toBeInTheDocument();
  });

  it("settings: the PWA install row renders Chinese actions", () => {
    // The row gates on install eligibility; an iOS UA is the stable signal
    // jsdom can emulate (desktop Chrome has no install-prompt support flag).
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    renderWithProviders(<PwaInstallRow />);

    expect(screen.getByText("如何操作")).toBeInTheDocument();
  });

  it("workspace: the orphan body interpolates the label in Chinese", () => {
    renderWithProviders(<NodeOrphanBody lostLabel="任务" />);

    // Verbatim glossary: Node → 节点.
    expect(screen.getByText("任务已删除——此节点已孤立。")).toBeInTheDocument();
  });

  it("flips a surface from English to Chinese without remounting", () => {
    useUiStore.setState({ language: "en" });
    renderWithProviders(<LanguageSetting />);
    expect(screen.getByText("Language")).toBeInTheDocument();

    act(() => {
      useUiStore.getState().setLanguage?.("zh-CN");
    });
    expect(screen.getByText("语言")).toBeInTheDocument();
  });

  it("banner: the offline indicator renders Chinese copy", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    renderWithProviders(<OfflineIndicator />);

    expect(screen.getByText("当前离线")).toBeInTheDocument();
    expect(screen.getByText("恢复网络后将自动同步更改")).toBeInTheDocument();
  });

  it("badges: Beta and Preview resolve to Chinese", () => {
    const first = renderWithProviders(<BetaBadge />);
    expect(screen.getByText("测试版")).toBeInTheDocument();
    first.unmount();

    renderWithProviders(<PreviewBadge version="1.0.0-preview.1" />);
    expect(screen.getByText("预览版")).toBeInTheDocument();
  });

  it("color picker: the default label follows the locale", () => {
    renderWithProviders(<ColorPicker value="#ff0000" onChange={() => {}} />);

    expect(screen.getByText("颜色")).toBeInTheDocument();
  });

  it("dictionary: banner, toast and dialog keys are translated", () => {
    // DemoBar renders the surface from the reported screenshot; it needs
    // AuthProvider + QueryClient, so assert its keys rather than mounting it.
    expect(zhCN["common.demo.message"]).toBe("你正在浏览演示数据");
    expect(zhCN["common.demo.startFresh"]).toBe("重新开始");

    // useWeeklyBackup / useAccountData / useDocumentPiP / nlp-event.
    expect(zhCN["common.backup.reminder"]).toContain("立即备份");
    expect(zhCN["common.backup.backUpNow"]).toBe("立即备份");
    expect(zhCN["common.account.exportSuccess"]).toBe("数据导出成功");
    expect(zhCN["common.pip.focusTimer"]).toBe("专注计时器");
    expect(zhCN["common.untitledEvent"]).toBe("未命名事件");

    // Settings dialogs wired in the follow-up pass.
    expect(zhCN["settings.deleteData.typeSuffix"]).toBe("以确认");
    expect(zhCN["settings.import.select"]).toBe("选择");
    expect(zhCN["settings.backup.importOtherApps"]).toBe("从其他应用导入");
    expect(zhCN["settings.notifications.push.guestTooltip"]).toBe(
      "仅对注册用户可用",
    );
  });

  it("dictionary: every key is translated except the documented allowlist", () => {
    // A value identical to English means either an untranslated leftover or a
    // deliberate non-translation. The allowlist is asserted exactly, so a new
    // identical pair fails this test until it is translated or justified.
    const ALLOWLIST = new Set([
      "common.appTitle", // Kagelin is never translated (spec)
      "settings.backup.tab.webdav", // protocol name
      "settings.import.loopHabits", // third-party product name
      "habits.options.loop", // third-party product name
      "calendar.event.location.googleMeet", // third-party product name
      "settings.deleteData.typeWord", // typed token must stay Latin
      "auth.email.placeholder", // locale-neutral example address
    ]);

    const identical = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => en[key] === zhCN[key],
    );

    expect(new Set(identical)).toEqual(ALLOWLIST);
  });

  it("dates: month and weekday names follow the locale", () => {
    const d = new Date(2024, 0, 1);
    expect(formatLongMonthDay(d, "en")).toBe("January 1");
    expect(formatLongMonthDay(d, "zh-CN")).toBe("1月1日");
  });

  it("calendar: the grid follows the locale, English stays untouched", () => {
    const headers = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("th")).map((c) => c.textContent);
    const caption = (container: HTMLElement) =>
      container.querySelector(".rdp-caption_label")?.textContent;

    // English baseline: Sunday-first, abbreviated — unchanged by this work.
    useUiStore.setState({ language: "en" });
    const en = renderWithProviders(<Calendar month={new Date(2024, 0, 1)} />);
    expect(headers(en.container)).toEqual([
      "Su",
      "Mo",
      "Tu",
      "We",
      "Th",
      "Fr",
      "Sa",
    ]);
    expect(caption(en.container)).toBe("January 2024");
    en.unmount();

    // zh-CN: named in Chinese and starting the week on Monday.
    useUiStore.setState({ language: "zh-CN" });
    const zh = renderWithProviders(<Calendar month={new Date(2024, 0, 1)} />);
    expect(headers(zh.container)).toEqual([
      "\u4e00",
      "\u4e8c",
      "\u4e09",
      "\u56db",
      "\u4e94",
      "\u516d",
      "\u65e5",
    ]);
    expect(caption(zh.container)).toBe("2024\u5e741\u6708");
  });

  it("dictionary: zh-CN declares the same key set as English", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });
});
