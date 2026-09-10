import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { zhCN } from "@/lib/i18n/dictionaries/zh-CN";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { translate } from "@/lib/i18n/translate";

describe("translate", () => {
  it("looks up a plain string value", () => {
    expect(translate("common.cancel", undefined, en)).toBe("Cancel");
    expect(translate("common.cancel", undefined, zhCN)).toBe("取消");
  });

  it("interpolates {param} placeholders in string values", () => {
    const dictionary = { greet: "Hi {name}, {count} left" };
    expect(translate("greet", { name: "Ada", count: 2 }, dictionary)).toBe(
      "Hi Ada, 2 left",
    );
  });

  it("passes params to function values (pluralization)", () => {
    expect(translate("common.itemCount", { count: 3 }, en)).toBe("3 items");
    expect(translate("common.itemCount", { count: 1 }, en)).toBe("1 item");
    expect(translate("common.itemCount", { count: 3 }, zhCN)).toBe("3 项");
  });

  it("falls back to English when zh-CN is missing a key (merge order)", () => {
    // Simulate a zh-CN dictionary that lost a key: the { ...en, ...zh }
    // merge must resolve it to the English string (spec D-03).
    const partialZh: Partial<Dictionary> = { ...zhCN };
    delete partialZh["common.cancel"];
    const effective = { ...en, ...partialZh };
    expect(translate("common.cancel", undefined, effective)).toBe("Cancel");
  });

  it("returns the raw key as the dead-last resort", () => {
    expect(translate("missing.key", undefined, {})).toBe("missing.key");
  });

  it("keeps placeholders without a matching param intact", () => {
    expect(translate("greet", undefined, { greet: "Hi {name}" })).toBe(
      "Hi {name}",
    );
  });
});
