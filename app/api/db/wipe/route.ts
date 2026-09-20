import { NextResponse } from "next/server";
import * as fs from "node:fs";
import { getDatabase } from "@/lib/db/index";
import { getAssetDirPath } from "@/lib/db/config";

/**
 * Clears every domain row in the local database (single transaction) and
 * removes the content-addressed asset files that no row can reference anymore.
 */
export async function POST() {
  try {
    const db = getDatabase();

    const wipe = db.transaction(() => {
      db.exec(`
        DELETE FROM habit_entries;
        DELETE FROM focus_logs;
        DELETE FROM calendar_events;
        DELETE FROM habits;
        DELETE FROM tasks;
        DELETE FROM projects;
        DELETE FROM workspace_edges;
        DELETE FROM workspace_nodes;
        DELETE FROM workspaces;
        DELETE FROM visual_flow_drafts;
        DELETE FROM visual_relations;
        DELETE FROM visual_derived;
        DELETE FROM visual_annotations;
        DELETE FROM visual_asset_versions;
        DELETE FROM visual_assets;
      `);
    });
    wipe();

    const assetDir = getAssetDirPath();
    if (fs.existsSync(assetDir)) {
      for (const entry of fs.readdirSync(assetDir)) {
        try {
          fs.unlinkSync(`${assetDir}/${entry}`);
        } catch {}
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to clear local data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
