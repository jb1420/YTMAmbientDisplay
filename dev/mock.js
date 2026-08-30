/* Mock state for the design harness.
 *
 * The lyrics below are placeholder text written for this file -- they are not
 * from any real song. The point is to exercise line length, mixed scripts and
 * scroll behaviour, which invented text does just as well.
 */

globalThis.MOCK = (() => {
  "use strict";

  /* The same placeholder text in both shapes a source can hand over: timed
   * lines, and one unsynced block. `plain()` derives the block from the lines
   * so the two can never drift apart while this file is edited.
   *
   * The rows with a time but no words are the interludes. They are here on
   * purpose -- the highlight is supposed to sit on one and wait out the gap
   * rather than skip to the next thing anybody sings. The uneven spacing is
   * also deliberate: evenly spaced lines would never catch an off-by-one in
   * the index walk. */
  const plain = (lines) => lines.map((l) => l.text).join("\n");

  const fillerLines = [
    { t: 8.4, text: "hold the light a little longer" },
    { t: 13.1, text: "let the room forget the time" },
    { t: 17.0, text: "and the quiet does the talking" },
    { t: 22.6, text: "when the record starts to climb" },
    { t: 27.9, text: "" },
    { t: 34.2, text: "천천히 도는 밤이 좋아" },
    { t: 38.0, text: "돌아가는 소리를 들어" },
    { t: 41.7, text: "hold it, hold it, hold it there" },
    { t: 46.4, text: "hold it, hold it, everywhere" },
    { t: 51.0, text: "" },
    { t: 62.5, text: "if the morning wants an answer" },
    { t: 67.2, text: "tell it nothing, tell it slow" },
    { t: 71.4, text: "there is nobody to answer" },
    { t: 76.8, text: "and there's nowhere left to go" },
    { t: 82.1, text: "" },
    { t: 88.6, text: "천천히 도는 밤이 좋아" },
    { t: 92.3, text: "이대로 조금만 더" },
    { t: 96.0, text: "hold it, hold it, hold it there" },
    { t: 100.7, text: "hold it, hold it, everywhere" },
    { t: 105.2, text: "" },
    { t: 118.0, text: "(placeholder text -- not real lyrics)" },
  ];
  const filler = plain(fillerLines);

  // Never timed: this one is here to keep the unsynced path on screen.
  const shortFiller = [
    "one turn, then another",
    "そのまま、もう少しだけ",
    "one turn, then another",
    "",
    "(placeholder text -- not real lyrics)",
  ].join("\n");

  const queue = [
    { title: "Opening Frame", artist: "Placeholder Ensemble", duration: "1:49" },
    { title: "Super Shy", artist: "NewJeans", duration: "2:35" },
    { title: "Mosaic feat. Reol", artist: "Sheeno Mirin, Reol", duration: "2:59" },
    { title: "밤의 가장자리에서 우리는 오래 머물렀다", artist: "긴 제목 테스트", duration: "4:12" },
    { title: "夜明けまでもう少しだけこのままでいさせて", artist: "テストアーティスト", duration: "3:37" },
    { title: "Grey Room", artist: "Placeholder Ensemble", duration: "2:28" },
    // The autoplay tail: shown only for a song playing on its own, numbered in
    // the same run as everything above it, with one rule to mark where it began.
    { title: "Bright Field", artist: "Placeholder Ensemble", duration: "3:04", autoplay: true },
    { title: "Closing Frame", artist: "Placeholder Ensemble", duration: "0:37", autoplay: true },
  ];

  const tracks = [
    {
      queueIndex: 1,
      title: "Super Shy",
      artist: "NewJeans",
      album: "NewJeans 2nd EP 'Get Up'",
      artUrl: "https://yt3.googleusercontent.com/FzLKj6zFEJna0gRNDeZRH4nuQwEyN-YbCaC-bIGLoia6EhirHUachdvdEdR3VdB7pArgFCW8mtpLPL0=w544-h544-l90-rj",
      duration: 155,
      // The synced path: `text` rides along so a change to setLyrics that stops
      // reading `lines` shows up as the block coming back, not as a blank panel.
      lyrics: { state: "ok", lines: fillerLines, text: filler, source: "LRCLIB" },
    },
    {
      queueIndex: 2,
      title: "Mosaic feat. Reol",
      artist: "Sheeno Mirin, Reol",
      album: "Harmony",
      artUrl: "art/crimson.png",
      duration: 179,
      lyrics: { state: "ok", text: shortFiller, source: "출처: Placeholder" },
    },
    {
      queueIndex: 3,
      title: "밤의 가장자리에서 우리는 오래 머물렀다",
      artist: "긴 제목 테스트 아티스트 이름도 제법 길게",
      album: "두 줄로 넘어가는 앨범 제목 테스트",
      artUrl: "art/mono.png",
      duration: 252,
      lyrics: { state: "none" },
    },
    {
      queueIndex: 4,
      title: "夜明けまでもう少しだけこのままでいさせて",
      artist: "テストアーティスト",
      album: "かな表示テスト",
      artUrl: "art/bright.png",
      duration: 217,
      lyrics: { state: "loading" },
    },
    {
      queueIndex: 5,
      title: "Grey Room",
      artist: "Placeholder Ensemble",
      album: "",
      artUrl: null,
      duration: 148,
      lyrics: { state: "instrumental" },
    },
  ];

  return { tracks, queue };
})();
