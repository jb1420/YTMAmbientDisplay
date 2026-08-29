/* Lyrics, scraped out of YouTube Music's side panel.
 *
 * The lyrics tab renders lazily: until it has been opened once for a track,
 * `ytmusic-description-shelf-renderer` does not exist at all. So the only way
 * to read lyrics is to open the tab, wait, and put the side panel back the way
 * it was. The overlay is covering the page, so none of that is visible.
 *
 * The saving grace, confirmed on a live page: once the shelf has rendered it
 * stays in the DOM after switching tabs away. Queue and lyrics can therefore be
 * shown side by side -- the round trip happens once per track, not per read.
 *
 * The tab is chosen by index, never by label: on a Korean account the tabs read
 * ["다음 트랙", "가사", "댓글", "관련 항목"].
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.lyrics = (() => {
  "use strict";

  const TABS = "ytmusic-player-page tp-yt-paper-tab";
  const SHELF = "ytmusic-description-shelf-renderer";
  const TEXT = `${SHELF} yt-formatted-string.description`;
  const FOOTER = `${SHELF} yt-formatted-string.footer`;
  const MESSAGE = "ytmusic-player-page ytmusic-message-renderer";

  const LYRICS_TAB = 1;      // observed position; corrected at runtime if wrong
  const TIMEOUT_MS = 5000;

  let tabIndex = LYRICS_TAB;
  const cache = new Map();   // track key -> result
  let inFlight = null;

  const tabs = () => [...document.querySelectorAll(TABS)];
  const selectedIndex = () => tabs().findIndex((t) => t.classList.contains("iron-selected"));
  const shelfText = () => document.querySelector(TEXT)?.textContent?.trim() ?? "";
  const shelfSource = () => document.querySelector(FOOTER)?.textContent?.trim() ?? "";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Waits for the panel to say something: new lyric text, or a message
   * renderer telling us there are none. `before` guards against reading the
   * previous track's lyrics, which linger in the DOM. */
  function waitForPanel(before) {
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      };

      const check = () => {
        const now = shelfText();
        if (now && now !== before) return done({ state: "ok", text: now, source: shelfSource() });
        if (document.querySelector(MESSAGE)) return done({ state: "none" });
        return false;
      };

      const observer = new MutationObserver(check);
      const host = document.querySelector("ytmusic-player-page") ?? document.body;
      observer.observe(host, { childList: true, subtree: true, characterData: true });

      const timer = setTimeout(() => done({ state: "none" }), TIMEOUT_MS);
      check();
    });
  }

  async function openTabAndRead(index, before) {
    const all = tabs();
    if (!all[index]) return null;
    all[index].click();
    const result = await waitForPanel(before);
    return result;
  }

  /**
   * @param {string} key  track identity, used only for caching
   * @returns {Promise<{state:'ok'|'none', text?:string, source?:string}>}
   */
  async function fetchFor(key) {
    if (cache.has(key)) return cache.get(key);
    if (inFlight?.key === key) return inFlight.promise;

    const promise = (async () => {
      if (!tabs().length) return { state: "none" };

      const restoreTo = selectedIndex();
      const before = shelfText();

      let result = await openTabAndRead(tabIndex, before);

      // Tab order changed under us -- find the one that produces a shelf and
      // remember it for next time.
      if (!result || result.state !== "ok") {
        for (let i = 0; i < tabs().length; i++) {
          if (i === tabIndex) continue;
          const attempt = await openTabAndRead(i, before);
          if (attempt?.state === "ok") { tabIndex = i; result = attempt; break; }
        }
      }

      // Put the side panel back on whatever tab the user had.
      if (restoreTo >= 0) {
        tabs()[restoreTo]?.click();
        await sleep(60);
      }

      return result ?? { state: "none" };
    })();

    inFlight = { key, promise };
    const result = await promise;
    inFlight = null;

    cache.set(key, result);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return result;
  }

  const forget = (key) => { if (key) cache.delete(key); else cache.clear(); };

  return { fetchFor, forget };
})();
