# videos/

Staging area for the render workflow. **This folder is transient.**

- `<slug>/` is written by `stage-canvas.mjs` or `stage-hyperframes.mjs`.
- A dispatch renders it, attaches deliverables to a GitHub Release, then the
  cleanup job removes `videos/<slug>/` from history and force-pushes.
- Between runs the folder should contain only `.gitkeep` and this README.

Do not treat this folder as storage. Finished files belong on the
[Releases](https://github.com/Itsmeakash248/render-cloud/releases) page; the
editable sources live in `amber-margins`, `concept-carousel` or `RenderedLabs`.

## Slug map

| Slug pattern | Source | Engine |
|---|---|---|
| `amber-margins-<episode>` | `amber-margins/episodes/<episode>` | canvas |
| `cc-<short>` | `concept-carousel/shorts/<short>` | canvas |
| `concept-carousel-hf-<short>` | `concept-carousel/shorts/hyperframes-<short>` | hyperframes |
| `<video-slug>` | `RenderedLabs/videos/<video-slug>` | hyperframes |
