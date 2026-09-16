const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory does not exist: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
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

console.log("Copying .next/static to .next/standalone/.next/static...");
copyDirRecursive(
  path.join(rootDir, ".next", "static"),
  path.join(standaloneDir, ".next", "static"),
);

console.log("Copying public to .next/standalone/public...");
copyDirRecursive(
  path.join(rootDir, "public"),
  path.join(standaloneDir, "public"),
);

console.log("Successfully prepared .next/standalone static assets.");
