import { describe, expect, it } from "vitest";
import {
  assertSafeVisualUrl,
  calculateVisualSha256,
  validateVisualBytes,
} from "@/lib/visual/validation";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

describe("visual validation", () => {
  it("detects the content type, dimensions, and integrity hash", async () => {
    const result = await validateVisualBytes(PNG, "image/png");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.sha256).toBe(await calculateVisualSha256(PNG));
  });

  it("rejects MIME spoofing, unsafe SVG, and oversized dimensions", async () => {
    await expect(validateVisualBytes(PNG, "image/jpeg")).rejects.toMatchObject({
      code: "invalid_mime",
    });
    const unsafeSvg = new TextEncoder().encode(
      '<svg width="10" height="10"><script>alert(1)</script></svg>',
    );
    await expect(
      validateVisualBytes(unsafeSvg, "image/svg+xml"),
    ).rejects.toMatchObject({
      code: "unsafe_svg",
    });
    await expect(
      validateVisualBytes(PNG, "image/png", { maxBytes: 4 }),
    ).rejects.toMatchObject({ code: "asset_too_large" });
  });

  it("allows public HTTPS URLs only", () => {
    expect(
      assertSafeVisualUrl("https://cdn.example.com/image.png").hostname,
    ).toBe("cdn.example.com");
    expect(() =>
      assertSafeVisualUrl("http://cdn.example.com/image.png"),
    ).toThrow();
    expect(() => assertSafeVisualUrl("https://127.0.0.1/image.png")).toThrow();
    expect(() =>
      assertSafeVisualUrl("https://user:pass@example.com/a.png"),
    ).toThrow();
  });
});
