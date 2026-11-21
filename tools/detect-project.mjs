#!/usr/bin/env node
/**
 * render-cloud — project detector & chunk planner
 * ------------------------------------------------
 * One workflow renders two kinds of project:
 *
 *   hyperframes  videos/<slug>/index.html with data-duration
 *                (RenderedLabs, concept-carousel HyperFrames shorts)
 *   canvas       videos/<slug>/render.json + bundle.tar.gz
 *                (Amber Margins, concept-carousel canvas shorts)
 *
 * Usage:
 *   node tools/detect-project.mjs <slug|auto> <kind|auto> <chunks> <workers>
 *
 * Prints GitHub Actions outputs on stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const VIDEOS = path.join(ROOT, "videos");
const MAX_CHUNKS = 20;

const slugArg = (process.argv[2] || "auto").trim();
const kindArg = (process.argv[3] || "auto").trim();
const chunks = Math.min(MAX_CHUNKS, Math.max(1, parseInt(process.argv[4] || "20", 10)));
const workers = Math.min(8, Math.max(1, parseInt(process.argv[5] || "4", 10)));

function dirs() {
  if (!fs.existsSync(VIDEOS)) return [];
  return fs.readdirSync(VIDEOS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => n !== ".gitkeep");
}

function autoSlug() {
  // A push that touched videos/ tells us exactly what to render.
  try {
    const changed = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.startsWith("videos/"))
      .map((f) => f.split("/")[1])
      .filter(Boolean);
    const picked = changed.find((s) => fs.existsSync(path.join(VIDEOS, s)));
    if (picked) return picked;
  } catch {
    // first commit / shallow clone
  }
  const first = dirs().find((s) => fs.existsSync(path.join(VIDEOS, s, "render.json")) ||
                                 fs.existsSync(path.join(VIDEOS, s, "index.html")));
  if (!first) throw new Error("No renderable project under videos/");
  return first;
}

function readCanvasConfig(slug) {
  const cfgPath = path.join(VIDEOS, slug, "render.json");
  if (!fs.existsSync(cfgPath)) return null;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const fps = Number(cfg.fps || 24);
  const duration = Number(cfg.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`render.json for ${slug} needs a positive "duration" (seconds)`);
  }
  const frames = Number(cfg.frames) > 0 ? Math.round(Number(cfg.frames)) : Math.round(duration * fps);
  return {
    kind: "canvas",
    slug,
    output: cfg.output || slug,
    fps,
    ar: cfg.ar || "16x9",
    audio: cfg.audio || "",
    share: cfg.share === true,
    nominal: duration,
    duration: frames / fps,
    frames,
    chunks,
    matrix: canvasMatrix(slug, frames, fps, chunks),
  };
}

function canvasMatrix(slug, frames, fps, n) {
  const per = Math.ceil(frames / n);
  const include = [];
  for (let i = 0; i < n; i++) {
    const startFrame = i * per;
    const endFrame = Math.min(frames, startFrame + per);
    if (startFrame >= endFrame) break;
    include.push({
      id: i,
      slug,
      startFrame,
      endFrame,
      frames: endFrame - startFrame,
      start: (startFrame / fps).toFixed(9),
      end: (endFrame / fps).toFixed(9),
    });
  }
  return { include };
}

function readHyperframesConfig(slug) {
  const indexPath = path.join(VIDEOS, slug, "index.html");
  if (!fs.existsSync(indexPath)) return null;
  const html = fs.readFileSync(indexPath, "utf8");
  const m = html.match(/id=["']root["'][^>]*data-duration=["']([0-9.]+)["']/i) ||
            html.match(/data-duration=["']([0-9.]+)["'][^>]*id=["']root["']/i) ||
            html.match(/data-duration=["']([0-9.]+)["']/i);
  if (!m) return null;
  const duration = parseFloat(m[1]);
  const n = duration <= 30 ? 1 : chunks;
  const per = duration / n;
  const include = [];
  for (let i = 0; i < n; i++) {
    const start = i * per;
    const end = i === n - 1 ? "" : (i + 1) * per;
    include.push({
      id: i,
      slug,
      start: start.toFixed(3),
      end: end === "" ? "" : end.toFixed(3),
      frames: 0,
    });
  }
  // Respect the project's pinned CLI when it names one; the RenderedLabs films
  // and the Concept Carousel ports use different HyperFrames majors.
  let hfVersion = "0.8.223";
  const pkgPath = path.join(VIDEOS, slug, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const pinned = pkg.dependencies?.hyperframes || pkg.devDependencies?.hyperframes;
      const inScript = JSON.stringify(pkg.scripts || {}).match(/hyperframes@([0-9][0-9.]*)/);
      if (pinned) hfVersion = String(pinned).replace(/^[^0-9]*/, "");
      else if (inScript) hfVersion = inScript[1];
    } catch {
      // malformed package.json: fall back to the hub default
    }
  }
  return {
    kind: "hyperframes",
    slug,
    output: slug,
    fps: 30,
    ar: "",
    audio: "",
    share: false,
    hf_version: hfVersion,
    nominal: duration,
    duration,
    frames: 0,
    chunks: n,
    matrix: { include },
  };
}

function main() {
  const slug = slugArg === "auto" ? autoSlug() : slugArg;
  if (!fs.existsSync(path.join(VIDEOS, slug))) {
    throw new Error(`Project not found: videos/${slug}`);
  }

  let plan = null;
  if (kindArg === "canvas" || kindArg === "auto") plan = readCanvasConfig(slug);
  if (!plan && (kindArg === "hyperframes" || kindArg === "auto")) plan = readHyperframesConfig(slug);
  if (!plan) throw new Error(`videos/${slug} is neither canvas (render.json) nor hyperframes (index.html + data-duration)`);

  const out = {
    slug,
    kind: plan.kind,
    output: plan.output,
    duration: plan.duration.toFixed(6),
    nominal: plan.nominal.toFixed(6),
    fps: String(plan.fps),
    frames: String(plan.frames),
    ar: plan.ar,
    audio: plan.audio,
    share: String(plan.share),
    hf_version: plan.hf_version || "",
    workers: String(workers),
    chunk_count: String(plan.matrix.include.length),
    matrix: JSON.stringify(plan.matrix),
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
