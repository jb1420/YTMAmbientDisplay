# YTM Ambient Display

A fullscreen now-playing screen for YouTube Music, tinted by the album cover.
Chrome and Firefox, one codebase, no build step.

- A side panel showing either lyrics or the queue — one at a time, or neither
  (chevron opens and closes it; the section heading switches between the two)
- Play/pause, previous, next and a scrubbable progress bar, always visible
- Large title and artist
- Background gradient sampled from the cover art
- Master on/off in the toolbar popup

YouTube Music keeps playing the audio. The overlay only reads its state and
draws its own screen on top.

## Install

Nothing to build — load the folder as-is.

**Chrome** — `chrome://extensions` → enable Developer mode → *Load unpacked* →
pick this folder.

**Firefox** — `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on*
→ pick `manifest.json`.

Then open <https://music.youtube.com>, play something, and press the fullscreen
button in the player bar (left of the expand button).

### Fonts

One font file is not in the repo. Drop it into `src/fonts/` and reload the
extension — see [src/fonts/README.md](src/fonts/README.md) for the exact file
and where to get it. Without it the display falls back to a system stack:
readable, but the title loses most of its character.

## Design harness

Most of the visual work happens here, not against the live site. It runs the
real overlay code against mock data, so you can flip between states instantly.

```bash
python -m http.server 8477
```

Open <http://localhost:8477/dev/preview.html>. The panel switches track,
play state, side panel and motion. `H` hides the panel, `F` goes fullscreen.

`dev/art/*.png` are generated test covers, each a different kind of hard for the
palette extractor: vivid multi-hue, near-monochrome, single dominant hue, and a
bright cover. Regenerate them (and the extension icons) with:

```bash
node dev/make-assets.js
```

## How it fits together

```
src/lib/api.js           browser shim + settings store
src/content/
  01-adapter.js          the only file that knows YouTube Music's DOM
  02-palette.js          cover -> gradient + ink tokens
  03-lyrics.js           side-panel scrape, cached per track
  04-queue.js            queue read, with the A/V duplicate fix
  05-overlay.js          the display -- pure UI, no YTM and no chrome.*
  06-main.js             bootstrap and wiring
src/ui/
  fonts.css              @font-face only, loaded document-scoped
  overlay.css            everything else, adopted into the shadow root
src/popup/               settings
```

The overlay lives in a shadow root with a **constructed** stylesheet, so
YouTube Music's Polymer styles cannot leak in and the page CSP does not apply.
`@font-face` is the exception — it is ignored inside shadow roots, so
`fonts.css` is loaded through the manifest instead, document-scoped. That is the
cheap path, not the only one: whether an injected `@font-face` actually reaches
the page varies with the browser and the page's own `font-src` policy, and when
it does not the display quietly renders in the fallback stack. So `mount()`
checks, and loads the file itself through the `FontFace` API if the declarative
route did not take — a face built from an `ArrayBuffer` has no URL left for a
policy to object to.

There is **no background script**. Colour extraction works because
googleusercontent serves cover art with a permissive CORS header, so
`crossOrigin = "anonymous"` keeps the canvas untainted. That is what lets one
manifest serve both Chrome MV3 and Firefox MV3 — the two disagree about
`background.service_worker` vs `background.scripts`, and this sidesteps it.

## Two decisions worth knowing

**The side panel holds one thing at a time.** Lyrics and the queue are a single
`panel` setting — `"none" | "lyrics" | "queue"` — rather than two booleans. With
two flags, every writer has to remember to clear the other one, and the popup
would be lying about what a switch does. The exclusivity is structural, so it
cannot drift.

**The section heading is the switcher.** Rather than a pair of filled chips in
the top bar, the two choices sit where the panel's label would go and separate
by weight and ink alone — nothing solid competes with the cover for attention.
A hidden `::after` carrying the same text at the selected weight reserves the
width, so switching never nudges the layout (measured: 0px). The chevron in the
top bar opens and closes the column and returns to whichever was last open.

**One typeface carries every role.** Title, labels, lyrics and timecodes are all
Pretendard. The numeric columns that would normally call for a monospace stay
aligned through `font-variant-numeric: tabular-nums` instead. Labels stay
distinct through case and letter-spacing, not through a second family.

## Things that were not obvious

Each of these was confirmed against a live, signed-in page.

**The queue lists every A/V track twice.** Rows are either
`ytmusic-player-queue-item` or a `ytmusic-playlist-panel-video-wrapper-renderer`
holding both the audio and the music-video version — and on the playing row
*both* carry `selected`, so that attribute cannot disambiguate them. Walk the
container's direct children and take the visible variant. Measured on a real
queue: 10 raw items collapse to 6 rows, with exactly one marked current.

**A queue row has nothing to click.** There is no anchor anywhere inside
`ytmusic-player-queue-item` -- the title is plain text, so clicking it reaches
no handler and silently does nothing. Playback hangs off the play button in the
thumbnail overlay. The real click path, traced on a live queue, is
`yt-icon.icon < div.content-wrapper < ytmusic-play-button-renderer#play-button
< div#content < ytmusic-item-thumbnail-overlay-renderer.thumbnail-overlay`, and
the event is aimed at the deepest node reachable from outside so it bubbles
through the whole chain.

**The media element's clock is not per-track.** YouTube Music stitches the next
track into the same `<video>` before the current one ends, so about ten seconds
from the end `duration` grows by the next track's length, and after the change
`currentTime` continues from where the last track stopped rather than
restarting. `#progress-bar`'s `aria-valuenow`/`aria-valuemax` are scoped to the
track on screen, so those are the clock and `<video>` is only the fallback.
Seeks are translated through the difference between the two.

**Lyrics render lazily but then stick around.** Until the lyrics tab has been
opened once, `ytmusic-description-shelf-renderer` does not exist, so reading
lyrics means opening the tab and putting the side panel back. After it has
rendered it stays in the DOM when you switch tabs away — so that round trip
happens once per track rather than on every read.

**Never read UI strings.** On a Korean account the play button is
`title="재생"` and the side-panel tabs read
`["다음 트랙", "가사", "댓글", "관련 항목"]`. Playback state comes from the
`<video>` element; the lyrics tab is chosen by index, and the working index is
remembered if the order changes.

**`video.duration` is NaN until the media loads.** `#progress-bar`'s
`aria-valuemax` knows the length first, so it is the fallback.

**Cover art carries its size in the URL.** `...=w60-h60-l90-rj` rewritten to
`=w1200-h1200` returns a genuinely larger image rather than an upscale.

## Accessibility

The palette is not free to produce anything it likes. Every cover is checked
against the composed background and the room is darkened until the 62% text tier
clears 4.5:1 — measured across the four test covers it lands at 4.6–5.1, with
the faint 46% tier at 3.3–3.5 and the title at 8.9–10.8.

Motion respects `prefers-reduced-motion`, all controls are keyboard reachable
with visible focus, and the progress bar takes arrow keys.

## Known fragility

This reads another site's DOM, so YouTube Music can break it. Every selector is
in `01-adapter.js`, and `diagnose()` reports which lookups failed — the overlay
prints them into a slot in the top bar that is otherwise empty, so a break is
visible rather than silent.

Two selectors are left out of that report on purpose. `expand` only decides
where in the control row the button is inserted, and `progress` is only a
duration fallback for the moment before `<video>` has one; missing either
changes nothing anyone can see, and warning about them would put a notice on
screen for a display that is working. The report is also cleared as well as set,
because the player bar is assembled piece by piece and the first reading often
lands early.
