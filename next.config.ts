import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";
import { version } from "./package.json" with { type: "json" };

import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: true,
});

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable:
    (process.env.NODE_ENV === "development" &&
      process.env.ENABLE_PWA !== "true") ||
    process.env.NEXT_PUBLIC_IS_ELECTRON === "true",
  // App Router routes are reached via client-side navigation, so a document
  // fetch never happens for them unless we cache it ourselves on navigate.
  cacheOnNavigation: true,
});

const isMobile = process.env.NEXT_PUBLIC_IS_CAPACITOR === "true";
const isElectron = process.env.NEXT_PUBLIC_IS_ELECTRON === "true";

// Turbopack detection - skip Serwist wrapper for faster dev builds
const isTurbopack = process.env.TURBOPACK === "1";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  allowedDevOrigins: process.env.LAN_DEV_ORIGIN
    ? [process.env.LAN_DEV_ORIGIN]
    : [],
  output: isElectron ? "standalone" : isMobile ? "export" : undefined,
  cacheMaxMemorySize: isElectron ? 0 : undefined,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "*": ["**/AppData/**"],
  },
  productionBrowserSourceMaps: false,
  images: {
    // Disable server image optimization for mobile (export) and electron (Chromium decodes natively)
    unoptimized: isMobile || isElectron,
  },
  // Empty turbopack config to silence webpack warning
  turbopack: {},
  serverExternalPackages: ["better-sqlite3"],
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking/MIME-sniffing hardening flagged by the ZAP baseline scan.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/changelog.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/changelog-version.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

// Only wrap with Serwist when using Webpack (dev:pwa, build)
const config = withBundleAnalyzer(
  isTurbopack ? nextConfig : withSerwist(nextConfig),
);

// no-ops (no source map upload) unless SENTRY_AUTH_TOKEN + org/project are set
export default isElectron
  ? config
  : withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      useRunAfterProductionCompileHook: true,
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    });
