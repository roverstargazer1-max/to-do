/**
 * Core i18n types (spec `.scratch/i18n/spec.md`, technical decision 7).
 * Kept dependency-free so dictionary modules can import from here without
 * cycles.
 */

/** BCP-47 codes supported by the UI. Room for more locales later (D-01). */
export type Locale = "en" | "zh-CN";

/** Interpolation params for `{placeholder}` templates and fn values. */
export type TranslationParams = Record<string, string | number>;

/**
 * A dictionary entry: a literal string, or a params-aware function —
 * English pluralization needs params; Chinese never does (D-07).
 */
export type DictionaryValue = string | ((params: TranslationParams) => string);
