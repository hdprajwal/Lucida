/* ===========================================================================
   Lucida — studio logic
   Camera overlay + transform gestures + filters + Sobel edges + freeze/grid +
   on-device history. Nothing is uploaded; the image lives only in this tab and
   (optionally) in IndexedDB on this device.
   =========================================================================== */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---- elements ----------------------------------------------------------
  const cam = $('cam'), freeze = $('freeze'), overlay = $('overlay'), grid = $('grid');
  const gate = $('gate'), gateTitle = $('gate-title'), gateMsg = $('gate-msg');
  const fileInput = $('file-input');
  const octx = overlay.getContext('2d');
  const fctx = freeze.getContext('2d');

  // ---- state -------------------------------------------------------------
  const PROC_MAX = 1600; // cap the overlay canvas's long side (edge-detect perf)
  const state = {
    img: null,            // source HTMLImageElement
    imageBlob: null,      // original file blob (for history)
    edgeMode: false,
    threshold: 30,        // 5..80
    tf: { x: 0, y: 0, scale: 1, rot: 0, flip: 1 },
    filters: { gray: 0, contrast: 100, bright: 100, invert: 0 },
    opacity: 50,
    locked: false,
    frozen: false,
    grid: false,
    minimal: false,
    projectId: null,
  };
  let stream = null, wakeLock = null;
  let needsPixelRedraw = true; // only re-run drawImage/Sobel when content changes

  // ---- splash ------------------------------------------------------------
  setTimeout(() => $('splash').classList.add('hide'), 1500);

  // =========================================================================
  // Camera
  // =========================================================================
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      cam.srcObject = stream;
      await cam.play().catch(() => {});
      gate.classList.add('hide');
      requestWakeLock();
    } catch (err) {
      showCameraError(err);
    }
  }

  function showCameraError(err) {
    gate.classList.remove('hide');
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      gateTitle.textContent = 'Camera blocked';
      gateMsg.textContent = 'You’ll need to allow camera access in your browser, then tap again. (Lucida only works over https:// or localhost.)';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      gateTitle.textContent = 'No camera found';
      gateMsg.textContent = 'Lucida couldn’t find a camera on this device.';
    } else {
      gateTitle.textContent = 'Couldn’t start the camera';
      gateMsg.textContent = (err && err.message) || 'Something went wrong. Tap to try again.';
    }
    $('enable-cam').textContent = 'Try again';
  }

  $('enable-cam').addEventListener('click', startCamera);

  // Wake lock — keep the screen on while tracing.
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { requestWakeLock(); if (stream && !state.frozen) cam.play().catch(() => {}); }
  });

  // =========================================================================
  // Image loading
  // =========================================================================
  $('t-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadImageFromBlob(file, file.name.replace(/\.[^.]+$/, '') || 'Untitled');
    fileInput.value = '';
  });

  function loadImageFromBlob(blob, name, opts = {}) {
    const { saveNew = true, keepTransform = false } = opts;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      state.imageBlob = blob;
      sizeOverlayCanvas(img);
      needsPixelRedraw = true;
      if (!keepTransform) fitToViewport(); // restores keep their saved tf
      render();
      if (saveNew) createProject(name);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t open that image'); };
    img.src = url;
  }

  // Set the overlay canvas pixel size (capped) — this is also the edge-detect resolution.
  function sizeOverlayCanvas(img) {
    const scale = Math.min(1, PROC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    overlay.width = Math.round(img.naturalWidth * scale);
    overlay.height = Math.round(img.naturalHeight * scale);
    // Display the canvas at its intrinsic CSS pixel size; tf.scale resizes from there.
    overlay.style.width = overlay.width + 'px';
    overlay.style.height = overlay.height + 'px';
  }

  function fitToViewport() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const fit = Math.min((vw * 0.85) / overlay.width, (vh * 0.8) / overlay.height);
    state.tf = { x: 0, y: 0, scale: fit || 1, rot: 0, flip: 1 };
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function render() {
    if (!state.img) { overlay.style.display = 'none'; return; }
    overlay.style.display = 'block';

    if (needsPixelRedraw) {
      drawOverlayPixels();
      needsPixelRedraw = false;
    }

    const f = state.filters;
    overlay.style.opacity = state.opacity / 100;
    overlay.style.filter =
      `grayscale(${f.gray}%) contrast(${f.contrast}%) brightness(${f.bright}%) invert(${f.invert})`;

    const t = state.tf;
    overlay.style.transform =
      `translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px)) rotate(${t.rot}deg) scale(${t.scale * t.flip}, ${t.scale})`;
  }

  function drawOverlayPixels() {
    const w = overlay.width, h = overlay.height;
    octx.clearRect(0, 0, w, h);
    if (!state.edgeMode) { octx.drawImage(state.img, 0, 0, w, h); return; }
    sobelInto(octx, state.img, w, h, state.threshold);
  }

  // Sobel edge detection → black line-art on transparent background.
  function sobelInto(ctx, img, w, h, thresholdPct) {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(img, 0, 0, w, h);
    const src = tctx.getImageData(0, 0, w, h).data;

    // grayscale luminance buffer
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      gray[i] = 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
    }

    const out = ctx.createImageData(w, h);
    const od = out.data;
    const thr = (thresholdPct / 100) * 1448; // max sobel magnitude ≈ sqrt(2)*4*255
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const tl = gray[i - w - 1], tc = gray[i - w], tr = gray[i - w + 1];
        const ml = gray[i - 1],                     mr = gray[i + 1];
        const bl = gray[i + w - 1], bc = gray[i + w], br = gray[i + w + 1];
        const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        const mag = Math.sqrt(gx * gx + gy * gy);
        const o = i * 4;
        if (mag >= thr) { od[o] = od[o + 1] = od[o + 2] = 17; od[o + 3] = 255; } // ink lines
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // =========================================================================
  // Transform gestures (drag / pinch-scale / twist-rotate)
  // =========================================================================
  const pointers = new Map();
  let gesture = null;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      gesture = { mode: 'drag', sx: pts[0].x, sy: pts[0].y, ox: state.tf.x, oy: state.tf.y };
    } else if (pts.length >= 2) {
      gesture = {
        mode: 'pinch',
        sd: dist(pts[0], pts[1]), sa: angle(pts[0], pts[1]),
        os: state.tf.scale, orot: state.tf.rot,
      };
    } else {
      gesture = null;
    }
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (state.locked) return;
    overlay.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || state.locked || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    if (gesture.mode === 'drag' && pts.length === 1) {
      state.tf.x = gesture.ox + (pts[0].x - gesture.sx);
      state.tf.y = gesture.oy + (pts[0].y - gesture.sy);
    } else if (gesture.mode === 'pinch' && pts.length >= 2) {
      state.tf.scale = Math.max(0.05, gesture.os * (dist(pts[0], pts[1]) / gesture.sd));
      state.tf.rot = gesture.orot + (angle(pts[0], pts[1]) - gesture.sa);
    }
    render();
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    startGesture(); // re-baseline for any remaining pointer
    scheduleSave();
  }
  overlay.addEventListener('pointerup', endPointer);
  overlay.addEventListener('pointercancel', endPointer);

  // =========================================================================
  // Controls
  // =========================================================================
  // opacity (always visible)
  const opacity = $('opacity'), opacityVal = $('opacity-val');
  opacity.addEventListener('input', () => {
    state.opacity = +opacity.value;
    opacityVal.textContent = state.opacity + '%';
    render(); scheduleSave();
  });

  function toggle(btn, on) { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-active', on); }

  $('t-lock').addEventListener('click', () => {
    state.locked = !state.locked;
    toggle($('t-lock'), state.locked);
    toast(state.locked ? 'Position locked 🔒' : 'Position unlocked');
  });
  $('t-flip').addEventListener('click', () => { state.tf.flip *= -1; render(); scheduleSave(); });
  $('t-reset').addEventListener('click', () => { if (state.img) { fitToViewport(); render(); scheduleSave(); toast('Reset'); } });

  $('t-grid').addEventListener('click', () => {
    state.grid = !state.grid;
    grid.classList.toggle('show', state.grid);
    toggle($('t-grid'), state.grid);
    savePrefs();
  });

  $('t-freeze').addEventListener('click', () => {
    if (!stream) return;
    state.frozen = !state.frozen;
    toggle($('t-freeze'), state.frozen);
    if (state.frozen) {
      freeze.width = cam.videoWidth; freeze.height = cam.videoHeight;
      fctx.drawImage(cam, 0, 0);
      freeze.style.display = 'block';
      cam.pause();
      toast('Frame frozen ❄️');
    } else {
      freeze.style.display = 'none';
      cam.play().catch(() => {});
    }
  });

  // ---- sheets ------------------------------------------------------------
  const scrim = $('scrim');
  function openSheet(sheet) { closeSheets(); sheet.classList.add('open'); scrim.classList.add('show'); }
  function closeSheets() { document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open')); if (!$('drawer').classList.contains('open')) scrim.classList.remove('show'); }
  $('t-filters').addEventListener('click', () => openSheet($('sheet-filters')));
  $('t-edges').addEventListener('click', () => openSheet($('sheet-edges')));
  document.querySelectorAll('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheets));
  scrim.addEventListener('click', () => { closeSheets(); closeDrawer(); });

  // ---- filters sheet ----
  const fGray = $('f-gray'), fContrast = $('f-contrast'), fBright = $('f-bright');
  function syncFilterLabels() {
    $('v-gray').textContent = state.filters.gray + '%';
    $('v-contrast').textContent = state.filters.contrast + '%';
    $('v-bright').textContent = state.filters.bright + '%';
    toggle($('f-invert'), !!state.filters.invert);
    fGray.value = state.filters.gray; fContrast.value = state.filters.contrast; fBright.value = state.filters.bright;
  }
  fGray.addEventListener('input', () => { state.filters.gray = +fGray.value; syncFilterLabels(); render(); scheduleSave(); });
  fContrast.addEventListener('input', () => { state.filters.contrast = +fContrast.value; syncFilterLabels(); render(); scheduleSave(); });
  fBright.addEventListener('input', () => { state.filters.bright = +fBright.value; syncFilterLabels(); render(); scheduleSave(); });
  $('f-invert').addEventListener('click', () => { state.filters.invert = state.filters.invert ? 0 : 1; syncFilterLabels(); render(); scheduleSave(); });
  $('f-reset').addEventListener('click', () => { state.filters = { gray: 0, contrast: 100, bright: 100, invert: 0 }; syncFilterLabels(); render(); scheduleSave(); });

  // ---- edges sheet ----
  const eThreshold = $('e-threshold');
  function syncEdgeUi() {
    toggle($('e-toggle'), state.edgeMode);
    toggle($('t-edges'), state.edgeMode);
    $('e-toggle').textContent = state.edgeMode ? 'Turn off edges' : 'Turn on edges';
    $('v-threshold').textContent = state.threshold + '%';
    eThreshold.value = state.threshold;
  }
  $('e-toggle').addEventListener('click', () => {
    state.edgeMode = !state.edgeMode;
    needsPixelRedraw = true; syncEdgeUi(); render(); scheduleSave();
  });
  eThreshold.addEventListener('input', () => {
    state.threshold = +eThreshold.value;
    if (state.edgeMode) needsPixelRedraw = true;
    syncEdgeUi(); render(); scheduleSave();
  });

  // ---- minimal mode (hide chrome, maximize tracing area) ----
  $('btn-minimal').addEventListener('click', () => setMinimal(true));
  $('stage').addEventListener('click', (e) => {
    // tapping empty stage in minimal mode brings controls back
    if (state.minimal && e.target !== overlay) setMinimal(false);
  });
  function setMinimal(on) { state.minimal = on; document.body.classList.toggle('minimal', on); savePrefs(); }

  // =========================================================================
  // History drawer
  // =========================================================================
  const drawer = $('drawer'), gallery = $('gallery');
  $('btn-history').addEventListener('click', openDrawer);
  $('close-drawer').addEventListener('click', closeDrawer);
  $('clear-all').addEventListener('click', async () => {
    if (!confirm('Delete all saved tracings? This can’t be undone.')) return;
    await LucidaStore.clear(); state.projectId = null; renderGallery();
  });

  async function openDrawer() { await renderGallery(); drawer.classList.add('open'); scrim.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('open'); if (!document.querySelector('.sheet.open')) scrim.classList.remove('show'); }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function renderGallery() {
    const items = await LucidaStore.list();
    gallery.innerHTML = '';
    if (!items.length) {
      gallery.innerHTML = `<div id="empty">
        <svg viewBox="0 0 120 90" fill="none" stroke="#22201D" stroke-width="3" stroke-linejoin="round">
          <path d="M10 25 L60 12 L110 25 L60 40 Z" fill="#FBF5E6"/>
          <path d="M10 25 v50 L60 88 v-48" fill="#F3E9D2"/><path d="M110 25 v50 L60 88" fill="#ECE0C4"/>
          <path d="M75 30 l14 -10 m-14 14 l14 -10" stroke="#FF6B5E" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <p class="hand" style="font-size:1.3rem">No tracings yet.<br>Load an image to begin!</p>
      </div>`;
      return;
    }
    const tilts = [-2, 1.5, -1, 2];
    items.forEach((p, idx) => {
      const url = URL.createObjectURL(p.thumb);
      const el = document.createElement('div');
      el.className = 'pg';
      el.style.setProperty('--t', tilts[idx % tilts.length] + 'deg');
      el.innerHTML = `
        <img src="${url}" alt="">
        <div class="meta"><b>${escapeHtml(p.name)}</b><span>${fmtDate(p.lastOpened)}</span></div>
        <button class="del" title="Delete" data-id="${p.id}">×</button>`;
      el.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url));
      el.addEventListener('click', (e) => { if (!e.target.classList.contains('del')) openProject(p.id); });
      el.querySelector('.del').addEventListener('click', async (e) => {
        e.stopPropagation();
        await LucidaStore.remove(p.id);
        if (state.projectId === p.id) state.projectId = null;
        renderGallery();
      });
      gallery.appendChild(el);
    });
  }

  async function openProject(id) {
    const p = await LucidaStore.get(id);
    if (!p) return;
    state.projectId = id;
    state.tf = { ...p.tf };
    state.filters = { ...p.filters };
    state.opacity = p.opacity;
    state.edgeMode = p.edgeMode;
    state.threshold = p.threshold;
    needsPixelRedraw = true;
    applyStateToUi();
    loadImageFromBlob(p.image, p.name, { saveNew: false, keepTransform: true });
    LucidaStore.update(id, {}); // bump lastOpened
    closeDrawer();
    toast('Opened ' + p.name);
  }

  // =========================================================================
  // Persistence
  // =========================================================================
  async function createProject(name) {
    try {
      const p = await LucidaStore.create({
        name, imageBlob: state.imageBlob, img: state.img,
        settings: settingsSnapshot(),
      });
      state.projectId = p.id;
    } catch (e) { /* private mode / quota — app still works in-memory */ }
  }
  function settingsSnapshot() {
    return {
      tf: { ...state.tf }, filters: { ...state.filters },
      opacity: state.opacity, edgeMode: state.edgeMode, threshold: state.threshold,
    };
  }
  let saveTimer = null;
  function scheduleSave() {
    if (!state.projectId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => LucidaStore.update(state.projectId, settingsSnapshot()), 400);
  }

  function savePrefs() {
    LucidaStore.prefs.save({ grid: state.grid, minimal: state.minimal, opacity: state.opacity });
  }

  // =========================================================================
  // UI sync helpers
  // =========================================================================
  function applyStateToUi() {
    opacity.value = state.opacity; opacityVal.textContent = state.opacity + '%';
    toggle($('t-lock'), state.locked);
    toggle($('t-grid'), state.grid); grid.classList.toggle('show', state.grid);
    syncFilterLabels(); syncEdgeUi();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1600);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // keep overlay centered on resize
  window.addEventListener('resize', () => { if (state.img) render(); });

  // ---- init --------------------------------------------------------------
  const prefs = LucidaStore.prefs.load();
  if (typeof prefs.opacity === 'number') { state.opacity = prefs.opacity; }
  if (prefs.grid) state.grid = true;
  applyStateToUi();
  if (state.grid) grid.classList.add('show');
  // Try to start the camera immediately; if the browser needs a gesture, the gate stays up.
  startCamera();
})();
