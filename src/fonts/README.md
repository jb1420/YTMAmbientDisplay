# Fonts

One file. Replacing it is a drop-in — the display picks it up on the next
extension reload, nothing else to change.

| File | Family | Where to get it |
|---|---|---|
| `PretendardVariable.woff2` | Pretendard Variable | https://github.com/orioncactus/pretendard/releases → `pretendard-vXXXX.zip` → `web/variable/woff2/PretendardVariable.woff2` |

OFL-1.1 licensed, so bundling it in an extension is fine — but only *with the
licence*: clause 2 requires the copyright notice and the licence text to travel
with every copy. `OFL.txt` next to the font is that copy, and it has to stay in
the packaged build, not just in the repo. Pretendard draws on Source, Inter and
M PLUS 1, so the file carries four copyright lines, all of them required.

## Why this one

Pretendard covers Latin and Hangul in a single family, so a Korean title and an
English title look like they belong to the same design. A system font stack
cannot do that — it swaps families mid-string, and the two halves disagree about
weight and rhythm.

It is also the whole type system here: title, labels, lyrics and timecodes all
use it. The numeric columns that would normally call for a monospace rely on
Pretendard's tabular figures instead, so durations and elapsed times do not
shift as the digits change.

Japanese kana coverage is thin, so `overlay.css` falls through to
`Hiragino Sans` / `Yu Gothic UI` / `Noto Sans JP` for kana.

## Without it

`overlay.css` falls back to `Segoe UI Variable Display` / `Malgun Gothic` on
Windows and the platform UI stack elsewhere. Readable, but the title loses most
of its character and Korean/Latin mixing gets visibly uneven.
