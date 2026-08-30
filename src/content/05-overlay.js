/* The display itself.
 *
 * Pure UI: it knows nothing about YouTube Music or about extension APIs. You
 * hand it state through the setters and it calls your handlers back. That is
 * what lets dev/preview.html drive the exact same code with mock data.
 *
 * Everything lives in a shadow root with an adopted constructed stylesheet, so
 * YouTube Music's Polymer styles cannot reach in and the page CSP does not
 * apply to the sheet.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.Overlay = (() => {
  "use strict";

  const svg = (paths, box = 24) =>
    `<svg viewBox="0 0 ${box} ${box}" fill="currentColor" aria-hidden="true">${paths}</svg>`;

  const stroke = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"` +
    ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICON = {
    prev: svg('<path d="M7 6v12H5V6h2zm12 0v12l-9-6 9-6z"/>'),
    next: svg('<path d="M17 6v12h2V6h-2zM5 6v12l9-6-9-6z"/>'),
    play: svg(
      '<path d="M8.4 5.2 19.3 12 8.4 18.8z"' +
      ' stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
    ),
    pause: svg(
      '<rect x="7.3" y="4.9" width="3.6" height="14.2" rx="1.1"/>' +
      '<rect x="13.1" y="4.9" width="3.6" height="14.2" rx="1.1"/>'
    ),
    close: svg('<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>'),
    disc: svg('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 13.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4z"/>'),
    chevronLeft: stroke('<path d="M15 6 9 12l6 6"/>'),
    chevronRight: stroke('<path d="m9 6 6 6-6 6"/>'),
  };

  const TEMPLATE = `
    <div class="root" data-panel="none" data-motion="on">
      <div class="bg">
        <div class="washes" data-slot="a">
          <div class="wash wash-a"></div><div class="wash wash-b"></div><div class="wash wash-c"></div>
        </div>
        <div class="washes" data-slot="b">
          <div class="wash wash-a"></div><div class="wash wash-b"></div><div class="wash wash-c"></div>
        </div>
        <div class="vignette"></div>
        <div class="grain"></div>
      </div>

      <header class="chrome">
        <span class="diag" role="status"></span>
        <button class="iconbtn" data-act="exit" aria-label="전체화면 닫기">${ICON.close}</button>
      </header>

      <div class="side-toggle">
        <button class="iconbtn" data-act="notes" aria-expanded="false"
                aria-label="사이드 패널 열기">${ICON.chevronLeft}</button>
      </div>

      <main class="grid">
        <section class="stage">
          <div class="stage-inner">
            <div class="art-wrap">
              <img class="art" alt="" hidden>
              <div class="art-fallback">${ICON.disc}</div>
            </div>
            <div class="meta">
              <h1 class="title"></h1>
              <div class="byline">
                <p class="artist"></p>
                <p class="album"></p>
              </div>
            </div>
          </div>
        </section>

        <aside class="notes">
          <nav class="switcher" role="tablist" aria-label="사이드 패널">
            <button role="tab" data-act="show-lyrics" data-label="Lyrics"
                    aria-selected="false">Lyrics</button>
            <button role="tab" data-act="show-queue" data-label="Queue"
                    aria-selected="false">Queue</button>
          </nav>
          <section class="panel panel--lyrics" hidden>
            <div class="lyrics"></div>
            <p class="lyrics-source"></p>
          </section>
          <section class="panel panel--queue" hidden>
            <ol class="queue"></ol>
          </section>
        </aside>
      </main>

      <footer class="rail">
        <div class="transport">
          <button class="tbtn" data-act="prev" aria-label="이전 곡">${ICON.prev}</button>
          <button class="tbtn tbtn--primary" data-act="playpause" aria-label="재생">${ICON.play}</button>
          <button class="tbtn" data-act="next" aria-label="다음 곡">${ICON.next}</button>
        </div>
        <div class="scrub">
          <span class="time time--elapsed">0:00</span>
          <div class="track" role="slider" tabindex="0" aria-label="재생 위치"
               aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
            <div class="fill"></div>
          </div>
          <span class="time time--remain">-0:00</span>
        </div>
      </footer>
    </div>
  `;

  function formatTime(seconds, signed = false) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const body = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return (signed ? "-" : "") + body;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* Size steps for the metadata lines, as multipliers on the size the sheet
   * gives each one.
   *
   * Two ladders, because the two questions are not the same one. The short one
   * is what a line may give up to stay on a single line -- past about 12% the
   * saving stops being worth what it costs the type. The long one is for text
   * that was never going to fit on one line however hard it is squeezed, where
   * the job is only to get it inside two. */
  const FIT_KEEP_ONE = [1, .94, .88];
  const FIT_ALLOW_TWO = [1, .94, .88, .8, .72];

  /* ----------------------------------------------------------------- font -- */

  /* The display is one typeface doing every job, so "the @font-face did not take"
   * is not a small cosmetic loss -- it changes how the whole screen reads. The
   * declarative route (src/ui/fonts.css, injected as a content-script stylesheet)
   * is the cheap one and usually works, but whether an injected @font-face
   * reaches the page at all depends on the browser and on the page's font-src
   * policy, and when it fails it fails silently.
   *
   * So: check, and if the family is not actually usable, load the bytes here and
   * register them through the FontFace API. Fetching an extension resource is
   * something the overlay already does for its stylesheet, and a face built from
   * an ArrayBuffer has no URL left for a policy to object to.
   *
   * Document-scoped on purpose -- @font-face is ignored inside a shadow root, so
   * the face has to live on document.fonts for the overlay's own shadow tree to
   * see it. One load per document, however many overlays get mounted. */
  const FONT_FAMILY = "YTMD Sans";
  const FONT_FILE = "fonts/PretendardVariable.woff2";
  let fontReady = null;

  function ensureFont(assetsBase) {
    fontReady ??= (async () => {
      const declared = [...document.fonts]
        .find((f) => f.family.replace(/["']/g, "") === FONT_FAMILY);
      if (declared) {
        // Present, but "declared" is not "arrived": a face whose src was blocked
        // sits here in error just the same. Only a resolved load proves it.
        try { await declared.load(); return; } catch { /* fall through */ }
      }

      const res = await fetch(`${assetsBase}/${FONT_FILE}`);
      if (!res.ok) throw new Error(`${res.status} fetching the font file`);
      const face = new FontFace(FONT_FAMILY, await res.arrayBuffer(), {
        weight: "100 900",
        display: "swap",
      });
      await face.load();
      document.fonts.add(face);
    })().catch((err) => {
      // The fallback stack in overlay.css is a real design, just a lesser one.
      console.warn(`[YTM Ambient Display] ${FONT_FAMILY} unavailable:`, err.message);
    });
    return fontReady;
  }

  class Overlay {
    /**
     * @param {object} opts
     * @param {string} opts.assetsBase  root that contains ui/ and fonts/
     * @param {object} opts.handlers    onPlayPause, onPrev, onNext, onSeek(sec),
     *                                  onToggleNotes, onSelectPanel(name), onExit,
     *                                  onQueuePick(i)
     */
    constructor({ assetsBase, handlers = {} }) {
      this.assetsBase = assetsBase.replace(/\/$/, "");
      this.handlers = handlers;
      this.host = null;
      this.shadow = null;
      this.el = {};
      this.isOpen = false;

      this._playback = { position: 0, duration: 0, paused: true, at: 0 };
      this._scrub = null;        // fraction while dragging, else null
      this._liveSlot = "a";
      this._artUrl = null;
      this._lastQueue = null;
      this._raf = 0;
      this._fitTimer = 0;
    }

    /* ------------------------------------------------------------ mount -- */

    async mount(parent = document.documentElement) {
      if (this.host) return;

      this.host = document.createElement("div");
      this.host.id = "ytm-display-root";
      this.shadow = this.host.attachShadow({ mode: "open" });

      const sheet = new CSSStyleSheet();
      // Both are extension-resource fetches; run them together rather than
      // making the mount wait out two round trips in sequence.
      const [css] = await Promise.all([
        fetch(`${this.assetsBase}/ui/overlay.css`).then((r) => r.text()),
        ensureFont(this.assetsBase),
      ]);
      // The stylesheet is adopted, not linked, so relative url() would resolve
      // against the document. One token keeps the file portable instead.
      sheet.replaceSync(css.replaceAll("__ASSETS__", this.assetsBase));
      this.shadow.adoptedStyleSheets = [sheet];

      this.shadow.innerHTML = TEMPLATE;
      this._cache();
      this._wire();

      parent.appendChild(this.host);
      this.host.style.display = "none";
    }

    _cache() {
      const $ = (sel) => this.shadow.querySelector(sel);
      this.el = {
        root: $(".root"),
        diag: $(".diag"),
        washA: $('.washes[data-slot="a"]'),
        washB: $('.washes[data-slot="b"]'),
        artWrap: $(".art-wrap"),
        art: $(".art"),
        artFallback: $(".art-fallback"),
        stageInner: $(".stage-inner"),
        meta: $(".meta"),
        title: $(".title"),
        artist: $(".artist"),
        album: $(".album"),
        panelLyrics: $(".panel--lyrics"),
        lyrics: $(".lyrics"),
        lyricsSource: $(".lyrics-source"),
        panelQueue: $(".panel--queue"),
        queue: $(".queue"),
        notesToggle: $('[data-act="notes"]'),
        playpause: $('[data-act="playpause"]'),
        track: $(".track"),
        elapsed: $(".time--elapsed"),
        remain: $(".time--remain"),
      };
    }

    _wire() {
      this.shadow.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-act]");
        if (!btn) return;
        const h = this.handlers;
        switch (btn.dataset.act) {
          case "playpause": h.onPlayPause?.(); break;
          case "prev": h.onPrev?.(); break;
          case "next": h.onNext?.(); break;
          case "exit": h.onExit?.(); break;
          case "notes": h.onToggleNotes?.(); break;
          case "show-lyrics": h.onSelectPanel?.("lyrics"); break;
          case "show-queue": h.onSelectPanel?.("queue"); break;
        }
      });

      this.el.queue.addEventListener("click", (ev) => {
        const row = ev.target.closest(".qrow");
        if (row) this.handlers.onQueuePick?.(Number(row.dataset.index));
      });

      this._wireScrub();

      // Escape leaves fullscreen on its own; this covers the windowed case.
      this._onKey = (ev) => {
        if (!this.isOpen) return;
        if (ev.key === "Escape" && !document.fullscreenElement) {
          ev.preventDefault();
          this.handlers.onExit?.();
        }
      };
      window.addEventListener("keydown", this._onKey, true);

      // The fit depends on how wide the meta column is, so it is redone
      // whenever that width settles: after the panel's own 640ms move, and
      // after the window stops changing size.
      this.el.stageInner.addEventListener("transitionend", (ev) => {
        if (ev.propertyName === "width") this._fitMeta();
      });
      this._onResize = () => this._scheduleFit();
      window.addEventListener("resize", this._onResize);
    }

    _wireScrub() {
      const track = this.el.track;

      const fractionAt = (clientX) => {
        const r = track.getBoundingClientRect();
        return r.width ? clamp((clientX - r.left) / r.width, 0, 1) : 0;
      };

      const move = (ev) => {
        this._scrub = fractionAt(ev.clientX);
        this._paint();
      };

      const up = (ev) => {
        const f = this._scrub ?? fractionAt(ev.clientX);
        this._scrub = null;
        track.classList.remove("is-scrubbing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const duration = this._playback.duration;
        if (duration > 0) this.handlers.onSeek?.(f * duration);
      };

      track.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        track.classList.add("is-scrubbing");
        this._scrub = fractionAt(ev.clientX);
        this._paint();
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });

      track.addEventListener("keydown", (ev) => {
        const { position, duration } = this._playback;
        if (!duration) return;
        const step = ev.shiftKey ? 30 : 5;
        if (ev.key === "ArrowRight") {
          ev.preventDefault();
          this.handlers.onSeek?.(clamp(position + step, 0, duration));
        } else if (ev.key === "ArrowLeft") {
          ev.preventDefault();
          this.handlers.onSeek?.(clamp(position - step, 0, duration));
        }
      });
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._fitTimer);
      window.removeEventListener("keydown", this._onKey, true);
      window.removeEventListener("resize", this._onResize);
      this.host?.remove();
      this.host = null;
      this.shadow = null;
      this.isOpen = false;
    }

    /* ----------------------------------------------------- open / close -- */

    open() {
      if (!this.host || this.isOpen) return;
      this.isOpen = true;
      this.host.style.display = "";
      // Replay the entry stagger: drop the class, force a reflow, put it back.
      this.el.root.classList.remove("is-entering");
      void this.el.root.offsetWidth;
      this.el.root.classList.add("is-entering");
      // Nothing has a measurable size while the host is display:none, so the
      // fit that ran on the last setTrack was a no-op.
      this._fitMeta();
      this._paint();
      this._loop();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      cancelAnimationFrame(this._raf);
      if (this.host) this.host.style.display = "none";
    }

    /** Fullscreen must be requested inside a user gesture. */
    async requestFullscreen() {
      try {
        if (!document.fullscreenElement) await this.host.requestFullscreen();
      } catch (err) {
        // Windowed overlay is a perfectly good fallback.
        console.warn("[YTM Ambient Display] fullscreen refused:", err.message);
      }
    }

    /* -------------------------------------------------------------- fit -- */

    /* CSS can clamp an overflowing line but it cannot say that one overflowed,
     * so the size step is chosen here.
     *
     * A line starts at the size the sheet gives it and steps down only as far
     * as FIT_KEEP_ONE goes, and only while that is still buying a single line.
     * When nothing on that ladder fits, the wrap is accepted and the largest
     * size that fits inside two lines is used instead -- shrinking a long list
     * of artists past the point where it wraps anyway costs legibility and buys
     * nothing. Whatever is still over after the last step the sheet ellipsizes.
     *
     * @param {HTMLElement} el
     */
    _fit(el) {
      el.style.removeProperty("--fit");
      if (!this.isOpen || !el.textContent.trim()) return;

      const measured = new Map();
      const linesAt = (scale) => {
        if (measured.has(scale)) return measured.get(scale);
        el.style.setProperty("--fit", String(scale));
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        // Counted with the clamp lifted: a clamped box stops growing at its
        // limit, so its height reports the limit rather than what the text
        // needs, and every size over would look like it fits.
        el.style.setProperty("-webkit-line-clamp", "unset");
        const height = el.scrollHeight;
        el.style.removeProperty("-webkit-line-clamp");
        const lines = lh > 0 ? Math.round(height / lh) : 1;
        measured.set(scale, lines);
        return lines;
      };

      const scale = FIT_KEEP_ONE.find((s) => linesAt(s) <= 1)
        ?? FIT_ALLOW_TWO.find((s) => linesAt(s) <= 2)
        ?? FIT_ALLOW_TWO[FIT_ALLOW_TWO.length - 1];
      el.style.setProperty("--fit", String(scale));
    }

    /** Re-fits all three metadata lines. Cheap enough to run on every track. */
    _fitMeta() {
      if (!this.el.meta) return;
      this.el.meta.classList.add("is-fitting");
      for (const el of [this.el.title, this.el.artist, this.el.album]) this._fit(el);
      // Commit the chosen sizes while the transition is still off. Without the
      // reflow the class comes back off in the same style recalc that carries
      // the final --fit, and the size the fitter just settled on animates in
      // over 640ms instead of simply being the size.
      void this.el.meta.offsetWidth;
      this.el.meta.classList.remove("is-fitting");
    }

    _scheduleFit() {
      clearTimeout(this._fitTimer);
      this._fitTimer = setTimeout(() => this._fitMeta(), 120);
    }

    /* ---------------------------------------------------------- setters -- */

    setMotion(on) {
      this.el.root.dataset.motion = on ? "on" : "off";
    }

    /** @param {"none"|"lyrics"|"queue"} panel -- only one opens at a time. */
    setPanel(panel) {
      const name = panel === "lyrics" || panel === "queue" ? panel : "none";
      const open = name !== "none";

      this.el.root.dataset.panel = name;
      this.el.panelLyrics.hidden = name !== "lyrics";
      this.el.panelQueue.hidden = name !== "queue";

      for (const act of ["lyrics", "queue"]) {
        this.shadow.querySelector(`[data-act="show-${act}"]`)
          .setAttribute("aria-selected", String(name === act));
      }

      // The chevron points the way the column will move.
      this.el.notesToggle.innerHTML = open ? ICON.chevronRight : ICON.chevronLeft;
      this.el.notesToggle.setAttribute("aria-expanded", String(open));
      this.el.notesToggle.setAttribute(
        "aria-label", open ? "사이드 패널 닫기" : "사이드 패널 열기"
      );

      // transitionend carries the fit once the column has finished moving;
      // this is the backstop for the case where the width does not change.
      this._scheduleFit();
    }

    setTrack({ title = "", artist = "", album = "", artUrl = null } = {}) {
      this.el.title.textContent = title;
      this.el.title.title = title;
      this.el.artist.textContent = artist;
      this.el.album.textContent = album;
      this._fitMeta();
      this._setArt(artUrl);
    }

    async _setArt(url) {
      if (url === this._artUrl) return;
      this._artUrl = url;

      if (!url) {
        this.el.art.hidden = true;
        this.el.artFallback.hidden = false;
        return;
      }

      this.el.artWrap.classList.add("is-changing");
      try {
        // Decode before swapping so the sleeve never flashes empty.
        //
        // No `crossOrigin` here. The sleeve only ever paints the picture --
        // 02-palette.js is the one that reads pixels back -- and a CORS image
        // load from a content script is refused outright in Firefox, which
        // left the fallback disc on screen for every track. Without the
        // attribute the same request succeeds in both browsers, and it is the
        // request the visible <img> below is about to make anyway.
        const img = new Image();
        img.src = url;
        await img.decode();
        if (this._artUrl !== url) return;   // a newer track won the race
        this.el.art.src = url;
        this.el.art.hidden = false;
        this.el.artFallback.hidden = true;
      } catch {
        if (this._artUrl !== url) return;
        this.el.art.hidden = true;
        this.el.artFallback.hidden = false;
      } finally {
        if (this._artUrl === url) this.el.artWrap.classList.remove("is-changing");
      }
    }

    /** Crossfades into whichever wash stack is currently hidden. */
    setPalette(tokens) {
      if (!tokens) return;
      const next = this._liveSlot === "a" ? this.el.washB : this.el.washA;
      const live = this._liveSlot === "a" ? this.el.washA : this.el.washB;

      next.style.setProperty("--wash-1", tokens.wash1);
      next.style.setProperty("--wash-2", tokens.wash2);
      next.style.setProperty("--wash-3", tokens.wash3);

      next.classList.add("is-live");
      live.classList.remove("is-live");
      this._liveSlot = this._liveSlot === "a" ? "b" : "a";

      // These two transition on their own properties, no crossfade needed.
      this.el.root.style.setProperty("--bg-base", tokens.bgBase);
      this.el.root.style.setProperty("--ink", tokens.ink);
    }

    /* `at` is the baseline _paint() interpolates from, so it is only restamped
     * when something actually moved. The player bar's clock ticks about once a
     * second while this is called several times a second, and restamping on
     * every call would keep resetting the interpolation to zero -- the bar
     * would jump a second at a time instead of running smoothly. */
    setPlayback({ position = 0, duration = 0, paused = true }) {
      const prev = this._playback;
      const still = prev.position === position && prev.duration === duration
                    && prev.paused === paused;
      this._playback = {
        position, duration, paused,
        at: still ? prev.at : performance.now(),
      };
      this.el.playpause.innerHTML = paused ? ICON.play : ICON.pause;
      this.el.playpause.setAttribute("aria-label", paused ? "재생" : "일시정지");
      this.shadow.querySelectorAll(".qrow[aria-current='true']")
        .forEach((r) => (r.dataset.playing = String(!paused)));
      this._paint();
    }

    /** Adapter trouble, surfaced in the top bar. Empty text hides the slot. */
    setDiagnostic(text = "") {
      this.el.diag.textContent = text;
    }

    setLyrics({ state = "none", text = "", source = "" } = {}) {
      const box = this.el.lyrics;
      if (state === "ok" && text.trim()) {
        box.textContent = text;
        box.classList.remove("empty");
        this.el.lyricsSource.textContent = source || "";
      } else {
        box.textContent = state === "loading" ? "가사를 불러오는 중" : "이 곡은 가사가 없습니다";
        box.classList.add("empty");
        this.el.lyricsSource.textContent = "";
      }
      box.scrollTop = 0;
    }

    _queueChanged(items) {
      const prev = this._lastQueue;
      if (!prev || prev.length !== items.length) return true;
      return items.some((it, n) =>
        it.title !== prev[n].title ||
        it.artist !== prev[n].artist ||
        !!it.current !== prev[n].current
      );
    }

    setQueue({ items = [] } = {}) {
      // Rebuilding the list on every playback tick would fight the user's
      // scroll position, so redraw only when the queue actually differs.
      // Compared field by field rather than through a joined signature: any
      // separator character is one a track title is allowed to contain.
      if (!this._queueChanged(items)) return;
      this._lastQueue = items.map((i) => ({
        title: i.title, artist: i.artist, current: !!i.current,
      }));

      const playing = !this._playback.paused;
      const frag = document.createDocumentFragment();

      items.forEach((item, index) => {
        const li = document.createElement("li");
        const row = document.createElement("button");
        row.className = "qrow";
        row.type = "button";
        row.dataset.index = String(index);
        if (item.current) {
          row.setAttribute("aria-current", "true");
          row.dataset.playing = String(playing);
        }

        const num = document.createElement("span");
        num.className = "qnum";
        if (item.current) {
          num.innerHTML = '<span class="qbars"><i></i><i></i><i></i></span>';
        } else {
          num.textContent = String(index + 1).padStart(2, "0");
        }

        const mid = document.createElement("span");
        mid.className = "qtitle";
        mid.textContent = item.title || "";
        if (item.artist) {
          const by = document.createElement("span");
          by.className = "qartist";
          by.textContent = item.artist;
          mid.appendChild(by);
        }

        const dur = document.createElement("span");
        dur.className = "qtime";
        dur.textContent = item.duration || "";

        row.append(num, mid, dur);
        li.appendChild(row);
        frag.appendChild(li);
      });

      this.el.queue.replaceChildren(frag);
      this.shadow.querySelector(".qrow[aria-current='true']")
        ?.scrollIntoView({ block: "nearest" });
    }

    /* --------------------------------------------------------- painting -- */

    _loop() {
      const step = () => {
        if (!this.isOpen) return;
        if (!this._playback.paused || this._scrub !== null) this._paint();
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    /* Interpolates between the ~4Hz timeupdate events so the bar moves
     * smoothly instead of stepping. */
    _paint() {
      const { position, duration, paused, at } = this._playback;
      if (!this.el.track) return;

      const elapsed = paused ? position : position + (performance.now() - at) / 1000;
      const live = duration > 0 ? clamp(elapsed, 0, duration) : 0;
      const shown = this._scrub !== null && duration > 0 ? this._scrub * duration : live;
      const pct = duration > 0 ? (shown / duration) * 100 : 0;

      this.el.track.style.setProperty("--p", `${pct}%`);
      this.el.elapsed.textContent = formatTime(shown);
      this.el.remain.textContent = formatTime(Math.max(0, duration - shown), true);
      this.el.track.setAttribute("aria-valuemax", String(Math.round(duration)));
      this.el.track.setAttribute("aria-valuenow", String(Math.round(shown)));
      this.el.track.setAttribute("aria-valuetext", formatTime(shown));
    }
  }

  Overlay.formatTime = formatTime;
  return Overlay;
})();
