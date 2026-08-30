/* Mock state for the design harness.
 *
 * The lyrics below are placeholder text written for this file -- they are not
 * from any real song. The point is to exercise line length, mixed scripts and
 * scroll behaviour, which invented text does just as well.
 */

globalThis.MOCK = (() => {
  "use strict";

  const filler = [
    "hold the light a little longer",
    "let the room forget the time",
    "and the quiet does the talking",
    "when the record starts to climb",
    "",
    "천천히 도는 밤이 좋아",
    "돌아가는 소리를 들어",
    "hold it, hold it, hold it there",
    "hold it, hold it, everywhere",
    "",
    "if the morning wants an answer",
    "tell it nothing, tell it slow",
    "there is nobody to answer",
    "and there's nowhere left to go",
    "",
    "천천히 도는 밤이 좋아",
    "이대로 조금만 더",
    "hold it, hold it, hold it there",
    "hold it, hold it, everywhere",
    "",
    "(placeholder text -- not real lyrics)",
  ].join("\n");

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
      lyrics: { state: "ok", text: filler, source: "출처: Placeholder" },
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
      lyrics: { state: "none" },
    },
  ];

  return { tracks, queue };
})();
