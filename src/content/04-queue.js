/* The play queue.
 *
 * One trap, confirmed on a live page: rows are not uniformly
 * `ytmusic-player-queue-item`. A track that has both an audio version and a
 * music video is wrapped in `ytmusic-playlist-panel-video-wrapper-renderer`
 * holding two items -- and on the currently playing row BOTH carry the
 * `selected` attribute, so `selected` alone cannot tell them apart. Iterating
 * the items directly yields every such track twice.
 *
 * The fix is to walk the container's direct children and, inside a wrapper,
 * take the variant that is actually visible -- that is the one matching the
 * current audio/video toggle.
 *
 * The list is also read from two containers rather than one. What autoplay has
 * lined up after the queue lives outside #contents, and it is merged in -- but
 * only for a song playing on its own, where it is genuinely what comes next.
 * See songBased() for why an album or a playlist is left alone.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.queue = (() => {
  "use strict";

  const QUEUE = "ytmusic-player-queue";
  const CONTENTS = "ytmusic-player-queue #contents";
  const AUTOMIX = "#automix-contents";
  const ITEM = "ytmusic-player-queue-item";
  const WRAPPER = "ytmusic-playlist-panel-video-wrapper-renderer";

  let rows = [];   // element refs, parallel to the last read()

  const visible = (el) => !!el && el.offsetParent !== null;

  /* Deepest light-DOM descendant -- querySelector cannot cross a shadow
   * boundary, so this is as far in as an event can be aimed from out here. */
  function deepest(el) {
    let node = el;
    while (node.firstElementChild) node = node.firstElementChild;
    return node;
  }

  function pick(row) {
    const tag = row.tagName.toLowerCase();
    if (tag === ITEM) return row;
    if (tag === WRAPPER) {
      const variants = [...row.querySelectorAll(ITEM)];
      return variants.find(visible) ?? variants[0] ?? null;
    }
    return row.querySelector(ITEM);
  }

  /* ------------------------------------------------------------- autoplay -- */

  /* What YTM lines up after the queue runs out is not in #contents. It sits in
   * its own container beside it, which is why it never showed up in this list.
   *
   * `#automix-contents` is that container. The scan behind it is the backstop:
   * anything else inside `ytmusic-player-queue` that holds queue items and is
   * neither #contents nor one of its ancestors can only be the autoplay tail,
   * so a renamed id costs nothing. */
  function automixContents() {
    const root = document.querySelector(QUEUE);
    if (!root) return null;

    const named = root.querySelector(AUTOMIX);
    if (named) return named;

    const contents = root.querySelector("#contents");
    for (const el of root.querySelectorAll("[id]")) {
      if (el === contents || el.contains(contents) || contents?.contains(el)) continue;
      if (el.querySelector(ITEM)) return el;
    }
    return null;
  }

  /* Only a song's own autoplay tail belongs in the list.
   *
   * On an album or a playlist the tracklist *is* the queue -- whatever YTM
   * would put after it was not chosen by anybody, and appending it would make a
   * twelve-track album read as a forty-track one. On a single song there is no
   * tracklist to speak of, and the tail is the whole of what comes next.
   *
   * Which of the two this is comes off the watch URL's `list`:
   *   (absent)         a song playing on its own
   *   RDAMVM<videoId>  the radio YTM starts from a single song
   *   OLAK5uy_… PL… VL… RDCLAK5uy_… RDTMAK5uy_… RDAMPL…
   *                    an album, a playlist, or one of the built mixes
   *
   * Only the first two are "this song, then whatever follows it". Anything
   * unrecognised is taken for a tracklist, so an id shape not listed here costs
   * the tail rather than showing one where it does not belong.
   *
   * The path is checked as well as the query, because `list` only describes
   * what is *playing* on /watch. Anywhere else it names the page being browsed
   * -- standing on an album while a completely different song plays would
   * otherwise read as album playback and drop a tail that belongs there. */
  const SONG_RADIO = /^RDAMVM/;

  function songBased() {
    if (!location.pathname.startsWith("/watch")) return true;
    const list = new URLSearchParams(location.search).get("list");
    return !list || SONG_RADIO.test(list);
  }

  /* ----------------------------------------------------------------- read -- */

  function collect(container, autoplay, items) {
    if (!container) return;
    for (const child of container.children) {
      const item = pick(child);
      if (!item) continue;
      const title = item.querySelector(".song-title")?.textContent?.trim() ?? "";
      if (!title) continue;
      rows.push(item);
      items.push({
        title,
        artist: item.querySelector(".byline")?.textContent?.trim() ?? "",
        duration: item.querySelector(".duration")?.textContent?.trim() ?? "",
        current: item.hasAttribute("selected"),
        autoplay,
      });
    }
  }

  /** @returns {{title:string, artist:string, duration:string,
   *             current:boolean, autoplay:boolean}[]} */
  function read() {
    const items = [];
    rows = [];
    collect(document.querySelector(CONTENTS), false, items);
    if (songBased()) collect(automixContents(), true, items);
    return items;
  }

  /* Jumps to a row by its index in the last read().
   *
   * A queue row contains no link -- there is no anchor anywhere in the item, so
   * nothing about the title is clickable. Playback hangs off the play button in
   * the thumbnail overlay. Traced on a live queue, a real click reads:
   *
   *   div < span.yt-icon-shape < yt-icon.icon < div.content-wrapper
   *     < ytmusic-play-button-renderer#play-button
   *     < div#content < ytmusic-item-thumbnail-overlay-renderer.thumbnail-overlay
   *     < div.left-items < ytmusic-player-queue-item
   *
   * The handler is somewhere on that chain rather than on the host, so the
   * event goes to the deepest node reachable from here and bubbles up through
   * all of it. yt-icon's own shadow root is where the trace stops being
   * reachable, which is fine -- nothing below the icon listens. */
  function play(index) {
    const item = rows[index];
    if (!item) return;

    const button = item.querySelector("#play-button");
    const target = button ? deepest(button) : item;

    // Polymer's tap recogniser is built out of the mouse pair, not the pointer
    // pair, and some renderers take a plain click instead. Sending the whole
    // sequence covers every shape of it; re-triggering a play is harmless.
    const opts = { bubbles: true, composed: true, cancelable: true };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...opts, isPrimary: true }));
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    target.dispatchEvent(new MouseEvent("mouseup", opts));
    target.dispatchEvent(new PointerEvent("pointerup", { ...opts, isPrimary: true }));
    target.click();
  }

  /** Fires when the queue's contents change (track advance, reorder, add). */
  function watch(onChange) {
    let attached = null;
    let observer = null;

    /* The whole queue element, not #contents: the autoplay tail is a sibling of
     * that container, and an observer scoped to #contents never hears it fill. */
    const attach = () => {
      const root = document.querySelector(QUEUE);
      if (!root || root === attached) return;
      observer?.disconnect();
      observer = new MutationObserver(onChange);
      observer.observe(root, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["selected"],
      });
      attached = root;
      onChange();
    };

    attach();
    // The queue element is created lazily, so keep looking until it shows up.
    const poll = setInterval(attach, 1500);

    return () => { clearInterval(poll); observer?.disconnect(); };
  }

  return { read, play, watch };
})();
