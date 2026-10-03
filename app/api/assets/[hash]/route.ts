import { NextRequest, NextResponse } from "next/server";
import { assetService } from "@/lib/assets/asset-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await context.params;
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      return NextResponse.json(
        { error: "Invalid asset hash" },
        { status: 400 },
      );
    }

    const result = assetService.readAssetBytes(hash);
    if (!result) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { buffer, asset } = result;
    const isSvg = (asset.mime_type || "").toLowerCase().includes("svg");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mime_type || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        ...(isSvg
          ? { "Content-Disposition": 'attachment; filename="asset.svg"' }
          : {}),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
