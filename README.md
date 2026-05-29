# Lucida ✦

**Turn your phone into a tracing tool.** Prop your phone over a sheet of paper, open any
reference image, fade it down over the live camera view, and draw what shows through —
straight onto the page below. It's a pocket *camera lucida*, the optical device artists
have used for centuries to trace what they see.

**→ Live app: [lucida.hdprajwal.dev](https://lucida.hdprajwal.dev)**

Everything happens **on your device**. Your image is never uploaded, there's no account,
and there's no server. It even works offline.

---

## What you need

- A **phone or tablet** with a rear camera.
- A way to **hold it steady above your paper** — a phone tripod/overhead arm is ideal,
  but a stack of books, a shelf edge, or a clamp all work fine.
- A **reference image** saved on the device (a photo, a drawing, a sketch — anything).

## How to trace

1. Open **[lucida.hdprajwal.dev](https://lucida.hdprajwal.dev)** and tap **Start tracing**,
   then **Enable camera** (allow access when asked).
2. **Position your phone** above a blank sheet of paper so the camera looks straight down
   at it.
3. Tap the **image button** and pick your reference picture — it appears over the camera.
4. **Drag, pinch, and rotate** the image until it sits where you want on the paper, then
   tap **Lock** so it won't shift while you draw.
5. Slide the **Opacity** down to around 30–50% so you can see both the image *and* your
   pencil through it.
6. **Trace the lines you see** onto the paper. That's it.

> Tip: for busy photos, turn on **Edge detection** to get clean outlines instead of a
> full picture — much easier to follow.

## What's inside

- 📷 **Live camera overlay** with a big **opacity** slider — the heart of it.
- ✋ **Move, pinch-zoom, and rotate** the image, plus **lock**, **flip**, and **reset** so
  you can line it up perfectly and keep it put.
- ✏️ **Edge detection** turns a photo into clean line-art that's far easier to trace.
- 🎨 **Filters** — grayscale, contrast, brightness, and invert — to make lines pop.
- ❄️ **Freeze frame** holds a steady still if your setup is a little shaky.
- 🔲 **Grid** overlay (rule of thirds) to help with proportions.
- 📒 **History** — every image you trace is saved on your device and reopens exactly how
  you left it (position, zoom, filters and all).
- 📲 **Install it like an app** — add it to your home screen; it works offline and keeps
  the screen awake while you draw.

## Tips for the best results

- **Mount it steady.** The less the phone moves, the easier tracing is. An overhead phone
  stand is worth it if you trace often.
- **Light the paper evenly** and keep your drawing hand from casting a shadow under the
  camera.
- **Lock the image** before you start drawing so a stray touch doesn't nudge it.
- **Freeze the frame** if you can't get the phone perfectly still.
- Your work lives in this browser on this device — **clearing the site's data erases your
  history**, and it won't sync between devices.

## Privacy

The only thing that ever touches the network is the page itself (and a web font on first
load). Your reference images and your tracing history stay **exclusively in this browser,
on this device**. Nothing is uploaded, tracked, or sent anywhere.

---

## For developers

Lucida is a tiny, dependency-free static site — no build step, no framework. To run it
locally:

```bash
python3 -m http.server 8000 -d public   # then open http://localhost:8000
```

**Heads-up:** the camera only works in a *secure context* — `https://` or `localhost`.
Over `file://` or a plain-`http://` LAN address it's silently blocked by the browser, so
to test on your phone you need HTTPS (any host works — this site runs on Cloudflare
Pages).

Architecture, conventions, and how to contribute live in
**[AGENTS.md](AGENTS.md)** and **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**.

## License

Released under the **MIT License** — free to use, modify, and distribute, including
commercially, with attribution. See [LICENSE](LICENSE) for the full text.

Copyright © 2026 Prajwal HD.
