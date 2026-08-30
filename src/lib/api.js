/* Browser API shim and settings store.
 *
 * Chrome exposes `chrome`, Firefox exposes both `browser` and `chrome`. Both
 * support promise-returning storage under MV3, so one namespace covers them.
 *
 * Nothing else in the extension touches `chrome.*` except 06-main.js -- the UI
 * and the palette stay free of extension APIs so dev/preview.html can run them
 * as plain page scripts.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.env = (() => {
  "use strict";
  const api = globalThis.browser ?? globalThis.chrome;

  /* Reloading, updating or disabling the extension leaves the content script
   * running in tabs that were already open, but every `chrome.*` call from it
   * then throws "Extension context invalidated". `runtime.id` is the cheap
   * probe: it reads undefined once the context is gone, and the getter itself
   * can throw, hence the try. */
  const alive = () => {
    try { return api.runtime?.id != null; } catch { return false; }
  };

  return {
    api,
    alive,
    /** Absolute URL for a packaged file, e.g. url("src/ui") -> chrome-extension://.../src/ui */
    url: (path) => api.runtime.getURL(path),
  };
})();

YTMD.settings = (() => {
  "use strict";
  const { api, alive } = YTMD.env;

  // `panel` is one value rather than two booleans because lyrics and the queue
  // are mutually exclusive -- with two flags every writer would have to
  // remember to clear the other one, and the popup would be lying about what a
  // switch does.
  const DEFAULTS = Object.freeze({
    enabled: true,        // master switch -- off removes the button and unmounts
    panel: "none",        // "none" | "lyrics" | "queue"
    gradientMotion: true,
    // The only setting that lets anything leave the machine: with it off,
    // lyrics come from YouTube Music's own panel and nothing is requested.
    syncedLyrics: true,
    lyricsSeek: true,     // clicking a timed line jumps to it
    lyricsOffset: 0,      // ms, user correction; [ and ] in the display
  });

  // storage.sync can be unavailable (Firefox without an add-on ID, or a policy
  // that disables it). Local is a fine fallback -- these are a few flags.
  const area = () => api.storage.sync ?? api.storage.local;

  // An orphaned content script is an expected end state, not a fault worth
  // logging on every keypress -- 06-main.js notices and shuts itself down.
  async function read() {
    try {
      return { ...DEFAULTS, ...(await area().get(DEFAULTS)) };
    } catch (err) {
      if (alive()) console.warn("[YTM Ambient Display] could not read settings, using defaults:", err);
      return { ...DEFAULTS };
    }
  }

  async function write(patch) {
    try {
      await area().set(patch);
    } catch (err) {
      if (alive()) console.warn("[YTM Ambient Display] could not save settings:", err);
    }
  }

  /** Calls back with only the keys that changed. */
  function subscribe(fn) {
    api.storage.onChanged.addListener((changes) => {
      const patch = {};
      for (const key of Object.keys(DEFAULTS)) {
        if (key in changes) patch[key] = changes[key].newValue;
      }
      if (Object.keys(patch).length) fn(patch);
    });
  }

  return { DEFAULTS, read, write, subscribe };
})();
