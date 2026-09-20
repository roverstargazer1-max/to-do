import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getAssetDirPath } from "@/lib/db/config";
import { getDatabase } from "@/lib/db/index";

export interface VisualAssetRecord {
  id: string;
  hash: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  file_path: string;
  created_at: string;
}

export interface StoredAssetFile {
  hash: string;
  /** File name inside the assets directory (`<sha256><ext>`). */
  fileName: string;
  byteSize: number;
}

function resolveExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName);
  if (fromName) return fromName;
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  if (mimeType.includes("svg")) return ".svg";
  return ".bin";
}

/**
 * Content-addressed storage for visual asset bytes. Files live in the local
 * assets directory named by their SHA256 hash, so identical bytes are written
 * once and any external tool can inspect them directly. Metadata rows are kept
 * in SQLite (`visual_assets` for the current version, `visual_asset_versions`
 * for the immutable history).
 */
export class AssetService {
  private getDb() {
    return getDatabase();
  }

  /** Write bytes to disk; idempotent for identical content. */
  persistBytes(
    bytes: Buffer | Uint8Array,
    fileName: string,
    mimeType = "application/octet-stream",
  ): StoredAssetFile {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const assetDir = getAssetDirPath();
    const storedFileName = `${hash}${resolveExtension(fileName, mimeType)}`;
    const fullPath = path.join(assetDir, storedFileName);

    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, buffer);
    }

    return { hash, fileName: storedFileName, byteSize: buffer.length };
  }

  /** Read bytes by content hash; the file name is the hash plus an extension. */
  readBytesByHash(hash: string): Buffer | null {
    const assetDir = getAssetDirPath();
    if (!fs.existsSync(assetDir)) return null;

    const match = fs
      .readdirSync(assetDir)
      .find((entry) => entry.startsWith(hash));
    if (!match) return null;

    const filePath = path.join(assetDir, match);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  getByHash(hash: string): VisualAssetRecord | null {
    const row = this.getDb()
      .prepare(`SELECT * FROM visual_assets WHERE hash = ?`)
      .get(hash) as VisualAssetRecord | undefined;
    return row || null;
  }

  /** Current-version rows are authoritative, then immutable version rows. */
  getVersionByHash(hash: string): { mime_type: string } | null {
    const row = this.getDb()
      .prepare(
        `SELECT mime_type FROM visual_asset_versions WHERE sha256 = ? LIMIT 1`,
      )
      .get(hash) as { mime_type: string } | undefined;
    return row || null;
  }

  readAssetBytes(
    hash: string,
  ): { buffer: Buffer; asset: VisualAssetRecord } | null {
    const asset = this.getByHash(hash);
    if (asset) {
      const assetDir = getAssetDirPath();
      const filePath = path.join(assetDir, asset.file_path);
      if (fs.existsSync(filePath)) {
        return { buffer: fs.readFileSync(filePath), asset };
      }
    }

    const version = this.getVersionByHash(hash);
    if (!version) return null;
    const buffer = this.readBytesByHash(hash);
    if (!buffer) return null;

    return {
      buffer,
      asset: {
        id: hash,
        hash,
        file_name: hash,
        mime_type: version.mime_type,
        file_size: buffer.length,
        width: null,
        height: null,
        file_path: hash,
        created_at: new Date(0).toISOString(),
      },
    };
  }

  /**
   * Metadata-only ingestion used by the `/api/assets` upload route. The full
   * visual store creates immutable version rows through the repository.
   */
  saveAsset(
    bytes: Buffer | Uint8Array,
    fileName: string,
    mimeType = "application/octet-stream",
    width?: number | null,
    height?: number | null,
  ): VisualAssetRecord {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const stored = this.persistBytes(buffer, fileName, mimeType);

    const existing = this.getByHash(stored.hash);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `INSERT INTO visual_assets (id, hash, file_name, mime_type, file_size, width, height, file_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        stored.hash,
        fileName,
        mimeType,
        buffer.length,
        width ?? null,
        height ?? null,
        stored.fileName,
        now,
      );

    return this.getByHash(stored.hash)!;
  }
}

export const assetService = new AssetService();
