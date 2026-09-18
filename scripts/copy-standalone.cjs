const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dest, filter) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory does not exist: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (filter && !filter(entry.name, entry.isDirectory())) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filter);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanUnneededFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".cache") {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanUnneededFiles(fullPath);
      }
    } else if (
      entry.name.endsWith(".map") ||
      entry.name.endsWith(".d.ts") ||
      entry.name.endsWith(".d.mts") ||
      entry.name.endsWith(".d.cts")
    ) {
      try {
        fs.unlinkSync(fullPath);
      } catch {}
    }
  }
}

const rootDir = path.resolve(__dirname, "..");
const standaloneDir = path.join(rootDir, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error(
    "Error: .next/standalone does not exist. Did you run 'npm run build' with NEXT_PUBLIC_IS_ELECTRON=true?",
  );
  process.exit(1);
}

const assetFilter = (name, isDir) => {
  if (isDir) {
    return !name.startsWith(".") && name !== "__tests__";
  }
  return (
    !name.endsWith(".map") &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".d.mts") &&
    !name.endsWith(".d.cts")
  );
};

console.log("Copying .next/static to .next/standalone/.next/static...");
const staticSrc = path.join(rootDir, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
copyDirRecursive(staticSrc, staticDest, assetFilter);

console.log("Copying public to .next/standalone/public...");
const publicSrc = path.join(rootDir, "public");
const publicDest = path.join(standaloneDir, "public");
copyDirRecursive(publicSrc, publicDest, assetFilter);

console.log(
  "Stripping unneeded sourcemaps and type definitions from .next/standalone...",
);
cleanUnneededFiles(standaloneDir);

// Verification assertions
if (!fs.existsSync(staticDest) || fs.readdirSync(staticDest).length === 0) {
  console.error(
    "FATAL: .next/standalone/.next/static is empty or missing after copy!",
  );
  process.exit(1);
}

if (!fs.existsSync(publicDest) || fs.readdirSync(publicDest).length === 0) {
  console.error(
    "FATAL: .next/standalone/public is empty or missing after copy!",
  );
  process.exit(1);
}

console.log(
  "Successfully prepared, pruned, and verified .next/standalone assets.",
);
