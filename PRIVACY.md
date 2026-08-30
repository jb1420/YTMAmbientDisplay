# Privacy Policy — YTM Ambient Display

Last updated: 2026-08-30

**Short version: the extension has no server, no account, no analytics, and no
telemetry. The developer receives nothing. The only thing that ever leaves your
machine is a track's title, artist, album and length, sent to a public lyrics
database, and only while the synced-lyrics setting is on.**

## What the extension stores

Six settings, kept in the browser's own extension storage
(`storage.sync`, falling back to `storage.local` where sync is unavailable):

| Setting | Value |
| --- | --- |
| `enabled` | master on/off |
| `panel` | which side panel is open — none, lyrics, or queue |
| `gradientMotion` | background motion on/off |
| `syncedLyrics` | the lyrics lookup on/off |
| `lyricsSeek` | click-a-line-to-seek on/off |
| `lyricsOffset` | your lyric timing correction, in milliseconds |

That is the complete list. If your browser has extension sync turned on, these
six values sync between your own devices through your browser account, the same
way your bookmarks do. They are not sent anywhere else. Uninstalling the
extension removes them.

Nothing else is stored. Lyrics and queue contents are held in memory for the
current tab only and are gone when the tab closes.

## What leaves your machine

### 1. Lyrics lookup — `lrclib.net`

[LRCLIB](https://lrclib.net) is a free, crowdsourced lyrics database, operated
independently of this extension.

- **What is sent:** the track's title, primary artist, album name and length.
  Nothing else.
- **When:** at most twice per track, only for a track not already looked up in
  this session, and only while **Synced lyrics** is on in the popup.
- **What is not sent:** no cookies (`credentials: "omit"`) and no referrer
  (`referrerPolicy: "no-referrer"`), so the request carries nothing that
  identifies you, your browser session, your YouTube or Google account, or which
  page you are on. There is no user ID, no device ID, and no persistent
  identifier of any kind. LRCLIB sees a request for a song title, and your IP
  address, as it would from any visitor to any website.
- **How to stop it entirely:** turn **Synced lyrics** off in the toolbar popup.
  The request is then never made, and lyrics come from YouTube Music's own panel
  instead.

LRCLIB's own handling of requests is governed by its operators, not by this
extension.

### 2. Cover art — YouTube Music's image host

The background gradient is sampled from the album cover, which means the cover
image has to be read as pixels. The extension fetches the same image URL the
page has already loaded, from Google's image host, with cookies omitted. No
information about you is added to that request, and the image bytes never leave
your machine — the colour extraction happens locally.

### 3. Nothing else

There is no other network traffic. The extension has no background script, no
analytics SDK, no crash reporting, no advertising, and no connection to any
server operated by the developer — the developer does not operate one.

## Permissions

The extension requests exactly one permission, `storage`, used for the six
settings above. It requests no host permissions. It runs only on
`https://music.youtube.com`.

## What the extension does not do

- It does not collect, transmit, or sell personal information.
- It does not read your browsing history, other tabs, bookmarks, or credentials.
- It does not read or use your YouTube or Google account, and it never sees your
  login state beyond what the page itself displays.
- It does not track what you listen to. The track metadata sent to LRCLIB is not
  logged, aggregated, or retained by this extension in any form beyond the
  in-memory cache for the tab you are using.
- It does not use remote code. All code runs from the installed package.

## Children

The extension is not directed at children and collects no information from
anyone, of any age.

## Changes

Any change to what leaves your machine will be reflected here and in the
extension's release notes before the version that makes the change is published.

## Contact

Questions or reports: open an issue on the project's repository.

---

# 개인정보처리방침 — YTM Ambient Display

최종 수정일: 2026-08-30

**요약: 이 확장 프로그램에는 서버도, 계정도, 분석 도구도, 원격 측정도 없습니다.
개발자에게 전달되는 정보는 전혀 없습니다. 기기 밖으로 나가는 유일한 정보는
가사를 찾기 위해 공개 가사 데이터베이스로 보내는 곡의 제목·아티스트·앨범명·
재생시간이며, 그것도 '동기화 가사' 설정이 켜져 있을 때만입니다.**

## 저장하는 정보

브라우저 확장 저장소(`storage.sync`, 사용할 수 없으면 `storage.local`)에
설정값 6개만 저장합니다: 전체 on/off(`enabled`), 열려 있는 사이드 패널
(`panel`), 배경 모션(`gradientMotion`), 가사 조회 on/off(`syncedLyrics`),
가사 줄 클릭 이동(`lyricsSeek`), 가사 싱크 보정값(`lyricsOffset`).

이것이 전부입니다. 브라우저의 확장 동기화가 켜져 있다면 이 6개 값은 북마크와
같은 방식으로 본인의 기기 사이에서만 동기화되며, 그 외 어디로도 전송되지
않습니다. 확장을 삭제하면 함께 삭제됩니다.

가사와 대기열 내용은 현재 탭의 메모리에만 존재하며 탭을 닫으면 사라집니다.

## 기기 밖으로 나가는 정보

**1. 가사 조회 — `lrclib.net`**
[LRCLIB](https://lrclib.net)은 이 확장과 무관하게 운영되는 무료 공개 가사
데이터베이스입니다. 곡의 제목, 대표 아티스트, 앨범명, 재생시간만 전송하며,
한 곡당 최대 2회, 이번 세션에서 아직 조회하지 않은 곡에 대해서만, 그리고
팝업의 **동기화 가사**가 켜져 있을 때만 요청합니다. 쿠키
(`credentials: "omit"`)와 리퍼러(`referrerPolicy: "no-referrer"`)를 모두
제거하므로 이용자, 브라우저 세션, YouTube·Google 계정, 현재 보고 있는 페이지를
식별할 수 있는 정보는 함께 전송되지 않습니다. 사용자 ID, 기기 ID 등 지속적인
식별자도 없습니다. 팝업에서 이 설정을 끄면 요청 자체가 발생하지 않으며, 가사는
YouTube Music의 자체 패널에서만 가져옵니다.

**2. 앨범 커버 이미지 — YouTube Music 이미지 서버**
배경 그라디언트 색을 추출하기 위해, 페이지가 이미 불러온 것과 동일한 커버
이미지 주소를 쿠키 없이 다시 요청합니다. 이용자에 관한 정보는 함께 전송되지
않으며, 색 추출은 전적으로 기기 안에서 이루어집니다.

**3. 그 외에는 없습니다.**
백그라운드 스크립트, 분석 SDK, 오류 수집, 광고가 없고, 개발자가 운영하는
서버도 존재하지 않습니다.

## 권한

`storage` 권한 하나만 사용하며(위 설정 6개 저장 용도), 호스트 권한은 요청하지
않습니다. `https://music.youtube.com`에서만 동작합니다.

## 하지 않는 것

개인정보를 수집·전송·판매하지 않습니다. 방문 기록, 다른 탭, 북마크, 자격 증명을
읽지 않습니다. YouTube·Google 계정을 읽거나 사용하지 않습니다. 청취 기록을
추적하거나 보관하지 않습니다. 원격 코드를 실행하지 않으며, 모든 코드는 설치된
패키지 안에서 실행됩니다.

## 문의

프로젝트 저장소의 이슈로 문의해 주세요.
