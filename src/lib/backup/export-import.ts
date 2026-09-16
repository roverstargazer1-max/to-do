import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { BackupData } from "./types";
import type { VisualAssetVersion } from "@/lib/types/visual";
import { calculateVisualSha256 } from "@/lib/visual/validation";
import { generateICS } from "@/lib/utils/ics-generator";
import { toCalendarEventUI } from "@/lib/types/calendar-event";

/**
 * Create a ZIP archive containing backup.json and calendars/kanso-events.ics
 */
export async function createBackupZip(data: BackupData): Promise<Blob> {
  const files = Object.create(null) as Record<string, Uint8Array>;
  const visualFiles = data.visual_asset_files ?? {};
  const visualVersions = (data.visual_asset_versions ?? []).map((version) => {
    const { data: _data, ...metadata } = version as VisualAssetVersion;
    return metadata;
  });
  const visualManifest =
    data.visual_asset_manifest ??
    visualVersions.map((version) => ({
      versionId: version.id,
      assetId: version.asset_id,
      path: `visual-assets/${version.id}.bin`,
      byteSize: version.byte_size,
      sha256: version.sha256,
      mimeType: version.mime_type,
    }));

  if ((data.visual_assets?.length ?? 0) > 0 && visualVersions.length === 0) {
    throw new Error(
      "Visual asset Backup is incomplete: asset versions are missing.",
    );
  }
  const versionIds = new Set(visualVersions.map((version) => version.id));
  if (
    visualManifest.length !== versionIds.size ||
    visualManifest.some((entry) => !versionIds.has(entry.versionId))
  ) {
    throw new Error(
      "Visual asset Backup manifest does not cover every version.",
    );
  }
  const seenPaths = new Set<string>();
  for (const entry of visualManifest) {
    if (
      !entry.path.startsWith("visual-assets/") ||
      entry.path.includes("..") ||
      seenPaths.has(entry.path) ||
      !versionIds.has(entry.versionId)
    ) {
      throw new Error(
        `Visual asset Backup manifest entry is invalid: ${entry.versionId}.`,
      );
    }
    seenPaths.add(entry.path);
    const bytes = visualFiles[entry.versionId] ?? visualFiles[entry.path];
    if (!bytes) {
      throw new Error(
        `Visual asset Backup is missing bytes for version "${entry.versionId}".`,
      );
    }
    if (bytes.length !== entry.byteSize) {
      throw new Error(
        `Visual asset Backup byte size mismatch for version "${entry.versionId}".`,
      );
    }
    const digest = await calculateVisualSha256(bytes);
    if (digest !== entry.sha256) {
      throw new Error(
        `Visual asset Backup integrity check failed for version "${entry.versionId}".`,
      );
    }
  }

  const jsonData: BackupData = {
    ...data,
    visual_asset_versions: visualVersions,
    ...(visualManifest.length > 0
      ? { visual_asset_manifest: visualManifest }
      : {}),
  };
  delete jsonData.visual_asset_files;
  if (jsonData.visual_assets?.length || visualManifest.length > 0) {
    jsonData.metadata = {
      ...jsonData.metadata,
      version: Math.max(2, jsonData.metadata.version),
    };
  }
  const jsonContent = JSON.stringify(jsonData, null, 2);

  // Filter out archived events and convert to UI-ready format for ICS utility
  const eventsUI = data.events
    .filter((e) => !e.is_archived)
    .map((e) => toCalendarEventUI(e));

  const icsContent =
    eventsUI.length > 0 ? generateICS(eventsUI, "Kagelin Backup") : "";

  const jsonU8 = strToU8(jsonContent);
  files["backup.json"] = new Uint8Array(jsonU8);

  if (icsContent) {
    const icsU8 = strToU8(icsContent);
    files["calendars/kanso-events.ics"] = new Uint8Array(icsU8);
  }

  for (const entry of visualManifest) {
    const bytes = visualFiles[entry.versionId] ?? visualFiles[entry.path];
    // The complete manifest was checked above, so this cannot silently omit
    // an image from an archive.
    files[entry.path] = bytes!.slice();
  }

  const zipData = zipSync(files, { level: 6 });
  return new Blob([zipData as BlobPart], { type: "application/zip" });
}

/**
 * Parse a backup ZIP, extract backup.json, and validate BackupData
 */
export async function parseBackupZip(blob: Blob): Promise<BackupData> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("FileReader failed to read Blob"));
    reader.readAsArrayBuffer(blob);
  });
  const uint8 = new Uint8Array(buffer);

  if (uint8.length === 0) {
    throw new Error("Invalid backup archive: empty file");
  }

  try {
    const files = unzipSync(uint8);

    // Robust search: find a non-empty entry containing "backup.json"
    let backupJsonRaw: Uint8Array | undefined;
    for (const [name, data] of Object.entries(files)) {
      if (name.toLowerCase().includes("backup.json") && data.length > 0) {
        backupJsonRaw = data;
        break;
      }
    }

    if (!backupJsonRaw) {
      throw new Error("Backup archive does not contain backup.json");
    }

    const jsonStr = strFromU8(backupJsonRaw);
    const data = JSON.parse(jsonStr) as BackupData;

    // Basic structural validation
    if (!data.metadata?.version) {
      throw new Error("Invalid backup format: missing version");
    }

    const manifest = data.visual_asset_manifest ?? [];
    if (manifest.length > 0) {
      const visualFiles: Record<string, Uint8Array> = {};
      const versions = new Map(
        (data.visual_asset_versions ?? []).map((version) => [
          version.id,
          version,
        ]),
      );
      const seenPaths = new Set<string>();
      for (const entry of manifest) {
        const version = versions.get(entry.versionId);
        if (
          !version ||
          version.asset_id !== entry.assetId ||
          version.byte_size !== entry.byteSize ||
          version.sha256 !== entry.sha256 ||
          version.mime_type !== entry.mimeType ||
          !entry.path.startsWith("visual-assets/") ||
          entry.path.includes("..") ||
          seenPaths.has(entry.path)
        ) {
          throw new Error(
            `Backup visual asset manifest is inconsistent: ${entry.versionId}`,
          );
        }
        seenPaths.add(entry.path);
        const bytes = files[entry.path];
        if (!bytes) {
          throw new Error(`Backup visual asset file is missing: ${entry.path}`);
        }
        if (bytes.length !== entry.byteSize) {
          throw new Error(
            `Backup visual asset file has an unexpected size: ${entry.versionId}`,
          );
        }
        const digest = await calculateVisualSha256(bytes);
        if (digest !== entry.sha256) {
          throw new Error(
            `Backup visual asset integrity check failed: ${entry.versionId}`,
          );
        }
        visualFiles[entry.versionId] = bytes.slice();
      }
      data.visual_asset_files = visualFiles;
    }

    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Failed to parse backup archive: ${String(e)}`);
  }
}

/**
 * Trigger browser download for a given ZIP Blob with a timestamped filename.
 */
export function downloadBackup(blob: Blob, filename?: string): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const finalName = filename || `kanso-backup-${timestamp}.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.body.appendChild(document.createElement("a"));

  anchor.href = url;
  anchor.download = finalName;
  anchor.click();

  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
