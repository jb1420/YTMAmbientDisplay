/* Bootstrap: settings, the button in YouTube Music's player bar, and the wiring
 * between the adapter and the display.
 *
 * The overlay is mounted hidden at startup rather than on first click. Mounting
 * fetches the stylesheet, and awaiting anything before calling
 * requestFullscreen() risks losing the user activation that makes it legal.
 */

(() => {
  "use strict";

  const { adapter, palette, lyrics, queue, settings, Overlay, env } = YTMD;

  const ASSETS = env.url("src");

  const state = {
    settings: { ...settings.DEFAULTS },
    track: { key: null },
    open: false,
  };

  let overlay = null;
  let unwatchPlayer = null;
  let unwatchQueue = null;

  // What the chevron reopens. Not persisted -- `panel` already is, and this
  // only has to survive the current session.
  let lastPanel = "lyrics";

  /* ------------------------------------------------------------- button -- */

  const BUTTON_ID = "ytm-display-button";

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.title = "YTM Ambient Display 전체화면";
    btn.setAttribute("aria-label", "YTM Ambient Display 전체화면");
    btn.style.cssText = [
      "width:40px", "height:40px", "display:inline-grid", "place-items:center",
      "padding:0", "border:0", "border-radius:50%", "background:transparent",
      "color:currentColor", "opacity:.7", "cursor:pointer",
      "transition:opacity 160ms", "flex:none",
    ].join(";");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
      '<path d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM6 15v3h3v2H4v-5h2zm12 3v-3h2v5h-5v-2h3z"/>' +
      '<path d="M8.5 8.5h7v7h-7v-7zm1.5 1.5v4h4v-4h-4z" opacity=".55"/></svg>';
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = ".7"));
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openDisplay();
    });
    return btn;
  }

  /* YTM rebuilds parts of the player bar, so the button is re-inserted if it
   * disappears rather than injected once and trusted. */
  function keepButtonMounted() {
    const place = () => {
      if (!state.settings.enabled) return;
      if (document.getElementById(BUTTON_ID)) return;
      const controls = document.querySelector(adapter.SEL.rightControls);
      if (!controls) return;
      const expand = document.querySelector(adapter.SEL.expand);
      controls.insertBefore(makeButton(), expand ?? null);
    };
    place();
    return setInterval(place, 2000);
  }

  const removeButton = () => document.getElementById(BUTTON_ID)?.remove();

  /* ------------------------------------------------------------ display -- */

  async function ensureOverlay() {
    if (overlay) return overlay;
    overlay = new Overlay({
      assetsBase: ASSETS,
      handlers: {
        onPlayPause: () => adapter.playPause(),
        onPrev: () => adapter.prev(),
        onNext: () => adapter.next(),
        onSeek: (sec) => adapter.seek(sec),
        onQueuePick: (i) => queue.play(i),
        onExit: () => closeDisplay(),
        // Two separate jobs: the switcher chooses which of the two shows, the
        // chevron opens and closes the column and comes back to whichever was
        // last open.
        onSelectPanel: (name) => settings.write({ panel: name }),
        onToggleNotes: () => {
          if (state.settings.panel === "none") {
            settings.write({ panel: lastPanel });
          } else {
            lastPanel = state.settings.panel;
            settings.write({ panel: "none" });
          }
        },
      },
    });
    await overlay.mount(document.documentElement);
    overlay.setMotion(state.settings.gradientMotion);
    applyPanel();
    return overlay;
  }

  function openDisplay() {
    if (!overlay) return;              // mounted at startup; nothing to await
    state.open = true;
    overlay.open();
    overlay.requestFullscreen();
    // Re-checked here as well as on track change: by the time anyone opens the
    // display the page has long finished settling, so this is the reading worth
    // trusting.
    reportDiagnostics();
    refreshTrackDependents(true);
    refreshQueue();
  }

  function closeDisplay() {
    state.open = false;
    overlay?.close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ------------------------------------------------------------- wiring -- */

  function applyPanel() {
    overlay?.setPanel(state.settings.panel);
  }

  async function refreshPalette(key, artUrl) {
    const tokens = await palette.extract(artUrl);
    if (state.track.key !== key) return;     // a newer track won
    overlay?.setPalette(tokens);
  }

  async function refreshLyrics(key) {
    if (state.settings.panel !== "lyrics") return;
    overlay?.setLyrics({ state: "loading" });
    const result = await lyrics.fetchFor(key);
    if (state.track.key !== key) return;
    overlay?.setLyrics(result);
  }

  function refreshQueue() {
    if (!state.open || state.settings.panel !== "queue") return;
    overlay?.setQueue({ items: queue.read() });
  }

  function refreshTrackDependents(force = false) {
    if (!state.open && !force) return;
    const { key, artSmallUrl } = state.track;
    if (!key) return;
    refreshPalette(key, artSmallUrl);
    refreshLyrics(key);
  }

  function onTrack(track) {
    state.track = track;
    overlay?.setTrack({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artUrl: track.artUrl,
    });
    reportDiagnostics();
    if (!state.open) return;
    refreshTrackDependents();
    refreshQueue();
  }

  function onPlayback(pb) {
    if (!state.open) return;
    overlay?.setPlayback(pb);
  }

  /* Surfaces a YTM DOM change instead of failing silently.
   *
   * Cleared as well as set. The player bar is assembled piece by piece, so the
   * first track event can easily land while a node is still missing; reporting
   * without ever clearing left that startup flicker pinned to the screen for the
   * rest of the session. */
  function reportDiagnostics() {
    if (!overlay) return;
    const missing = adapter.diagnose();
    overlay.setDiagnostic(missing.length ? `DOM 불일치: ${missing.join(", ")}` : "");
  }

  /* ------------------------------------------------------------ startup -- */

  function startWatching() {
    unwatchPlayer?.();
    unwatchQueue?.();
    unwatchPlayer = adapter.watch({ onTrack, onPlayback });
    unwatchQueue = queue.watch(refreshQueue);
  }

  function stopWatching() {
    unwatchPlayer?.(); unwatchPlayer = null;
    unwatchQueue?.(); unwatchQueue = null;
  }

  let buttonTimer = null;

  async function enable() {
    await ensureOverlay();
    startWatching();
    buttonTimer ??= keepButtonMounted();
  }

  function disable() {
    closeDisplay();
    stopWatching();
    clearInterval(buttonTimer);
    buttonTimer = null;
    removeButton();
    overlay?.destroy();
    overlay = null;
  }

  async function boot() {
    state.settings = await settings.read();
    if (state.settings.panel !== "none") lastPanel = state.settings.panel;

    // The player bar is built after the app shell; wait for it rather than
    // racing it.
    if (!adapter.ready()) {
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (adapter.ready()) { clearInterval(timer); resolve(); }
        }, 400);
      });
    }

    if (state.settings.enabled) await enable();

    settings.subscribe(async (patch) => {
      const wasEnabled = state.settings.enabled;
      Object.assign(state.settings, patch);

      if ("enabled" in patch && patch.enabled !== wasEnabled) {
        if (patch.enabled) await enable();
        else disable();
        return;
      }
      if (!state.settings.enabled) return;

      if ("gradientMotion" in patch) overlay?.setMotion(patch.gradientMotion);
      if ("panel" in patch) {
        applyPanel();
        if (patch.panel === "lyrics") refreshLyrics(state.track.key);
        if (patch.panel === "queue") refreshQueue();
      }
    });

    // Leaving fullscreen -- by Escape, F11 or the browser UI -- closes the
    // display, so the two never disagree.
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && state.open) closeDisplay();
    });
  }

  boot().catch((err) => console.error("[YTM Ambient Display] failed to start:", err));
})();
