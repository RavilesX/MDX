#!/usr/bin/env node
// Bundles every tests/*.test.ts file and runs them with node --test.
//
// A previous version of this did that with a shell one-liner
// (`esbuild tests/*.test.ts ... && node --test .test/*.test.js`), relying on
// the shell to expand the `*` globs. That is true on Linux/macOS (bash), but
// npm always runs its scripts through cmd.exe on Windows regardless of which
// shell invoked `npm test` — cmd.exe does not expand wildcards for an
// external command's arguments, so esbuild and node each received the
// literal string `tests/*.test.ts` and failed. Doing the glob and the build
// in JS instead of leaning on shell expansion works the same way everywhere.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as esbuild from "esbuild";

const entryPoints = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `tests/${name}`);

if (entryPoints.length === 0) {
  console.error("No tests/*.test.ts files found.");
  process.exit(1);
}

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: ".test",
  logLevel: "warning",
});

// Passing a bare directory to `node --test` does not reliably recurse into
// it across Node versions, so the bundled files are listed explicitly here
// instead — the same reasoning as building entryPoints above, just one step
// later.
const testFiles = readdirSync(".test")
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => `.test/${name}`);

const result = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
process.exit(result.status ?? 1);
