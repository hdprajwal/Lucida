# Contributing to Lucida

Thanks for wanting to help! Lucida is a tiny, dependency-free web app — contributing is
deliberately low-friction.

## Project philosophy

Before you open a PR, internalize the three rules that define Lucida (also in
[`AGENTS.md`](../AGENTS.md)):

1. **Everything stays on-device.** No uploading user images, ever. No remote processing.
2. **No build step.** Buildless vanilla HTML/CSS/JS. No bundler, no framework, no
   `node_modules`.
3. **Works offline.** The service worker caches the shell.

A change that breaks any of these won't be merged, however nice it is otherwise.

## Getting set up

You only need a browser and a static file server. There is nothing to install.

```bash
git clone <your-fork-url>
cd lucida
python3 -m http.server 8000 -d public
# open http://localhost:8000
```

The app lives in **`public/`** (that's what gets deployed); everything else in the repo
is docs/config and isn't served. Any static server works (`npx serve public`, etc.).
Edit a file, refresh the page.

### Heads-up: the camera needs HTTPS or localhost

Browsers only allow `getUserMedia` in a **secure context**. `localhost` counts, so
desktop dev is fine. But `file://` and plain-`http://` LAN IPs do **not**, so the camera
will silently fail there. To test on a real phone, serve over HTTPS (GitHub Pages or an
HTTPS tunnel like `cloudflared tunnel --url http://localhost:8000`).

If the service worker serves you stale files during development, open DevTools →
Application → Service Workers → "Unregister", then hard-reload.

## Code layout

See [`AGENTS.md`](../AGENTS.md) for the full architecture. The short version:

| File | What it owns |
|------|--------------|
| `public/index.html` | Landing page |
| `public/app.html` | Studio markup (stage, toolbar, sheets, drawer) + studio-only CSS |
| `public/assets/styles.css` | Shared design system (tokens + components) |
| `public/assets/app.js` | All studio behavior (one IIFE) |
| `public/assets/store.js` | `LucidaStore` — IndexedDB + localStorage |
| `public/sw.js` | Offline caching |

## Style guide

- **Vanilla DOM.** No JSX, no TypeScript. Use the existing `$(id)` helper and keep
  `app.js` as a single IIFE.
- **Reuse the design system.** Prefer existing classes (`.btn`, `.tool`, `.card`,
  `.sheet`, `.slider`) and CSS variables (`--ink`, `--paper`, `--coral`, `--r-rough`)
  over new bespoke styles.
- **Stay on-brand.** The look is playful sketchbook/zine — cream paper, charcoal marker
  lines, wobbly hand-drawn borders, chunky offset shadows, doodle icons. New UI should
  feel hand-drawn, not flat/material.
- **Touch-first.** Big tap targets; use Pointer Events for any drag/gesture; set
  `touch-action: none` on draggable surfaces.
- **Two-space indentation**, semicolons, single quotes in JS — match the surrounding
  code.
- Respect `prefers-reduced-motion` (handled globally; don't override it).
- If you add a file to the app shell, add it to the `SHELL` array in `sw.js` **and** bump
  the `CACHE` version string.

## Manual test checklist

There's no automated suite — verify by hand before opening a PR (a laptop webcam stands
in for the phone):

- [ ] Landing page renders; "Start tracing" navigates to the studio
- [ ] Splash plays, then reveals the studio
- [ ] "Enable camera" works; denying it shows the graceful error card
- [ ] Loading an image overlays it; opacity slider fades it
- [ ] Drag / pinch-zoom / rotate work; **Lock** ignores gestures; flip & reset work
- [ ] Edge detection produces line-art; sensitivity slider changes it
- [ ] Filters (grayscale/contrast/brightness/invert) apply live and stack with edges
- [ ] Freeze pauses the feed; grid toggles
- [ ] Reload restores prefs; the tracing appears in history; reopening restores its
      transform/filters; delete and "Clear all" work
- [ ] No errors in the browser console

## Submitting changes

1. Branch off `main`.
2. Keep PRs focused; describe what you changed and how you tested it (attach a
   screenshot/video for UI changes — this is a visual project).
3. Confirm the three core rules still hold and the checklist passes.

By contributing you agree your work is licensed under the project's
[MIT License](../LICENSE).
