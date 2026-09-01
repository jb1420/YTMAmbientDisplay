/* Lyrics, from two places.
 *
 * LRCLIB (lrclib.net) is a free, crowdsourced database of LRC files -- lyrics
 * with a timestamp on every line, which is the only way a panel can follow a
 * song instead of just sitting next to it. It needs no key and answers with
 * `Access-Control-Allow-Origin: *`, so a content script can ask it directly:
 * no host permission, no background worker, no second manifest shape. That
 * matters more than it sounds -- see the README.
 *
 * YouTube Music's own side panel is the other source, and the fallback, exactly
 * as before. Its lyrics carry no timings, so they are shown as one block.
 *
 * The order is LRCLIB-synced, then the panel, then LRCLIB's plain text. The
 * panel outranks plain text on purpose: a track LRCLIB cannot sync then looks
 * exactly the way it did before any of this existed.
 *
 * Nothing here runs unless the display asks for it, and the network half does
 * not run at all while `syncedLyrics` is off.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.lyrics = (() => {
  "use strict";

  const NONE = { state: "none" };

  const cache = new Map();   // track key -> result
  let inFlight = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* -------------------------------------------------------------- LRCLIB -- */

  const API = "https://lrclib.net/api";
  const NET_TIMEOUT_MS = 6000;
  const DURATION_SLACK = 5;  // seconds; past this it is a different recording

  /* LRCLIB is run by volunteers and given away, so it asks callers to say who
   * they are. This header and not User-Agent: that one is missing from the
   * service's CORS allow-list, and sending it fails the preflight rather than
   * the request -- which looks from here like the service being down. */
  const CLIENT = "YTM Ambient Display v0.2.1";

  async function getJson(path, params) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), NET_TIMEOUT_MS);
    try {
      const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
        signal: ctl.signal,
        headers: { "Lrclib-Client": CLIENT },
        // Nothing about the listener goes out with this: no cookies, and no
        // referrer naming the page they are on.
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!res.ok) return null;        // 404 is the ordinary "no match"
      return await res.json();
    } catch {
      return null;                     // offline, timed out, blocked -- same
    } finally {
      clearTimeout(timer);
    }
  }

  /* A line's timing is the run of stamps at the head of its row -- `[01:23.45]`,
   * sometimes several where a chorus repeats. A bracket anywhere else belongs
   * to the words. Rows carrying no stamp at all are the metadata tags
   * (`[ar:]`, `[by:]`) and fall out of this on their own.
   *
   * `[offset:]` is deliberately ignored. LRCLIB never emits one, players
   * disagree about which way its sign points, and getting that backwards would
   * be worse than leaving the correction to the [ and ] keys.
   */
  const STAMP = /\[(\d+):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

  function parseLrc(raw) {
    if (!raw) return null;
    const lines = [];

    for (const row of raw.split(/\r?\n/)) {
      STAMP.lastIndex = 0;
      const stamps = [];
      let end = 0, m;
      while ((m = STAMP.exec(row))) {
        if (m.index !== end) break;    // past the head; the rest is lyric
        end = STAMP.lastIndex;
        stamps.push(Number(m[1]) * 60 + Number(m[2].replace(":", ".")));
      }
      if (!stamps.length) continue;

      // Rows with a stamp but no words are kept. They are the instrumental
      // stretches, and dropping them would make the highlight jump from the
      // last line before a break straight to the first line after it.
      const text = row.slice(end).trim();
      for (const t of stamps) if (Number.isFinite(t)) lines.push({ t, text });
    }

    // Repeated stamps arrive out of order by definition.
    lines.sort((a, b) => a.t - b.t);
    return lines.some((l) => l.text) ? lines : null;
  }

  /* YTM writes credits into the title that a lyrics database usually keeps out
   * of the track name. Tried longest first, so the exact title still gets the
   * first and best chance. */
  const CREDIT = /\s*[(\[]\s*(?:featuring|feat|ft)\b[^)\]]*[)\]]/gi;
  const TRAILING_BRACKET = /\s*[(\[][^)\]]*[)\]]\s*$/;

  function titleVariants(title) {
    const out = [title];
    const noCredit = title.replace(CREDIT, "").trim();
    if (noCredit && !out.includes(noCredit)) out.push(noCredit);
    const bare = noCredit.replace(TRAILING_BRACKET, "").trim();
    if (bare && !out.includes(bare)) out.push(bare);
    return out;
  }

  /* One name, never the joined credit -- "A · B" matches nothing. `artists`
   * comes off the byline already split by link; the comma pass covers the
   * collaborators YTM puts inside a single segment. */
  function artistName(track) {
    const primary = track.artists?.[0] || track.artist || "";
    return primary.split(/\s*[,&]\s*/)[0].trim() || primary;
  }

  /* The search endpoint answers with everything that loosely matches, so the
   * choosing happens here: a synced entry beats a plain one, and among those
   * the closest running time wins. Anything further out than DURATION_SLACK is
   * a different recording -- better to take nothing from here and let the panel
   * answer than to run the wrong words against the clock. */
  function pickBest(rows, duration) {
    if (!Array.isArray(rows)) return null;
    const near = rows.filter((r) => r && Number.isFinite(r.duration) &&
                                    Math.abs(r.duration - duration) <= DURATION_SLACK);
    if (!near.length) return null;
    near.sort((a, b) =>
      (!!b.syncedLyrics - !!a.syncedLyrics) ||
      (Math.abs(a.duration - duration) - Math.abs(b.duration - duration)));
    return near[0];
  }

  function shape(row) {
    if (!row) return null;
    const lines = parseLrc(row.syncedLyrics);
    if (lines) return { state: "ok", lines, source: "LRCLIB" };
    if (row.plainLyrics?.trim()) {
      return { state: "ok", text: row.plainLyrics.trim(), source: "LRCLIB" };
    }
    if (row.instrumental) return { state: "instrumental" };
    return null;
  }

  /* Two requests at most, and only for a track that is not already cached: the
   * exact lookup, which nearly every track answers to, and one search for the
   * ones whose album or credits are written differently here than there. */
  async function fromLrclib(track, duration) {
    const artist_name = artistName(track);
    if (!track.title || !artist_name || !(duration > 0)) return null;

    const variants = titleVariants(track.title);

    const exact = await getJson("get", {
      artist_name,
      track_name: variants[0],
      album_name: track.album || "",
      duration: String(Math.round(duration)),
    });
    const hit = shape(exact);
    if (hit) return hit;

    const rows = await getJson("search", {
      artist_name,
      track_name: variants[variants.length - 1],
    });
    return shape(pickBest(rows, duration));
  }

  /* ------------------------------------------------- YouTube Music's panel -- */

  /* The lyrics tab renders lazily: until it has been opened once for a track,
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

  const TABS = "ytmusic-player-page tp-yt-paper-tab";
  const SHELF = "ytmusic-description-shelf-renderer";
  const TEXT = `${SHELF} yt-formatted-string.description`;
  const FOOTER = `${SHELF} yt-formatted-string.footer`;
  const MESSAGE = "ytmusic-player-page ytmusic-message-renderer";

  const TIMEOUT_MS = 5000;

  /* Observed position. Not corrected at runtime any more: a remembered index
   * is only worth having if it is certainly right, and nothing here can tell
   * a lyric shelf from the biography the related tab renders into the same
   * element. See the search in fromPanel(). */
  const tabIndex = 1;

  const tabs = () => [...document.querySelectorAll(TABS)];
  const selectedIndex = () => tabs().findIndex((t) => t.classList.contains("iron-selected"));
  const shelfText = () => document.querySelector(TEXT)?.textContent?.trim() ?? "";
  const shelfSource = () => document.querySelector(FOOTER)?.textContent?.trim() ?? "";

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
        // YTM saying "no lyrics" is an answer, not a failure to get one. The
        // caller needs to tell the two apart before it goes looking elsewhere.
        if (document.querySelector(MESSAGE)) return done({ state: "none", definite: true });
        return false;
      };

      const observer = new MutationObserver(check);
      const host = document.querySelector("ytmusic-player-page") ?? document.body;
      observer.observe(host, { childList: true, subtree: true, characterData: true });

      const timer = setTimeout(() => done(NONE), TIMEOUT_MS);
      check();
    });
  }

  async function openTabAndRead(index, before) {
    const all = tabs();
    if (!all[index]) return null;
    all[index].click();
    return waitForPanel(before);
  }

  async function fromPanel() {
    if (!tabs().length) return NONE;

    const restoreTo = selectedIndex();
    const before = shelfText();

    let result = await openTabAndRead(tabIndex, before);

    /* Tab order can change under us, so a miss is worth a look at the others.
     * Two things bound that search, both learned the hard way.
     *
     * It never runs against a definite answer. Every tab in that row can render
     * a description shelf -- the related tab holds the artist's biography --
     * so taking the first shelf that appears is exactly how a biography ends
     * up on screen presented as lyrics.
     *
     * And what it finds is used for this track without being remembered. The
     * index was previously latched on the first hit, which turned one wrong
     * guess into every track for the rest of the session. A genuine reorder
     * now costs a search per track rather than a session of wrong text, and
     * that is the right way round. */
    if (!result || (result.state !== "ok" && !result.definite)) {
      for (let i = 0; i < tabs().length; i++) {
        if (i === tabIndex) continue;
        const attempt = await openTabAndRead(i, before);
        if (attempt?.state === "ok") { result = attempt; break; }
      }
    }

    // Put the side panel back on whatever tab the user had.
    if (restoreTo >= 0) {
      tabs()[restoreTo]?.click();
      await sleep(60);
    }

    return result ?? NONE;
  }

  /* ----------------------------------------------------------------- both -- */

  async function resolve(track, duration, allowNetwork) {
    const remote = allowNetwork ? await fromLrclib(track, duration) : null;
    if (remote?.lines) return remote;

    const panel = await fromPanel();
    if (panel.state === "ok") return panel;
    // Plain text, or an entry marked instrumental. Either beats saying nothing.
    return remote ?? panel;
  }

  /**
   * @param {{key:string, title:string, artist:string, artists?:string[], album:string}} track
   * @param {{duration:number, allowNetwork:boolean}} opts  duration in seconds
   * @returns {Promise<{state:'ok'|'none'|'instrumental',
   *                    lines?:{t:number,text:string}[],
   *                    text?:string, source?:string}>}
   */
  async function fetchFor(track, { duration = 0, allowNetwork = true } = {}) {
    const key = track?.key;
    if (!key) return NONE;
    if (cache.has(key)) return cache.get(key);
    if (inFlight?.key === key) return inFlight.promise;

    const promise = resolve(track, duration, allowNetwork);
    inFlight = { key, promise };

    let result;
    try {
      result = await promise;
    } catch (err) {
      console.warn("[YTM Ambient Display] lyrics lookup failed:", err);
      result = NONE;
    } finally {
      if (inFlight?.key === key) inFlight = null;
    }

    cache.set(key, result);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return result;
  }

  const forget = (key) => { if (key) cache.delete(key); else cache.clear(); };

  return { fetchFor, forget };
})();
