import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { inspect } from "node:util";

const require = createRequire(import.meta.url);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const nativePackage = "@moss-dev/moss-core-linux-x64-gnu";

function run(args) {
  const result = spawnSync(npm, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function canLoad(packageName, logError = false) {
  try {
    require(packageName);
    return true;
  } catch (error) {
    if (logError) {
      console.error(`[vercel-install] Failed to load ${packageName}`);
      console.error(inspect(error, { depth: 10 }));
    }
    return false;
  }
}

run(["install", "--package-lock=false", "--include=optional"]);

if (process.platform === "linux" && process.arch === "x64") {
  if (!canLoad(nativePackage)) {
    run([
      "install",
      "--package-lock=false",
      "--no-save",
      "--force",
      "--ignore-scripts",
      `${nativePackage}@0.17.0`,
    ]);
  }

  if (!canLoad(nativePackage, true) || !canLoad("@moss-dev/moss-core", true)) {
    process.exit(1);
  }
  console.log(`[vercel-install] Loaded ${nativePackage} and @moss-dev/moss-core`);
}
