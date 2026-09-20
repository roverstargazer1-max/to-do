import { NextRequest, NextResponse } from "next/server";
import { assetService } from "@/lib/assets/asset-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await context.params;
    const result = assetService.readAssetBytes(hash);
    if (!result) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { buffer, asset } = result;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mime_type || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
