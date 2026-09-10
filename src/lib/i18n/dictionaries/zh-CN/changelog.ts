import type { DictionaryValue } from "../../types";

/**
 * zh-CN `changelog` module — mirrors `dictionaries/en/changelog.ts`
 * exactly. Release-notes entries are server data and stay English.
 */
export const changelog = {
  "changelog.title": "新功能",
  "changelog.recentChanges": "近期更新",
  "changelog.noEntries": "未找到更新日志。",
  "changelog.noChanges": "此版本没有面向用户的变更。",
} satisfies Record<string, DictionaryValue>;
