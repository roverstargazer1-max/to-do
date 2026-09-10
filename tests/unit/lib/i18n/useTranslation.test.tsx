import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useUiStore } from "@/lib/store/uiStore";

function Probe() {
  const { t } = useTranslation();
  return <>{t("common.ok")}</>;
}

describe("useTranslation", () => {
  beforeEach(() => {
    useUiStore.setState({ language: "en" });
  });

  it("translates with the active store language after mount", () => {
    useUiStore.setState({ language: "zh-CN" });
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("common.ok")).toBe("确定");
    expect(result.current.t("common.itemCount", { count: 3 })).toBe("3 项");
  });

  it("flips instantly when the language changes (no reload)", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("common.ok")).toBe("OK");

    act(() => {
      useUiStore.getState().setLanguage?.("zh-CN");
    });
    expect(result.current.t("common.ok")).toBe("确定");

    act(() => {
      useUiStore.getState().setLanguage?.("en");
    });
    expect(result.current.t("common.ok")).toBe("OK");
  });

  it("exposes the active language", () => {
    useUiStore.setState({ language: "zh-CN" });
    const { result } = renderHook(() => useTranslation());
    expect(result.current.language).toBe("zh-CN");
  });

  it("renders English during SSR and the hydration render (spec D-08)", () => {
    // With a Chinese language active in the store, the server render must
    // still emit English so hydration matches — the accepted flash.
    useUiStore.setState({ language: "zh-CN" });
    expect(renderToString(<Probe />)).toBe("OK");
  });
});
