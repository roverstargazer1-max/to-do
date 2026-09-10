import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageSetting } from "@/components/settings/LanguageSetting";
import { useUiStore } from "@/lib/store/uiStore";

// Radix Select needs the pointer-capture APIs jsdom lacks (same mock as
// CommandMenu.test.tsx). The trigger opens via fireEvent.pointerDown with
// an explicit pointerType "mouse"; SelectItem selects via fireEvent.click
// (React's delegated pointerup doesn't reach portal content in jsdom).
window.HTMLElement.prototype.releasePointerCapture = function () {};
window.HTMLElement.prototype.hasPointerCapture = function () {
  return false;
};
window.HTMLElement.prototype.scrollIntoView = function () {};

function openDropdown() {
  const trigger = screen.getByRole("combobox", { name: "Language" });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
}

async function chooseOption(name: string) {
  fireEvent.click(await screen.findByRole("option", { name }));
}

describe("LanguageSetting", () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ language: "en" });
  });

  afterEach(() => {
    useUiStore.setState({ language: "en" });
  });

  it("renders the Language row in English by default", () => {
    render(<LanguageSetting />);

    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Choose the display language")).toBeInTheDocument();
    // Trigger reflects the active language via SelectValue.
    expect(
      screen.getByRole("combobox", { name: "Language" }),
    ).toHaveTextContent("English");
  });

  it("lists both languages in their own script", async () => {
    render(<LanguageSetting />);
    openDropdown();

    expect(await screen.findByRole("option", { name: "English" }));
    expect(screen.getByRole("option", { name: "简体中文" }));
  });

  it("switching the select updates the store and persists it", async () => {
    render(<LanguageSetting />);
    openDropdown();

    await chooseOption("简体中文");

    expect(useUiStore.getState().language).toBe("zh-CN");
    const persisted = JSON.parse(
      localStorage.getItem("kanso-ui-state") ?? "{}",
    );
    expect(persisted.state.language).toBe("zh-CN");
  });

  it("renders the row in Chinese once zh-CN is active", () => {
    useUiStore.setState({ language: "zh-CN" });
    render(<LanguageSetting />);

    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(screen.getByText("选择界面显示语言")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "语言" })).toHaveTextContent(
      "简体中文",
    );
  });

  it("flips the row instantly when the language changes in the store", () => {
    render(<LanguageSetting />);
    expect(screen.getByText("Language")).toBeInTheDocument();

    act(() => {
      useUiStore.getState().setLanguage?.("zh-CN");
    });
    expect(screen.getByText("语言")).toBeInTheDocument();
  });
});
