import { afterEach, describe, expect, it, vi } from "vitest";
import { detectInitialLanguage } from "@/lib/i18n/detect";

describe("detectInitialLanguage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns en when navigator is unavailable (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectInitialLanguage()).toBe("en");
  });

  it.each(["zh", "zh-CN", "zh-TW", "zh-Hans-CN", "ZH-Hans"])(
    "maps navigator.language %s to zh-CN",
    (language) => {
      vi.stubGlobal("navigator", { language });
      expect(detectInitialLanguage()).toBe("zh-CN");
    },
  );

  it.each(["en", "en-US", "fr-FR", "ja-JP"])(
    "maps navigator.language %s to en",
    (language) => {
      vi.stubGlobal("navigator", { language });
      expect(detectInitialLanguage()).toBe("en");
    },
  );

  it("returns en when navigator.language is empty", () => {
    vi.stubGlobal("navigator", { language: "" });
    expect(detectInitialLanguage()).toBe("en");
  });
});
