import type { DictionaryValue } from "../../types";

/**
 * English `changelog` module — the "What's New" dialog chrome (ticket 04).
 * The release-notes entries themselves are server data and stay English.
 */
export const changelog = {
  "changelog.title": "What's New",
  "changelog.recentChanges": "Recent changes",
  "changelog.noEntries": "No changelog entries found.",
  "changelog.noChanges": "No user-facing changes in this build.",
} satisfies Record<string, DictionaryValue>;
