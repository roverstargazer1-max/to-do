import { get, set } from "idb-keyval";

const STORE_KEY = "kanso_import_sources";

export interface ImportSourcePayload {
  source_app: string;
  file_name: string | null;
  raw: unknown;
}

interface StoredImportSource extends ImportSourcePayload {
  captured_at: string;
}

/** Persist the raw import source for round-trip export (ADR 0006). */
export async function persistImportSource(
  payload: ImportSourcePayload,
): Promise<void> {
  const record: StoredImportSource = {
    ...payload,
    captured_at: new Date().toISOString(),
  };
  const existing = (await get<StoredImportSource[]>(STORE_KEY)) ?? [];
  await set(STORE_KEY, [...existing, record]);
}
