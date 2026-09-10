/**
 * Error classification utilities for the uhabits import flow.
 *
 * Separates WASM initialization failures (infrastructure) from schema/data
 * errors so the UI can surface an actionable message.
 */

import type { TranslationKey } from "@/lib/i18n/dictionaries/en";

// These are dictionary keys, not display strings — the hook layer resolves
// them with tr() so the import toasts follow the active UI language. The
// exported names keep their *_MESSAGE suffix for continuity.
export const WASM_ERROR_MESSAGE: TranslationKey = "habits.import.wasmError";

export const SCHEMA_ERROR_MESSAGE: TranslationKey = "habits.import.schemaError";

export const SAVE_ERROR_MESSAGE: TranslationKey = "habits.import.saveError";

/**
 * Patterns that indicate a WASM loading failure rather than a db schema error.
 *
 * The magic-word/MIME entries catch the case where the wasm request is served
 * something else (e.g. an HTML login page) and the browser tries to compile it:
 * `3c 21 44 4f` is `<!DO`, the opening of `<!DOCTYPE html>`.
 */
const WASM_ERROR_PATTERNS = [
  "wasm streaming compile failed",
  "both async and sync fetching of the wasm failed",
  "failed to asynchronously prepare wasm",
  "aborted(both async and sync fetching",
  "expected magic word",
  "failed to match magic number",
  "wasm validation error",
  "unsupported mime type",
  "incorrect response mime type",
  "application/wasm",
];

/**
 * Classify an error thrown during uhabits import.
 *
 * Returns `WASM_ERROR_MESSAGE` when the error is a WASM loading failure,
 * `SCHEMA_ERROR_MESSAGE` for any other error (wrong schema, corrupt file, etc.).
 */
export function classifyUhabitsError(err: unknown): TranslationKey {
  if (!(err instanceof Error)) return SCHEMA_ERROR_MESSAGE;

  const msg = err.message.toLowerCase();
  if (WASM_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))) {
    return WASM_ERROR_MESSAGE;
  }

  return SCHEMA_ERROR_MESSAGE;
}
