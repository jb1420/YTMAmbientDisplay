# Notices

Attribution, third-party licences, and what the rights in the things on screen
are. Privacy is a separate document: [PRIVACY.md](PRIVACY.md).

## Not affiliated with Google or YouTube

YTM Ambient Display is an independent, unofficial extension. It is not made,
endorsed, sponsored or reviewed by Google LLC or YouTube. **YouTube** and
**YouTube Music** are trademarks of Google LLC, and they are used here only to
say what site the extension works on — a use this project claims no rights in.

The extension does not modify, intercept or re-serve YouTube Music's audio,
video or network traffic. It reads the page's own state and draws its own screen
on top of it, in the viewer's browser.

## Bundled third-party software

### Pretendard Variable — `src/fonts/PretendardVariable.woff2`

Copyright © 2021 Kil Hyung-jin, with Reserved Font Name 'Pretendard'.
Licensed under the SIL Open Font License, Version 1.1.

Pretendard is built on Source (© 2014–2021 Adobe, Reserved Font Name 'Source'),
Inter (© 2016 The Inter Project Authors) and M PLUS 1 (© 2021 The M+ FONTS
Project Authors), and carries all four copyright lines.

The full licence text is at [src/fonts/OFL.txt](src/fonts/OFL.txt) and **must
travel with every copy of the font** — clause 2 of the OFL requires it, so the
file belongs in the packaged extension, not only in this repository.

Nothing else in the extension is third-party code. There are no dependencies, no
bundled libraries, and no build step.

## Services the extension reads from

### LRCLIB — `lrclib.net`

An independent, free, crowdsourced database of synchronised lyrics, operated by
people unconnected to this project. This extension is a client of its public
API: it sends a track's title, artist, album and length, and identifies itself
with a `Lrclib-Client` header. Requests are made at most twice per track and
only while the synced-lyrics setting is on.

The lyrics LRCLIB returns are contributed by its users. This project neither
owns them nor makes any claim about them, and LRCLIB's own terms govern its
service. Where LRCLIB's words are shown, the panel says so.

### YouTube Music's own lyrics panel

The fallback source. The text is read out of the page the viewer is already
looking at and shown to that viewer alone.

## Rights in what appears on screen

Lyrics, cover art, titles and artist names belong to their respective rights
holders — songwriters, publishers, labels and artists. This extension is a
viewer for material the person running it is already being shown by YouTube
Music. It does not store any of it beyond the browser tab's memory, does not
redistribute it, and does not send it anywhere. Closing the tab ends it.

## This project

Everything else here — the extension's own source, its icons, and the test
covers in `dev/art/` — is © 2025 Jaebin.

**No licence has been granted yet.** Until one is added, the ordinary default
applies: all rights reserved, and nobody else has permission to copy, modify or
redistribute the source. That is fine for shipping a compiled extension to a
store, and it is not fine for a public repository that wants contributions — so
if this is going to be open source, add a `LICENSE` file (MIT is the usual
choice for something this size) before or when the repository goes public.
Adding one does not affect the font, which stays under the OFL either way.
