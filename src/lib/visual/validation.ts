import {
  DEFAULT_VISUAL_ASSET_LIMITS,
  type VisualAssetLimits,
  type VisualBytes,
} from "@/lib/types/visual";

export type VisualValidationErrorCode =
  | "invalid_input"
  | "invalid_mime"
  | "invalid_content"
  | "asset_too_large"
  | "pixel_limit"
  | "dimension_limit"
  | "unsafe_svg"
  | "url_not_allowed"
  | "crypto_unavailable";

export class VisualValidationError extends Error {
  readonly code: VisualValidationErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: VisualValidationErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "VisualValidationError";
    this.code = code;
    this.details = details;
  }
}

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  "image/svg": "image/svg+xml",
};

function normalizeMimeType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.split(";", 1)[0].trim().toLocaleLowerCase();
  return MIME_ALIASES[normalized] ?? normalized;
}

export interface ValidatedVisualBytes {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
}

function asBytes(input: VisualBytes): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return Promise.resolve(input.slice());
  // `File`/`Blob` and test DOMs can provide a typed array from another
  // JavaScript Realm. `instanceof Uint8Array` is false in that case, even
  // though the value is still a byte view. Copy only one-byte views so a
  // caller cannot smuggle a wider numeric representation into validation.
  const view = input as VisualBytes & { BYTES_PER_ELEMENT?: number };
  if (ArrayBuffer.isView(input) && view.BYTES_PER_ELEMENT === 1) {
    return Promise.resolve(
      new Uint8Array(
        input.buffer.slice(
          input.byteOffset,
          input.byteOffset + input.byteLength,
        ),
      ),
    );
  }
  if (input instanceof ArrayBuffer) {
    return Promise.resolve(new Uint8Array(input.slice(0)));
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return input.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  throw new VisualValidationError(
    "invalid_input",
    "A visual asset must provide image bytes.",
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length), (value) =>
    String.fromCharCode(value),
  ).join("");
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function svgDimension(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : undefined;
}

function parseSvgSize(bytes: Uint8Array): { width: number; height: number } {
  const source = new TextDecoder().decode(bytes);
  const svgMatch = source.match(/<svg\b([^>]*)>/i);
  if (!svgMatch) {
    throw new VisualValidationError(
      "invalid_content",
      "The SVG payload does not contain a root svg element.",
    );
  }
  const attributes = svgMatch[1];
  const width = svgDimension(
    attributes.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1],
  );
  const height = svgDimension(
    attributes.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1],
  );
  const viewBox = attributes
    .match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox?.[2];
  const viewBoxHeight = viewBox?.[3];
  const resolvedWidth =
    width ?? (viewBoxWidth && viewBoxWidth > 0 ? Math.ceil(viewBoxWidth) : 0);
  const resolvedHeight =
    height ??
    (viewBoxHeight && viewBoxHeight > 0 ? Math.ceil(viewBoxHeight) : 0);
  if (!resolvedWidth || !resolvedHeight) {
    throw new VisualValidationError(
      "invalid_content",
      "The SVG must declare positive width/height or a positive viewBox.",
    );
  }
  return { width: resolvedWidth, height: resolvedHeight };
}

function parseJpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new VisualValidationError("invalid_content", "Invalid JPEG bytes.");
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && length >= 7) {
      return {
        height: u16be(bytes, offset + 3),
        width: u16be(bytes, offset + 5),
      };
    }
    offset += length;
  }
  throw new VisualValidationError(
    "invalid_content",
    "The JPEG dimensions could not be read.",
  );
}

function parseWebpSize(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < 30 ||
    readAscii(bytes, 0, 4) !== "RIFF" ||
    readAscii(bytes, 8, 4) !== "WEBP"
  ) {
    throw new VisualValidationError("invalid_content", "Invalid WebP bytes.");
  }
  const chunk = readAscii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    const start = 20;
    const frameStart = bytes.indexOf(0x9d, start);
    if (frameStart >= 0 && frameStart + 6 < bytes.length) {
      return {
        width: u16le(bytes, frameStart + 3) & 0x3fff,
        height: u16le(bytes, frameStart + 5) & 0x3fff,
      };
    }
  }
  if (chunk === "VP8L" && bytes.length >= 26 && bytes[21] === 0x2f) {
    const bits =
      bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new VisualValidationError(
    "invalid_content",
    "The WebP dimensions could not be read.",
  );
}

