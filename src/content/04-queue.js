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
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.queue = (() => {
  "use strict";

  const CONTENTS = "ytmusic-player-queue #contents";
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

  /** @returns {{title:string, artist:string, duration:string, current:boolean}[]} */
  function read() {
    const contents = document.querySelector(CONTENTS);
    if (!contents) { rows = []; return []; }

    const items = [];
    rows = [];

    for (const child of contents.children) {
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
      });
    }
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

    const attach = () => {
      const contents = document.querySelector(CONTENTS);
      if (!contents || contents === attached) return;
      observer?.disconnect();
      observer = new MutationObserver(onChange);
      observer.observe(contents, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["selected"],
      });
      attached = contents;
      onChange();
    };

    attach();
    // The queue element is created lazily, so keep looking until it shows up.
    const poll = setInterval(attach, 1500);

    return () => { clearInterval(poll); observer?.disconnect(); };
  }

  return { read, play, watch };
})();
