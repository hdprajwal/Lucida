/* ===========================================================================
   Lucida — on-device persistence
   - IndexedDB ("lucida" db, "projects" store): reference image blobs + the
     transform/filter settings for each tracing. Image data NEVER leaves the device.
   - localStorage ("lucida.prefs"): lightweight UI prefs for instant restore.
   Exposes a global `LucidaStore`.
   =========================================================================== */
const LucidaStore = (() => {
  const DB_NAME = 'lucida';
  const STORE = 'projects';
  const VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('lastOpened', 'lastOpened');
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) {
    return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
  }

  function reqToPromise(request) {
    return new Promise((res, rej) => {
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
  }

  const uid = () =>
    'p_' + Math.abs(Math.floor(performance.now() * 1000)).toString(36) +
    '_' + (crypto.getRandomValues(new Uint32Array(1))[0]).toString(36);

  /* Build a small JPEG thumbnail blob from an Image, longest side = max px. */
  function makeThumb(img, max = 320) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.7));
  }

  return {
    /* Create a project from a freshly loaded image + its name + the full-res blob. */
    async create({ name, imageBlob, img, settings }) {
      const thumb = await makeThumb(img);
      const now = Date.now();
      const project = {
        id: uid(), name, image: imageBlob, thumb,
        ...settings, createdAt: now, lastOpened: now,
      };
      const store = await tx('readwrite');
      await reqToPromise(store.put(project));
      return project;
    },

    /* Patch settings (tf/filters/opacity/etc.) on an existing project. */
    async update(id, patch) {
      const store = await tx('readwrite');
      const existing = await reqToPromise(store.get(id));
      if (!existing) return null;
      const merged = { ...existing, ...patch, lastOpened: Date.now() };
      await reqToPromise(store.put(merged));
      return merged;
    },

    async get(id) {
      const store = await tx('readonly');
      return reqToPromise(store.get(id));
    },

    /* All projects, newest-opened first. */
    async list() {
      const store = await tx('readonly');
      const all = await reqToPromise(store.getAll());
      return all.sort((a, b) => b.lastOpened - a.lastOpened);
    },

    async remove(id) {
      const store = await tx('readwrite');
      return reqToPromise(store.delete(id));
    },

    async clear() {
      const store = await tx('readwrite');
      return reqToPromise(store.clear());
    },

    /* ---- lightweight UI prefs (localStorage) ---- */
    prefs: {
      _key: 'lucida.prefs',
      load() {
        try { return JSON.parse(localStorage.getItem(this._key)) || {}; }
        catch { return {}; }
      },
      save(obj) {
        try { localStorage.setItem(this._key, JSON.stringify(obj)); } catch {}
      },
    },
  };
})();
