# YTM Ambient Display

A fullscreen now-playing screen for YouTube Music, tinted by the album cover.
Chrome and Firefox, one codebase, no build step.

- A side panel showing either lyrics or the queue — one at a time, or neither
  (chevron opens and closes it; the section heading switches between the two)
- The queue carries autoplay's tail on the end of it, under one rule, numbered
  in the same run — but only for a song playing on its own, never on an album
  or a playlist, where the tracklist is the point
- Lyrics that follow the song: the current line is lit and the column scrolls
  itself, wherever timed lyrics can be found for the track
- Play/pause, previous, next and a scrubbable progress bar, always visible
- Large title and artist
- The cover as a physical sleeve: it turns in 3D under the pointer and catches
  a highlight where you push it. Still whenever nobody is touching it
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

### Shortcuts

On any YouTube Music page, as long as you are not typing in a field:

| Key | |
| --- | --- |
| `G` | open the display, or close it if it is already open |
| `C` | lyrics panel — again to hide it |
| `Q` | queue panel — again to hide it |
| `[` `]` | nudge the lyrics 0.1s earlier or later |

`C` and `Q` only apply while the display is open, `[` and `]` only while the
lyrics panel is showing. They match on physical key, so they still work with a
Korean IME switched on.

### Lyrics

Two sources, tried in this order:

1. **[LRCLIB](https://lrclib.net)** — a free, crowdsourced database of LRC
   files, meaning a timestamp on every line. This is the only one of the two
   that can produce lyrics that follow the song.
2. **YouTube Music's own side panel** — the same scrape this has always done.
   No timings, so it is shown as one block, exactly as before.

If LRCLIB has the track but only as plain text, the side panel still wins: a
track LRCLIB cannot sync looks precisely the way it did before any of this
existed.

**What leaves the machine.** With the lookup on, the track's title, artist,
album and length go to `lrclib.net` — once per track, at most two requests,
cached for the session. No cookies and no referrer go with them, so nothing
identifies the listener or says which page they are on. Nothing else in the
extension talks to a network at all.

Turn it off in the toolbar popup and the request is never made; lyrics then come
from YouTube Music alone. There is a switch for click-a-line-to-seek in the same
place. [PRIVACY.md](PRIVACY.md) says the same thing in full, and is what the
store listings point at.

**When the timing is off.** LRCLIB's timestamps are contributed, and some run a
few hundred milliseconds early or late. `[` and `]` shift the lyrics against the
clock in 0.1s steps while the display is open, up to ±5s, and the correction is
saved — a database that runs early on one track tends to run early on the next.

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
  03-lyrics.js           LRCLIB lookup + side-panel scrape, cached per track
  04-queue.js            queue read: A/V duplicate fix, autoplay tail merge
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

There is **no background script**, and the only permission is `storage`. Colour
extraction works because googleusercontent serves cover art with a permissive
CORS header, so the content script can pull the bytes down itself; the lyrics
lookup works for the same reason, and needs no `host_permissions` either.
LRCLIB answers with `Access-Control-Allow-Origin: *`, and YouTube Music's own
CSP names `script-src`, `base-uri` and `object-src` but no `connect-src`, so
there is nothing in the way. That is what lets one manifest serve both Chrome
MV3 and Firefox MV3 — the two disagree about `background.service_worker` vs
`background.scripts`, and this sidesteps it.

Getting those bytes takes two different routes, though. The canvas has to stay
untainted or `getImageData` throws, which normally means an
`<img crossorigin="anonymous">` — and that is exactly what Firefox refuses from
a content script: the load is attributed to the extension's principal and comes
back `EncodingError: Invalid image request` before any header is read. So the
cover is fetched instead and decoded through `createImageBitmap`, which carries
no origin and so taints nothing; the `<img>` stays behind it as a fallback. The
sleeve on screen never had this problem and never needed the attribute — it only
paints the picture — so it just loads the URL plainly.

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
track on screen, so the bar is where the duration comes from.

**Neither clock alone is good enough for a lyric line.** The bar reports whole
seconds, and a second of slack is what puts a line on the wrong side of the
beat; `<video>` is exact to the frame but is still carrying everything stitched
in ahead of the current track. That stitched-in head is just the difference
between the two, and it holds steady for as long as one track plays — so the
position is `currentTime` minus that offset, and seeks are translated back
through it.

Estimating the offset is the whole trick. Because the bar floors, every reading
of `currentTime - aria-valuenow` lands somewhere in `[offset, offset + 1)`, so
**the smallest reading in a rolling window is the closest to the truth**. The
bar ticks once a second against `timeupdate`'s four, so a four-second window
always contains a reading taken just after a tick — accurate to about 250ms,
settling within a second of a track starting. It resets on a track change and
on a seek, which are the two moments the two clocks stop being a fixed distance
apart. Until it has settled, the bar's own whole second is reported, because a
guessed fraction is worse than no fraction.

**The bar's length lags the title too, not just its position.** The settling
window was written to stop a stale *position* reaching the screen, but
`aria-valuemax` is equally stale for those two seconds, and unlike the position
there is no sensible value to put in its place. A lyrics lookup matches on the
running time, so keyed on the outgoing track's length it matched nothing — and
"no match" is indistinguishable from a track nobody ever transcribed. The
symptom was that the first track synced and every track after it quietly fell
back. So the adapter reports `settling` and the lookup waits for a length that
belongs to the track on screen.

**Every side-panel tab renders into the same element.**
`ytmusic-description-shelf-renderer` is not the lyrics shelf; it is the shelf,
and the related tab fills it with the artist's biography. A search that took the
first tab producing a shelf therefore put a biography on screen labelled as
lyrics, and because the winning index was remembered, one wrong guess became
every track for the rest of the session. The search now runs only when the
lyrics tab gave no answer at all — a message renderer saying "no lyrics" is an
answer — and what it finds is used once and not remembered.

**Lyrics render lazily but then stick around.** Until the lyrics tab has been
opened once, `ytmusic-description-shelf-renderer` does not exist, so reading
YouTube Music's own lyrics means opening the tab and putting the side panel
back. After it has rendered it stays in the DOM when you switch tabs away — so
that round trip happens once per track rather than on every read.

**LRCLIB rejects `User-Agent`, not the request.** Its CORS preflight allows
`content-type`, `x-user-agent` and `lrclib-client` — and nothing else. Setting
`User-Agent` to identify the client, which is the obvious reading of its own
guidance, fails the preflight instead of the request, and from inside the page
that is indistinguishable from the service being down. `Lrclib-Client` is the
header that works.

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

## Notices

An independent, unofficial extension. Not made, endorsed or reviewed by Google
LLC or YouTube; *YouTube Music* is their trademark and is named here only to say
what site this works on.

- [PRIVACY.md](PRIVACY.md) — what is stored, what leaves the machine, and how to
  stop the one thing that does. This is the document the store listings point at.
- [NOTICE.md](NOTICE.md) — attribution and third-party licences: Pretendard
  under the OFL, LRCLIB, and the rights in the lyrics and cover art on screen.
  It also records that this project has no licence of its own yet.

Packaging note: the store build is `manifest.json`, `icons/` and `src/` — `dev/`
and the documents are not part of it. `src/fonts/OFL.txt` is, and has to be:
the OFL requires the licence to travel with the font.
