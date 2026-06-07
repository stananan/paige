import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const nativePackage = "@moss-dev/moss-core-linux-x64-gnu";

function run(args) {
  const result = spawnSync(npm, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function nativeBindingIsInstalled() {
  try {
    require.resolve(`${nativePackage}/package.json`);
    return true;
  } catch {
    return false;
  }
}

run(["install", "--package-lock=false", "--include=optional"]);

if (process.platform === "linux" && process.arch === "x64") {
  if (!nativeBindingIsInstalled()) {
    run([
      "install",
      "--package-lock=false",
      "--no-save",
      "--force",
      "--ignore-scripts",
      `${nativePackage}@0.17.0`,
    ]);
  }

  if (!nativeBindingIsInstalled()) {
    console.error(`[vercel-install] Failed to install ${nativePackage}`);
    process.exit(1);
  }
  console.log(`[vercel-install] Verified ${nativePackage}`);
}
