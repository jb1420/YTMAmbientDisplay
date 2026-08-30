/* Reads settings into the controls and writes each change straight back. The
 * content script picks them up through storage.onChanged, so an open display
 * updates while the popup is still on screen. */

(async () => {
  "use strict";

  const TOGGLES = ["enabled", "gradientMotion", "syncedLyrics", "lyricsSeek"];
  const current = await YTMD.settings.read();

  const segment = [...document.querySelectorAll(".segment button")];

  function paint() {
    for (const key of TOGGLES) {
      const input = document.getElementById(key);
      if (input) input.checked = !!current[key];
    }
    for (const btn of segment) {
      btn.setAttribute("aria-checked", String(btn.dataset.panel === current.panel));
    }
    document.body.classList.toggle("is-off", !current.enabled);
  }

  for (const key of TOGGLES) {
    document.getElementById(key)?.addEventListener("change", (ev) => {
      current[key] = ev.target.checked;
      paint();
      YTMD.settings.write({ [key]: ev.target.checked });
    });
  }

  for (const btn of segment) {
    btn.addEventListener("click", () => {
      current.panel = btn.dataset.panel;
      paint();
      YTMD.settings.write({ panel: current.panel });
    });
  }

  // Arrow keys move through a radiogroup; without this it is mouse-only.
  document.querySelector(".segment")?.addEventListener("keydown", (ev) => {
    const step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    ev.preventDefault();
    const at = segment.findIndex((b) => b.dataset.panel === current.panel);
    const next = segment[(at + step + segment.length) % segment.length];
    current.panel = next.dataset.panel;
    paint();
    next.focus();
    YTMD.settings.write({ panel: current.panel });
  });

  paint();

  // Say so plainly when the popup is open somewhere the extension does nothing.
  // tab.url is only readable with the "tabs" permission, which is not worth
  // requesting for a hint -- when it is missing, leave the default text.
  const [tab] = (await YTMD.env.api.tabs?.query({ active: true, currentWindow: true })) ?? [];
  if (tab?.url && !/^https:\/\/music\.youtube\.com\//.test(tab.url)) {
    document.getElementById("hint").textContent =
      "music.youtube.com 탭에서만 동작합니다.";
  }
})();
