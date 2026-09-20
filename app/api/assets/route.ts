import { NextRequest, NextResponse } from "next/server";
import { assetService } from "@/lib/assets/asset-service";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file uploaded" },
          { status: 400 },
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const asset = assetService.saveAsset(
        buffer,
        file.name,
        file.type || "application/octet-stream",
      );
      return NextResponse.json(
        { ...asset, url: `/api/assets/${asset.hash}` },
        { status: 201 },
      );
    }

    const body = await request.json();
    const { base64, fileName, mimeType, width, height } = body;
    if (!base64 || !fileName) {
      return NextResponse.json(
        { error: "base64 and fileName are required" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(base64, "base64");
    const asset = assetService.saveAsset(
      buffer,
      fileName,
      mimeType || "application/octet-stream",
      width,
      height,
    );
    return NextResponse.json(
      { ...asset, url: `/api/assets/${asset.hash}` },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
