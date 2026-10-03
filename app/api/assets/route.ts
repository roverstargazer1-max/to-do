import { NextRequest, NextResponse } from "next/server";
import { assetService } from "@/lib/assets/asset-service";
import { validateCsrfOrigin } from "@/lib/api/csrf-guard";

function checkSvgSafety(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): void {
  const isSvg =
    mimeType.toLowerCase().includes("svg") ||
    fileName.toLowerCase().endsWith(".svg") ||
    /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg\b/i.test(
      buffer.subarray(0, 4096).toString("utf-8"),
    );

  if (isSvg) {
    const text = buffer.toString("utf-8");
    const dangerous =
      /<\/?script\b|\bon[a-z][\w-]*\s*=|javascript\s*:|data\s*:\s*text\/html|<\/?(?:iframe|object|embed|foreignObject|link)\b|<!ENTITY|@import\b|(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|data:)|url\s*\(\s*["']?(?:https?:|file:|data:)/i;
    if (dangerous.test(text)) {
      throw new Error(
        "SVG content contains potentially unsafe script or external references",
      );
    }
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateCsrfOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json({ error: csrf.error }, { status: csrf.status });
  }

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
      checkSvgSafety(buffer, file.type || "", file.name);
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
    checkSvgSafety(buffer, mimeType || "", fileName);
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
