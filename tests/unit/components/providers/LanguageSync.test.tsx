import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { LanguageSync } from "@/components/providers/LanguageSync";
import { useUiStore } from "@/lib/store/uiStore";

describe("LanguageSync", () => {
  beforeEach(() => {
    useUiStore.setState({ language: "en" });
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    useUiStore.setState({ language: "en" });
    document.documentElement.lang = "en";
  });

  it("keeps <html lang> at en for English", () => {
    render(<LanguageSync />);
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("Kagelin");
  });

  it("syncs <html lang> and document.title for zh-CN", () => {
    useUiStore.setState({ language: "zh-CN" });
    render(<LanguageSync />);
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("Kagelin");
  });

  it("re-syncs when the language changes", () => {
    render(<LanguageSync />);
    expect(document.documentElement.lang).toBe("en");

    act(() => {
      useUiStore.getState().setLanguage?.("zh-CN");
    });
    expect(document.documentElement.lang).toBe("zh-CN");

    act(() => {
      useUiStore.getState().setLanguage?.("en");
    });
    expect(document.documentElement.lang).toBe("en");
  });
});
