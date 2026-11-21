#!/usr/bin/env node
/**
 * render-cloud — stage a HyperFrames project
 * ------------------------------------------
 *   node tools/stage-hyperframes.mjs <projectDir> <slug>
 *
 * Copies the source (not renders, review sheets, node_modules or generated
 * caches), verifies the project declares a data-duration, commits with
 * "[skip ci]", and pushes. The workflow then plans time chunks and runs
 * `hyperframes render --workers 4` on each runner.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [projectArg, slug] = process.argv.slice(2);
if (!projectArg || !slug) {
  console.error("usage: node tools/stage-hyperframes.mjs <projectDir> <slug>");
  process.exit(1);
}

const src = path.resolve(projectArg);
const index = path.join(src, "index.html");
if (!fs.existsSync(index)) {
  console.error(`missing ${index}`);
  process.exit(1);
}
const html = fs.readFileSync(index, "utf8");
const duration = html.match(/data-duration=["']([0-9.]+)["']/i);
if (!duration) {
  console.error("index.html must declare data-duration=\"<seconds>\"");
  process.exit(1);
}

const SKIP_TOP = new Set(["renders", "review", "node_modules", ".git", ".hyperframes", "output", ".waveform-cache", ".thumbnails"]);
const SKIP_FILE = /\.(mp4|mov|mkv|webm|part)$/i;
const outDir = path.join(ROOT, "videos", slug);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(src, outDir, {
  recursive: true,
  filter: (from) => {
    const rel = path.relative(src, from);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    if (SKIP_TOP.has(parts[0])) return false;
    if (SKIP_FILE.test(from)) return false;
    return true;
  },
});

const sizeMB = execSync(`du -sm "${outDir}"`, { encoding: "utf8" }).split("\t")[0];
console.log(`staged videos/${slug} (${sizeMB} MB), ${duration[1]} s`);

execSync(`git add "videos/${slug}"`, { cwd: ROOT, stdio: "inherit" });
execSync(`git -c user.name="render-bot" -c user.email="bot@users.noreply.github.com" commit -m "stage: ${slug} (hyperframes) [skip ci]"`, {
  cwd: ROOT,
  stdio: "inherit",
});
execSync("git push origin main", { cwd: ROOT, stdio: "inherit" });

console.log(`\nDispatch:\n  gh workflow run render.yml -R Itsmeakash248/render-cloud \\\n    -f slug=${slug} -f kind=hyperframes -f chunks=20 -f workers=4`);
