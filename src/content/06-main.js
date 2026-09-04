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
    btn.title = "YTM Ambient Display 전체화면 (G)";
    btn.setAttribute("aria-label", "YTM Ambient Display 전체화면 (G)");
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
      if (!checkAlive()) return;
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

  /* ---------------------------------------------------- orphaned script -- */

  /* Reloading, updating or disabling the extension leaves this script running
   * against a dead extension context: every settings write throws
   * "Extension context invalidated", storage.onChanged never fires again, and
   * the panel quietly stops responding while the keydown handler goes on
   * swallowing G/C/Q that YTM would otherwise get.
   *
   * Nothing here can be revived -- only a page reload brings the new copy in --
   * so the honest move is to take everything down and say so once. */
  let orphaned = false;

  function checkAlive() {
    if (orphaned) return false;
    if (env.alive()) return true;
    orphaned = true;
    disable();
    console.warn(
      "[YTM Ambient Display] 확장이 다시 로드되어 이 탭의 스크립트는 중지되었습니다. " +
      "페이지를 새로고침하면 다시 동작합니다.",
    );
    return false;
  }

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
        onSetVolume: (level) => adapter.setVolume(level),
        onToggleMute: () => adapter.toggleMute(),
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
    // The level is the player's, not ours, and it was already set before the
    // display existed. Read once here so the control is right the first time it
    // is looked at; every change after this arrives on volumechange.
    overlay.setVolume(adapter.getVolume());
    applyLyricSettings();
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
    // Safe to read the bar directly here and below: both are moments the user
    // chose, long after any track change has settled. Needed because a paused
    // track produces no playback tick to start the lookup from.
    refreshLyrics(state.track, adapter.getPlayback().duration);
    refreshQueue();
  }

  function closeDisplay() {
    state.open = false;
    overlay?.close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* --------------------------------------------------------- shortcuts -- */

  /* G toggles the display, C and Q pick a panel and turn it off again when the
   * panel they name is already showing.
   *
   * Matched on `ev.code`, not `ev.key`: with a Korean IME on, the same physical
   * keys report ㅎ/ㅊ/ㅂ, and the shortcuts have to keep working there. */
  const PANEL_KEYS = { KeyC: "lyrics", KeyQ: "queue" };

  /* [ and ] nudge the lyrics against the clock. Somebody only ever notices the
   * drift while a song is playing, so the correction lives where they are
   * rather than in the popup, and it is saved -- a database whose timings run
   * early tends to run early on the next track too.
   *
   * The bracket keys sit at the same physical place on a Korean layout, so
   * ev.code works here for the same reason it does for G and C. */
  const NUDGE_KEYS = { BracketLeft: -100, BracketRight: 100 };
  const NUDGE_LIMIT = 5000;
  let nudgeTimer = null;

  function nudgeLyrics(ms) {
    const next = Math.max(-NUDGE_LIMIT,
                          Math.min(NUDGE_LIMIT, state.settings.lyricsOffset + ms));
    if (next === state.settings.lyricsOffset) return;
    settings.write({ lyricsOffset: next });

    // Borrowed, not built: the top bar already has a slot for a passing word,
    // and reportDiagnostics() puts back whatever belonged there.
    const shown = (next / 1000).toFixed(1);
    overlay?.setDiagnostic(`가사 ${next > 0 ? "+" : ""}${shown}s`);
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(reportDiagnostics, 1200);
  }

  function togglePanel(name) {
    if (state.settings.panel === name) {
      lastPanel = name;                    // what the chevron comes back to
      settings.write({ panel: "none" });
    } else {
      settings.write({ panel: name });
    }
  }

  /* YTM's search box and any other field the user is typing into keep their
   * letters. composedPath() is what reaches inside the overlay's shadow root. */
  function isTyping(ev) {
    return ev.composedPath().some((node) => {
      const tag = node?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
             node?.isContentEditable;
    });
  }

  function onShortcut(ev) {
    if (!checkAlive()) return;           // orphaned: leave the key to YTM
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (ev.isComposing || isTyping(ev)) return;

    if (ev.code === "KeyG") {
      // The keypress is the user gesture that makes requestFullscreen() legal,
      // so openDisplay() has to run on it directly.
      if (state.open) closeDisplay();
      else openDisplay();
    } else if (state.open && ev.code in PANEL_KEYS) {
      togglePanel(PANEL_KEYS[ev.code]);
    } else if (state.open && state.settings.panel === "lyrics" && ev.code in NUDGE_KEYS) {
      nudgeLyrics(NUDGE_KEYS[ev.code]);
    } else {
      return;
    }

    // Claimed before YTM's own single-letter shortcuts see it.
    ev.preventDefault();
    ev.stopPropagation();
  }

  /* ------------------------------------------------------------- wiring -- */

  function applyPanel() {
    overlay?.setPanel(state.settings.panel);
  }

  function applyLyricSettings() {
    overlay?.setLyricsOffset(state.settings.lyricsOffset / 1000);
    overlay?.setLyricsSeekable(state.settings.lyricsSeek);
  }

  async function refreshPalette(key, artUrl) {
    const tokens = await palette.extract(artUrl);
    if (state.track.key !== key) return;     // a newer track won
    overlay?.setPalette(tokens);
  }

  // What the lyrics on screen belong to. Separate from state.track.key because
  // a track can be current for a second or two before it can be looked up.
  let lyricsKey = null;

  /* The running time is half of what identifies a recording to a lyrics
   * database, so it is passed in rather than read here: only the caller knows
   * whether the length it is holding belongs to this track yet. On a track
   * change the player bar carries the outgoing track's for up to two seconds,
   * and a lookup keyed on the wrong length matches nothing at all -- which is
   * indistinguishable, from here, from a track nobody has ever transcribed. */
  async function refreshLyrics(track, duration) {
    if (!state.open || state.settings.panel !== "lyrics" || !track?.key) return;
    if (lyricsKey === track.key) return;
    if (!(duration > 0)) return;

    lyricsKey = track.key;
    overlay?.setLyrics({ state: "loading" });
    const result = await lyrics.fetchFor(track, {
      duration,
      allowNetwork: state.settings.syncedLyrics,
    });
    if (state.track.key !== track.key) return;   // a newer track won
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
    // Lyrics are not refreshed here. The playback tick is the only caller that
    // knows whether the length on the bar has caught up with the title.
  }

  function onTrack(track) {
    state.track = track;
    lyricsKey = null;
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

  /* Not gated on `state.open`, unlike the playback tick. It fires only when
   * somebody moves the volume, so keeping it current costs nothing and means
   * the column never opens showing a level that is out of date -- including
   * when the change came from YTM's own slider while the display was closed. */
  function onVolume(vol) {
    overlay?.setVolume(vol);
  }

  function onPlayback(pb) {
    if (!state.open) return;
    overlay?.setPlayback(pb);
    // The tick is what carries a length that belongs to the track on screen,
    // so this is where the lookup starts. Cheap: it returns immediately once
    // this track has been looked up once.
    if (!pb.settling) refreshLyrics(state.track, pb.duration);
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
    unwatchPlayer = adapter.watch({ onTrack, onPlayback, onVolume });
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
    window.addEventListener("keydown", onShortcut, true);
  }

  function disable() {
    closeDisplay();
    window.removeEventListener("keydown", onShortcut, true);
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
      if ("lyricsOffset" in patch || "lyricsSeek" in patch) applyLyricSettings();
      // Turning the lookup on or off changes where the words come from, so
      // whatever is on screen is now the answer to a question nobody asked.
      if ("syncedLyrics" in patch) {
        lyrics.forget();
        lyricsKey = null;
        refreshLyrics(state.track, adapter.getPlayback().duration);
      }
      if ("panel" in patch) {
        applyPanel();
        if (patch.panel === "lyrics") {
          refreshLyrics(state.track, adapter.getPlayback().duration);
        }
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
