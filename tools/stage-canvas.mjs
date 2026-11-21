#!/usr/bin/env node
/**
 * render-cloud — stage a canvas project as an opaque render bundle
 * ----------------------------------------------------------------
 *   node tools/stage-canvas.mjs <projectDir> <slug>
 *
 * The project supplies a cloud.json:
 *
 *   {
 *     "output": "ino-tadataka",
 *     "fps": 24,
 *     "ar": "16x9",
 *     "duration": 561.203,
 *     "audio": "data/mix.m4a",
 *     "share": true,
 *     "include": [
 *       "index.html", "src", "fonts", "assets",
 *       "tools/capture.mjs", "data/lines.json", "data/words.json", "data/mix.m4a"
 *     ]
 *   }
 *
 * It builds videos/<slug>/bundle.tar.gz plus a public render.json, commits
 * "[skip ci]" (so the push trigger does not double-render), and pushes.
 *
 * Audio must already be compressed (m4a/mp3) below ~50 MB. WAV masters stay
 * local; only the AAC used in the final mux is staged.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const [projectArg, slug] = process.argv.slice(2);
if (!projectArg || !slug) {
  console.error("usage: node tools/stage-canvas.mjs <projectDir> <slug>");
  process.exit(1);
}

const projectDir = path.resolve(projectArg);
const cfgPath = path.join(projectDir, "cloud.json");
if (!fs.existsSync(cfgPath)) {
  console.error(`missing ${cfgPath}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const include = cfg.include || [];
if (!include.length) {
  console.error("cloud.json needs an \"include\" array");
  process.exit(1);
}
for (const rel of include) {
  if (!fs.existsSync(path.join(projectDir, rel))) {
    console.error(`include path missing: ${rel}`);
    process.exit(1);
  }
}

const fps = Number(cfg.fps || 24);
let duration = Number(cfg.duration || 0);
if (!(duration > 0)) {
  const probe = spawnSync("node", ["tools/capture.mjs", "eval", "OP.duration()"], {
    cwd: projectDir,
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    console.error(probe.stderr || "could not read OP.duration()");
    process.exit(1);
  }
  duration = parseFloat(probe.stdout.trim().split("\n").pop());
}
if (!(duration > 0)) {
  console.error("could not determine duration");
  process.exit(1);
}
const frames = Math.round(duration * fps);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `stage-${slug}-`));
for (const rel of include) {
  const src = path.join(projectDir, rel);
  const dst = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

const bundlePath = path.join(tmp, "bundle.tar.gz");
execSync(`tar -czf "${bundlePath}" -C "${tmp}" .`, { stdio: "inherit" });

const outDir = path.join(ROOT, "videos", slug);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(bundlePath, path.join(outDir, "bundle.tar.gz"));
fs.writeFileSync(
  path.join(outDir, "render.json"),
  JSON.stringify({
    kind: "canvas",
    output: cfg.output || slug,
    fps,
    ar: cfg.ar || "16x9",
    duration,
    frames,
    audio: cfg.audio || "",
    share: cfg.share === true,
    built_at: new Date().toISOString(),
  }, null, 2) + "\n"
);
fs.rmSync(tmp, { recursive: true, force: true });

const sizeMB = (fs.statSync(path.join(outDir, "bundle.tar.gz")).size / 1024 / 1024).toFixed(1);
console.log(`staged videos/${slug}/bundle.tar.gz (${sizeMB} MB), ${frames} frames @ ${fps} fps`);

execSync(`git add "videos/${slug}"`, { cwd: ROOT, stdio: "inherit" });
execSync(`git -c user.name="render-bot" -c user.email="bot@users.noreply.github.com" commit -m "stage: ${slug} (canvas) [skip ci]"`, {
  cwd: ROOT,
  stdio: "inherit",
});
execSync("git push origin main", { cwd: ROOT, stdio: "inherit" });

console.log(`\nDispatch:\n  gh workflow run render.yml -R Itsmeakash248/render-cloud \\\n    -f slug=${slug} -f kind=canvas -f chunks=20 -f workers=4`);
