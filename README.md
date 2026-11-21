# render-cloud

Public cloud render hub for the Studio channels. One GitHub Actions workflow
renders both engines, with **20 runners × 4 workers** by default.

| Engine | Project shape | Used by |
|---|---|---|
| **hyperframes** | `videos/<slug>/index.html` + `data-duration` | RenderedLabs, concept-carousel HyperFrames shorts |
| **canvas** | `videos/<slug>/render.json` + `bundle.tar.gz` | Amber Margins, concept-carousel canvas shorts |

Deliverables are attached to a GitHub Release, then the staged source is purged
from every commit and the run artifacts are deleted. The public repo never keeps
a project permanently.

---

## Dispatch

```bash
gh workflow run render.yml -R Itsmeakash248/render-cloud \
  -f slug=<slug> -f kind=auto -f chunks=20 -f workers=4
```

Inputs: `slug` (`auto` = folder touched by the last commit), `kind`
(`auto|hyperframes|canvas`), `chunks` (1–20), `workers` (1–8), `quality`
(hyperframes `delivery|draft`), `crf` (canvas master, default 18),
`create_release`, `cleanup`.

A push that adds or changes `videos/**` auto-dispatches with the defaults.

---

## HyperFrames

From the private production repo:

```bash
node tools/cloud-render.mjs stage <slug>     # copies videos/<slug> here
node tools/cloud-render.mjs dispatch <slug>  # 20 runners
node tools/cloud-render.mjs download <slug>  # release -> videos/<slug>/renders/
```

Or stage any HyperFrames folder directly:

```bash
node tools/stage-hyperframes.mjs /path/to/project <slug>
gh workflow run render.yml -R Itsmeakash248/render-cloud \
  -f slug=<slug> -f kind=hyperframes -f chunks=20 -f workers=4
```

`stage-hyperframes.mjs` copies the source only (no `renders/`, `review/`,
`node_modules/` or generated caches). The workflow reads `data-duration`, installs
the HyperFrames version the project pins in `package.json`, plans time chunks,
runs `hyperframes render --workers 4` on each runner, then stitches the chunks
losslessly.

---

## Canvas

A canvas project supplies `cloud.json` in its own folder:

```json
{
  "output": "ino-tadataka",
  "fps": 24,
  "ar": "16x9",
  "duration": 561.203,
  "audio": "data/mix.m4a",
  "share": true,
  "include": [
    "index.html", "src", "fonts", "assets",
    "tools/capture.mjs", "data/lines.json", "data/words.json", "data/mix.m4a"
  ]
}
```

Then:

```bash
node tools/stage-canvas.mjs /path/to/project <slug>
gh workflow run render.yml -R Itsmeakash248/render-cloud \
  -f slug=<slug> -f kind=canvas -f chunks=20 -f workers=4
```

`stage-canvas.mjs` tars the include list into `videos/<slug>/bundle.tar.gz`
(opaque on the public repo), writes `render.json`, commits with `[skip ci]`,
and pushes. The workflow extracts the bundle on each runner, renders frame-exact
chunks with `tools/capture.mjs ... 4`, stitches the picture, muxes the AAC
audio, and (if `share: true`) encodes a 720p share copy.

Audio must already be compressed (m4a/mp3) and under ~50 MB; WAV masters stay
local.

Concept Carousel shorts have a helper that reads the live duration, encodes the
WAV bed to AAC, writes `cloud.json`, and calls `stage-canvas.mjs`:

```bash
cd /home/akash/Studio/concept-carousel
node tools/cloud-short.mjs shorts/s01e02-what-if-the-moon-was-a-mirror
```

Proven on the hub: the 34 s vertical short rendered as 816 frames, 1080×1920,
with a 720×1280 share copy.

---

## Delivery

Releases are tagged `deliverable-<slug>-<run_number>` and contain:

- hyperframes: `<slug>.mp4`
- canvas: `<output>-master.mp4`, `<output>-share.mp4`

The merge job verifies frame counts and reports EBU R128 loudness before the
release is published. Cleanup then force-pushes a history with `videos/<slug>`
removed and deletes the run's artifacts.

---

## Local layout

`/home/akash/Studio/render-cloud` is a normal standalone clone (it used to be
the `renders/` submodule of `RenderedLabs`). The RenderedLabs tooling points at
`../render-cloud`.
