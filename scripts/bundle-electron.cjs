const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist-electron");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log("Bundling Electron main, preload, and updater with esbuild...");

Promise.all([
  esbuild.build({
    entryPoints: [path.join(rootDir, "electron", "main.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    external: ["electron"],
    outfile: path.join(distDir, "main.js"),
    sourcemap: false,
    minify: true,
  }),
  esbuild.build({
    entryPoints: [path.join(rootDir, "electron", "preload.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    external: ["electron"],
    outfile: path.join(distDir, "preload.js"),
    sourcemap: false,
    minify: true,
  }),
  esbuild.build({
    entryPoints: [path.join(rootDir, "electron", "server-port.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: path.join(distDir, "server-port.js"),
    sourcemap: false,
    minify: true,
  }),
  esbuild.build({
    entryPoints: [path.join(rootDir, "electron", "runtime-flags.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: path.join(distDir, "runtime-flags.js"),
    sourcemap: false,
    minify: true,
  }),
])
  .then(() => {
    console.log("Successfully bundled Electron assets into dist-electron/.");
  })
  .catch((err) => {
    console.error("Failed to bundle Electron assets:", err);
    process.exit(1);
  });
