import type { DictionaryValue, TranslationParams } from "./types";

/** Substitutes `{name}` placeholders with the matching params. */
function interpolate(
  template: string,
  params: TranslationParams | undefined,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

/**
 * Resolves `key` against `dictionary` with `{param}` interpolation.
 * Function values receive the params object directly (pluralization).
 *
 * The raw key is the dead-last resort — only reachable against partial
 * dictionaries; the compiled `Dictionary` type plus the
 * `{ ...en, ...zhCN }` merge make it unreachable in the app (spec D-03).
 */
export function translate(
  key: string,
  params: TranslationParams | undefined,
  dictionary: Readonly<Record<string, DictionaryValue | undefined>>,
): string {
  const value = dictionary[key];
  if (typeof value === "function") return value(params ?? {});
  if (typeof value === "string") return interpolate(value, params);
  return key;
}