function inspectBytes(bytes: Uint8Array): {
  mimeType: string;
  width: number;
  height: number;
} {
  if (bytes.length >= 24 && readAscii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
    return {
      mimeType: "image/png",
      width: u32be(bytes, 16),
      height: u32be(bytes, 20),
    };
  }
  if (
    bytes.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(readAscii(bytes, 0, 6))
  ) {
    return {
      mimeType: "image/gif",
      width: u16le(bytes, 6),
      height: u16le(bytes, 8),
    };
  }
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    const size = parseWebpSize(bytes);
    return { mimeType: "image/webp", ...size };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { mimeType: "image/jpeg", ...parseJpegSize(bytes) };
  }
  const text = new TextDecoder()
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, "");
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg\b/i.test(text)) {
    return { mimeType: "image/svg+xml", ...parseSvgSize(bytes) };
  }
  throw new VisualValidationError(
    "invalid_content",
    "The file is not a supported PNG, JPEG, WebP, GIF, or SVG image.",
  );
}

function assertSafeSvg(bytes: Uint8Array): void {
  const source = new TextDecoder().decode(bytes);
  const dangerous =
    /<\/?script\b|\bon[a-z][\w-]*\s*=|javascript\s*:|data\s*:\s*text\/html|<\/?(?:iframe|object|embed|foreignObject|link)\b|<!ENTITY|@import\b|(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|data:)|url\s*\(\s*["']?(?:https?:|file:|data:)/i;
  if (dangerous.test(source)) {
    throw new VisualValidationError(
      "unsafe_svg",
      "SVG content contains a script or external reference and was rejected.",
    );
  }
}

export async function calculateVisualSha256(
  bytes: Uint8Array,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new VisualValidationError(
      "crypto_unavailable",
      "The runtime cannot calculate a visual asset integrity hash.",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function validateVisualBytes(
  input: VisualBytes,
  declaredMimeType?: string,
  limits: Partial<VisualAssetLimits> = {},
): Promise<ValidatedVisualBytes> {
  const bytes = await asBytes(input);
  const effectiveLimits = { ...DEFAULT_VISUAL_ASSET_LIMITS, ...limits };
  if (bytes.length === 0) {
    throw new VisualValidationError("invalid_content", "The image is empty.");
  }
  if (bytes.length > effectiveLimits.maxBytes) {
    throw new VisualValidationError(
      "asset_too_large",
      `The image is larger than the ${effectiveLimits.maxBytes}-byte limit.`,
      { byteSize: bytes.length, maxBytes: effectiveLimits.maxBytes },
    );
  }
  const inspected = inspectBytes(bytes);
  const declared = normalizeMimeType(declaredMimeType);
  if (declared && !ALLOWED_MIME_TYPES.has(declared)) {
    throw new VisualValidationError(
      "invalid_mime",
      `Image type "${declaredMimeType}" is not supported.`,
      { declaredMimeType, allowedMimeTypes: [...ALLOWED_MIME_TYPES] },
    );
  }
  if (declared && declared !== inspected.mimeType) {
    throw new VisualValidationError(
      "invalid_mime",
      "The declared image type does not match the file contents.",
      { declaredMimeType: declared, detectedMimeType: inspected.mimeType },
    );
  }
  if (inspected.mimeType === "image/svg+xml") assertSafeSvg(bytes);
  const { width, height } = inspected;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new VisualValidationError(
      "invalid_content",
      "The image has invalid pixel dimensions.",
      { width, height },
    );
  }
  if (width > effectiveLimits.maxWidth || height > effectiveLimits.maxHeight) {
    throw new VisualValidationError(
      "dimension_limit",
      `The image dimensions exceed the ${effectiveLimits.maxWidth}×${effectiveLimits.maxHeight} limit.`,
      {
        width,
        height,
        maxWidth: effectiveLimits.maxWidth,
        maxHeight: effectiveLimits.maxHeight,
      },
    );
  }
  const pixels = width * height;
  if (pixels > effectiveLimits.maxPixels) {
    throw new VisualValidationError(
      "pixel_limit",
      `The image contains more than ${effectiveLimits.maxPixels} pixels.`,
      { width, height, pixels, maxPixels: effectiveLimits.maxPixels },
    );
  }
  return {
    bytes,
    mimeType: inspected.mimeType,
    width,
    height,
    sha256: await calculateVisualSha256(bytes),
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "metadata.google.internal" ||
    lower === "169.254.169.254" ||
    isPrivateIpv4(lower) ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  )
    return true;
  return false;
}

/** Validate the URL before any server-side request is made. */
export function assertSafeVisualUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new VisualValidationError(
      "url_not_allowed",
      "The visual URL is invalid.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    isPrivateHostname(parsed.hostname)
  ) {
    throw new VisualValidationError(
      "url_not_allowed",
      "Only public HTTPS visual URLs without credentials are allowed.",
      { protocol: parsed.protocol, hostname: parsed.hostname },
    );
  }
  return parsed;
}

export { ALLOWED_MIME_TYPES, normalizeMimeType };
