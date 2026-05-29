# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo. Read this before
making changes.

## What Lucida is

A web-based **camera lucida** for tracing. The user mounts a phone over paper, opens a
reference image, fades its opacity over the live camera feed, and traces it onto the
page below. Think "AR tracing overlay", not a drawing app — Lucida never draws *for*
you, it just shows the reference through the camera.

## Non-negotiable constraints

1. **Everything stays on-device.** The reference image must NEVER be uploaded or sent to
   any server. No analytics that ship image data, no remote image processing. Image data
   lives only in the browser tab and in local IndexedDB. The only acceptable network
   request is the static page shell (and the Google Fonts stylesheet on first load).
   If you add a feature that touches the network with user content, you've broken the
   product's core promise — don't.
2. **No build step.** This is buildless vanilla HTML/CSS/JS. Do not introduce a bundler,
   framework, `node_modules`, or a compile step. It must run by serving the folder as
   static files. Keep dependencies at zero.
3. **It must work offline.** A service worker (`sw.js`) caches the app shell. If you add
   a shell file, add it to the `SHELL` list and bump the `CACHE` version.

## Architecture

The deployable app lives in **`public/`** — that's the only directory a host serves
(its build output directory). Everything outside `public/` (docs, license, this file)
is repo-only and never shipped.

```
public/                      ← deploy this directory (build output = public)
  index.html                 Landing page (marketing + "Start tracing" CTA)
  app.html                   The studio: splash → layered stage → toolbar/sheets/drawer
  assets/styles.css          Shared sketchbook/zine design system (tokens + components)
  assets/app.js              Studio logic — IIFE, no exports, all wiring lives here
  assets/store.js            Persistence: global `LucidaStore` (IndexedDB + localStorage)
  assets/logo.svg            Aperture logo mark (also the splash animation)
  manifest.webmanifest       PWA manifest
  sw.js                      Offline service worker
  _headers                   Cloudflare Pages headers (revalidate sw.js / shells)
README.md · LICENSE · AGENTS.md · docs/CONTRIBUTING.md   ← repo-only, NOT served
```

### The layered stage (`app.html`)
`<video id=cam>` (live feed) → `<canvas id=freeze>` (frozen frame) →
`<canvas id=overlay>` (the reference) → `#grid` → `#toolbar`/sheets/`#drawer`.

The overlay is a **`<canvas>`** (not `<img>`) specifically so edge detection can read
pixels. Keep it that way.

### Rendering model (in `assets/app.js`)
- One `state` object is the single source of truth. `render()` reads it.
- **Pixel content** (raw image vs Sobel edge map) is only redrawn when
  `img`/`edgeMode`/`threshold` change — gated by the `needsPixelRedraw` flag. Do NOT
  redraw pixels on every transform; it's wasteful.
- **Position/scale/rotation** → CSS `transform` on the overlay (GPU; cheap).
- **grayscale/contrast/brightness/invert** → live CSS `filter` (GPU; cheap).
- **Edge detection** → `sobelInto()` writes a black-line-on-transparent ImageData.
- Opacity → `overlay.style.opacity`.

### Persistence (`assets/store.js`)
- IndexedDB `projects` store: `{id, name, image(blob), thumb(blob), tf, filters,
  opacity, edgeMode, threshold, createdAt, lastOpened}`. Image blobs are on-device only.
- `LucidaStore.prefs` is a thin localStorage wrapper for lightweight UI prefs.
- Saves are debounced via `scheduleSave()`; only an active `projectId` gets updated.

## Conventions

- Vanilla DOM, no JSX/TSX. Keep `app.js` as a single IIFE; use the `$(id)` helper.
- Design system first: reach for existing classes/tokens in `styles.css`
  (`.btn`, `.tool`, `.card`, `.sheet`, `.slider`, CSS vars like `--ink`, `--paper`)
  before inventing new styles.
- Visual identity is **playful sketchbook/zine**: cream paper, charcoal marker linework,
  wobbly hand-drawn borders (`--r-rough`), chunky offset "marker" shadows, doodle icons.
  New UI should match this — no flat generic/material look.
- Touch-first: large tap targets, `touch-action: none` on draggable surfaces, Pointer
  Events for gestures (not mouse/touch events separately).
- Respect `prefers-reduced-motion` (already handled globally in `styles.css`).

## Running & testing

```bash
python3 -m http.server 8000 -d public   # then open http://localhost:8000
```

The camera needs a **secure context** (`https://` or `localhost`). Over `file://` or a
plain-`http://` LAN IP the camera is silently blocked — this is a browser rule, not a
bug. For phone testing, serve over HTTPS (GitHub Pages or an HTTPS tunnel).

No automated test suite. Verify changes by hand against the checklist in the plan /
`docs/CONTRIBUTING.md`: landing renders → splash → camera gate → load image → opacity →
transform/lock → edges → filters → freeze → grid → history save/reopen/delete. A laptop
webcam stands in for the phone during desktop dev.

## Gotchas

- Headless browsers have no camera → the gate shows a graceful "Camera blocked" error.
  That's expected; test the tracer by uploading to `#file-input` after hiding the gate.
- `openProject()` must restore the saved transform — it calls `loadImageFromBlob(...,
  {keepTransform:true})` so it does NOT re-fit to the viewport. Don't "fix" that.
- The overlay canvas is capped to `PROC_MAX` (1600px long side) for Sobel performance.
- Bump `CACHE` in `sw.js` whenever a shell file changes, or users get stale cached files.
