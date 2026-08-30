/* The only file that knows what YouTube Music's DOM looks like.
 *
 * Every selector below was read off a live, signed-in music.youtube.com rather
 * than guessed. When YTM ships a Polymer change this is the file that breaks,
 * and `diagnose()` reports exactly which lookup failed.
 *
 * Two rules that cost real debugging time:
 *   - Never read UI strings. `#play-pause-button` has title="재생" on a Korean
 *     account; playback state comes from the <video> element instead.
 *   - Never match tabs or buttons by their label for the same reason.
 *
 * Reads come from <video> plus the player bar; writes go through YTM's own
 * buttons so its internal state stays consistent. Seeking is the exception --
 * assigning to video.currentTime is exact, and YTM follows along.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.adapter = (() => {
  "use strict";

  const SEL = {
    bar: "ytmusic-player-bar",
    title: "ytmusic-player-bar .title.ytmusic-player-bar",
    byline: "ytmusic-player-bar .byline.ytmusic-player-bar",
    art: "ytmusic-player-bar img.image.ytmusic-player-bar",
    play: "ytmusic-player-bar #play-pause-button",
    prev: "ytmusic-player-bar .previous-button",
    next: "ytmusic-player-bar .next-button",
    progress: "ytmusic-player-bar #progress-bar",
    rightControls: "ytmusic-player-bar .right-controls-buttons",
    expand: "ytmusic-player-bar .expand-button",
    video: "video",
  };

  const $ = (sel) => document.querySelector(sel);
  const text = (el) => el?.textContent?.trim() ?? "";
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------- art -- */

  /* Cover URLs carry their size in the path: ".../abc=w60-h60-l90-rj".
   * Rewriting the request gives a genuinely larger image, not an upscale. */
  function coverAt(url, size) {
    if (!url) return null;
    if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
    if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${size}`);
    return url;
  }

  /* -------------------------------------------------------------- track -- */

  /* The byline reads "Artist A, Artist B • Album • 2023년", and every piece of
   * it is its own node: each artist is a separate <a>, the album is another,
   * and the separators are bare text in between. Reading only the first link
   * therefore dropped every collaborator after it -- and because the dropped
   * names were still sitting in the flat text, they landed in the album.
   *
   * So the byline is cut into segments on the bullets, with links kept whole.
   * Which segment is which comes from the hrefs, never from position or label:
   * artists point at channel/UC..., albums at browse/MPRE... A track with no
   * links at all (uploads, podcasts) falls back to YTM's own order, which puts
   * the artist first.
   */
  const ELEMENT_NODE = 1, TEXT_NODE = 3;
  const ARTIST_HREF = /(?:^|\/)(?:channel\/|browse\/UC|browse\/MPLA)/;
  const ALBUM_HREF = /(?:^|\/)browse\/(?:MPRE|MPSP|OLAK|VLPL)/;
  /* The release year is its own segment ("2023", "2023년", "2023年") and is
   * never a link, so it can only be recognised by its shape. */
  const YEAR_ONLY = /^\d{4}\s*(?:년|年)?$/;

  /* Text nodes and <a>s in document order, with anchors left whole so a link's
   * own inner markup cannot be mistaken for a separator. */
  function flattenByline(el, out = []) {
    for (const node of el.childNodes) {
      if (node.nodeType === TEXT_NODE) out.push(node);
      else if (node.nodeType !== ELEMENT_NODE) continue;
      else if (node.tagName.toLowerCase() === "a") out.push(node);
      else flattenByline(node, out);
    }
    return out;
  }

  /** @returns {{text:string, links:string[]}[]} bullet-separated pieces */
  function bylineSegments(el) {
    const segments = [];
    let buf = "";
    let links = [];

    const flush = () => {
      // Collapse the markup's own whitespace, and close the gap a line break
      // between two links would otherwise leave in front of "A, B".
      const t = buf.replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").trim();
      if (t) segments.push({ text: t, links });
      buf = "";
      links = [];
    };

    for (const node of flattenByline(el)) {
      if (node.nodeType === ELEMENT_NODE) {
        // The separators around a collaborator ("A, B", "A & B") are text
        // nodes, so appending the link's text keeps YTM's own punctuation.
        buf += node.textContent ?? "";
        links.push(node.getAttribute("href") ?? "");
        continue;
      }
      const pieces = (node.textContent ?? "").split("•");
      buf += pieces[0];
      for (let i = 1; i < pieces.length; i++) { flush(); buf = pieces[i]; }
    }
    flush();
    return segments;
  }

  function parseByline(el) {
    if (!el) return { artist: "", album: "" };

    const segments = bylineSegments(el);
    if (!segments.length) {
      const only = el.getAttribute?.("title")?.trim() || text(el);
      return { artist: only, artists: only ? [only] : [], album: "" };
    }

    const points = (seg, re) => seg.links.some((href) => re.test(href));
    let artists = segments.filter((s) => points(s, ARTIST_HREF));
    if (!artists.length) {
      // Nothing points at an artist page. YTM still puts the artist first, so
      // the leading segment is it -- unless the byline opens with the album,
      // in which case there is no artist here to take.
      const first = segments[0];
      if (first && !points(first, ALBUM_HREF)) artists = [first];
    }

    const join = (segs) => segs.map((s) => s.text).join(" · ");
    return {
      artist: join(artists),
      // Kept apart as well as joined. The display wants the whole credit; a
      // lyrics lookup wants one name it can match on, and "A · B" matches
      // nothing.
      artists: artists.map((s) => s.text),
      album: join(
        segments.filter((s) => !artists.includes(s) && !YEAR_ONLY.test(s.text)),
      ),
    };
  }

  function getTrack() {
    const titleEl = $(SEL.title);
    const title = titleEl?.getAttribute("title")?.trim() || text(titleEl);
    const { artist, artists, album } = parseByline($(SEL.byline));
    const raw = $(SEL.art)?.src || null;
    return {
      title,
      artist,
      artists,
      album,
      artUrl: coverAt(raw, 1200),
      artSmallUrl: coverAt(raw, 544),
      // JSON rather than a delimiter-joined string: every separator
      // character is one a track title is allowed to contain.
      key: JSON.stringify([title, artist, raw ?? ""]),
    };
  }

  /* ----------------------------------------------------------- playback -- */

  const video = () => $(SEL.video);

  const num = (el, attr) => {
    const n = Number(el?.getAttribute(attr));
    return Number.isFinite(n) ? n : NaN;
  };

  /* Two clocks run here and only one of them is per-track.
   *
   * YouTube Music stitches the next track into the same media element while the
   * current one is still finishing, so <video> reports a running total: roughly
   * ten seconds from the end its duration grows by the length of the track
   * queued behind it, and once that track starts currentTime carries straight
   * on from where the last one stopped instead of restarting. Reading either of
   * them gives a bar that never resets.
   *
   * #progress-bar is the clock YTM's own UI draws from, and it is always scoped
   * to the track on screen. So that is the source of the duration, and <video>
   * is the fallback for the moment before the bar has a value -- where its own
   * duration is still NaN anyway, which is the case the old fallback existed for.
   *
   * The position needs both of them, because neither one is good enough alone.
   * The bar reports whole seconds, and a second of slack is what puts a lyric
   * line on the wrong side of the beat. <video> is exact to the frame but is
   * still carrying everything stitched in ahead of this track.
   *
   * That stitched-in head is the difference between the two clocks, and it is
   * fixed for as long as one track is playing. Every reading of it lands in
   * [offset, offset + 1) because the bar floors, so the smallest reading in the
   * recent window is the one closest to the truth. The bar ticks once a second
   * against timeupdate's four, so a window of a few seconds always contains a
   * reading taken just after a tick -- which is the accurate one.
   */
  const OFFSET_WINDOW = 16;           // ~4s of timeupdate samples
  let offsetRing = [];

  function sampleClock() {
    const v = video();
    const barNow = num($(SEL.progress), "aria-valuenow");
    if (!v || !Number.isFinite(barNow)) return;
    offsetRing.push(v.currentTime - barNow);
    if (offsetRing.length > OFFSET_WINDOW) offsetRing.shift();
  }

  /* Every reading in the window is stale the moment the two clocks stop being
   * a fixed distance apart: a new track, or a seek the bar has not caught up
   * with yet. Both start the estimate over rather than dragging the old one. */
  const resetClock = () => { offsetRing = []; };
  const mediaOffset = () => (offsetRing.length ? Math.min(...offsetRing) : null);

  function getPlayback() {
    const v = video();
    const paused = v ? v.paused : true;

    const bar = $(SEL.progress);
    const duration = num(bar, "aria-valuemax");
    const barNow = num(bar, "aria-valuenow");
    if (duration > 0 && Number.isFinite(barNow)) {
      // Until the offset has settled the bar's own whole second is the honest
      // answer -- a guessed fraction would be worse than no fraction.
      const offset = mediaOffset();
      const position = offset !== null && v ? v.currentTime - offset : barNow;
      return { position: clamp(position, 0, duration), duration, paused };
    }

    const fallback = Number.isFinite(v?.duration) && v.duration > 0 ? v.duration : 0;
    return { position: v?.currentTime ?? 0, duration: fallback, paused };
  }

  const click = (sel) => { $(sel)?.click(); };

  const playPause = () => click(SEL.play);
  const prev = () => click(SEL.prev);
  const next = () => click(SEL.next);

  /* The target arrives in bar-time; the media element is the only thing that
   * can be assigned to. Same offset as getPlayback(), same estimate -- before
   * it settles, zero, which is the right answer for every track that has
   * nothing stitched in ahead of it. */
  function seek(seconds) {
    const v = video();
    if (!v || !Number.isFinite(seconds)) return;

    const { duration } = getPlayback();
    const target = duration > 0 ? clamp(seconds, 0, duration) : Math.max(0, seconds);

    v.currentTime = Math.max(0, target + (mediaOffset() ?? 0));
  }

  /* ------------------------------------------------------------ watching -- */

  /**
   * Subscribes to everything the display needs.
   * @param {{onTrack:(t:object)=>void, onPlayback:(p:object)=>void}} cb
   * @returns {() => void} dispose
   */
  function watch({ onTrack, onPlayback }) {
    let lastKey = null;
    let boundVideo = null;
    const disposers = [];

    /* The title flips before the media element catches up, so for a moment
     * after an advance #progress-bar can still carry the outgoing track's
     * position. Inside the settling window a position that is clearly not a
     * fresh start is reported as zero; the first genuine near-zero reading ends
     * the window early. */
    let settleUntil = 0;

    const emitPlayback = () => {
      // Inside the settling window the bar still holds the outgoing track, so
      // the two clocks are not a fixed distance apart and a sample taken here
      // would poison the estimate for the rest of the song.
      if (performance.now() >= settleUntil) sampleClock();
      const pb = getPlayback();
      /* `settling` is reported rather than merely corrected, because the
       * position is not the only stale reading: aria-valuemax is the outgoing
       * track's length too, and unlike the position there is no sane value to
       * substitute for it. Anything that keys off the running time -- a lyrics
       * lookup matches on it -- has to be able to wait instead. */
      pb.settling = false;
      if (performance.now() < settleUntil) {
        if (pb.position > 3) { pb.position = 0; pb.settling = true; }
        else settleUntil = 0;
      }
      onPlayback?.(pb);
    };

    const emitTrack = (force = false) => {
      const track = getTrack();
      const changed = track.key !== lastKey;
      if (!force && !changed) return;
      const advanced = changed && lastKey !== null;
      lastKey = track.key;
      onTrack?.(track);
      if (advanced) { settleUntil = performance.now() + 2000; resetClock(); }
      emitPlayback();
    };

    // The <video> element survives track changes in practice, but rebinding is
    // cheap and covers the case where YTM swaps it.
    const bindVideo = () => {
      const v = video();
      if (!v || v === boundVideo) return;
      const events = ["play", "pause", "timeupdate", "durationchange",
                      "loadedmetadata", "emptied", "ended"];
      for (const type of events) v.addEventListener(type, emitPlayback);
      // Seeking backwards moves the media clock while the bar is still at the
      // old second, which reads as an offset a second too small -- and the
      // estimate keeps the smallest reading it sees. So it starts over.
      const onSeeked = () => { resetClock(); emitPlayback(); };
      v.addEventListener("seeked", onSeeked);
      disposers.push(() => {
        events.forEach((t) => v.removeEventListener(t, emitPlayback));
        v.removeEventListener("seeked", onSeeked);
      });
      boundVideo = v;
      emitPlayback();
    };

    // Watching the title node and the cover's src is precise. Watching the whole
    // player bar would fire several times a second, because the elapsed-time
    // text lives in there too.
    const titleEl = $(SEL.title);
    const artEl = $(SEL.art);
    const onMutate = () => { bindVideo(); emitTrack(); };

    if (titleEl) {
      const mo = new MutationObserver(onMutate);
      mo.observe(titleEl, { childList: true, characterData: true, subtree: true,
                            attributes: true, attributeFilter: ["title"] });
      disposers.push(() => mo.disconnect());
    }
    if (artEl) {
      const mo = new MutationObserver(onMutate);
      mo.observe(artEl, { attributes: true, attributeFilter: ["src"] });
      disposers.push(() => mo.disconnect());
    }

    // Backstop: if the player bar was not in the DOM yet at setup time, or a
    // mutation is missed, this still notices within a second.
    const poll = setInterval(() => { bindVideo(); emitTrack(); }, 1000);
    disposers.push(() => clearInterval(poll));

    bindVideo();
    emitTrack(true);

    return () => disposers.forEach((fn) => fn());
  }

  /* --------------------------------------------------------- diagnostics -- */

  /* Two of the selectors are conveniences, not requirements, and a miss on
   * either changes nothing the user can see:
   *   expand   -- only says where in the control row our button is inserted;
   *               without it the button goes last, which is fine.
   *   progress -- only a duration fallback for the moment before <video>
   *               reports one.
   * They stay in SEL because the code still looks them up, but reporting them
   * would put a warning on screen for a display that is working perfectly. */
  const OPTIONAL = new Set(["expand", "progress"]);

  /** Names the required selectors that currently find nothing -- shown in the
   *  overlay when YTM changes shape, so the break is visible instead of silent. */
  function diagnose() {
    return Object.entries(SEL)
      .filter(([name]) => !OPTIONAL.has(name))
      .filter(([, sel]) => !$(sel))
      .map(([name]) => name);
  }

  const ready = () => !!$(SEL.bar) && !!$(SEL.title);

  return {
    SEL, ready, getTrack, getPlayback, coverAt,
    playPause, prev, next, seek, watch, diagnose,
  };
})();
