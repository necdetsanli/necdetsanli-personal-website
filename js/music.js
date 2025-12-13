/**
 * Autoplay is often blocked. We try once, then unlock audio on first user gesture.
 * @returns {void}
 */
function initAutoplayUnlock() {
  const audio = /** @type {HTMLAudioElement | null} */ (document.getElementById("bg-audio"));
  const status = /** @type {HTMLElement | null} */ (document.getElementById("music-status"));
  const player = /** @type {HTMLElement | null} */ (document.querySelector(".winamp"));

  if (audio === null) return;

  /**
   * @returns {Promise<void>}
   */
  async function start() {
    await audio.play();
    if (player !== null) player.classList.add("is-playing");
    if (status !== null) status.textContent = "♪ Playing";
  }

  // Try immediately
  start().catch(() => {
    if (status !== null) {
      status.textContent = "Autoplay blocked. Click anywhere to start sound.";
    }

    const unlock = () => {
      start().catch(() => {
        if (status !== null) status.textContent = "Click ▶ to start.";
      });
    };

    // Any gesture should unlock
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAutoplayUnlock();
});


/**
 * Winamp-style footer player controller.
 * Requires user interaction (browser autoplay policies).
 */
(() => {
  /** @type {HTMLAudioElement | null} */
  const audio = document.getElementById("bg-audio");
  /** @type {HTMLButtonElement | null} */
  const toggleBtn = document.getElementById("music-toggle");
  /** @type {HTMLInputElement | null} */
  const vol = document.getElementById("music-vol");
  /** @type {HTMLElement | null} */
  const status = document.getElementById("music-status");
  /** @type {HTMLElement | null} */
  const player = document.querySelector(".winamp");

  if (audio === null || toggleBtn === null || vol === null || status === null || player === null) {
    return;
  }

  /**
   * @param {string} msg
   * @returns {void}
   */
  function setStatus(msg) {
    status.textContent = msg;
  }

  /**
   * @param {boolean} isPlaying
   * @returns {void}
   */
  function setUI(isPlaying) {
    toggleBtn.textContent = isPlaying ? "⏸" : "▶";
    player.classList.toggle("is-playing", isPlaying);
  }

  // Restore volume
  const savedVol = window.localStorage.getItem("musicVol");
  const volNum = savedVol !== null ? Number(savedVol) : 60;
  const safeVol = Number.isFinite(volNum) ? Math.max(0, Math.min(100, volNum)) : 60;

  vol.value = String(safeVol);
  audio.volume = safeVol / 100;

  vol.addEventListener("input", () => {
    const v = Number(vol.value);
    const vv = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 60;
    audio.volume = vv / 100;
    window.localStorage.setItem("musicVol", String(vv));
  });

  toggleBtn.addEventListener("click", async () => {
    const isPaused = audio.paused === true;

    if (isPaused === true) {
      try {
        await audio.play();
        setUI(true);
        setStatus("Playing.");
      } catch {
        setUI(false);
        setStatus("Couldn’t start audio (autoplay policy or file issue).");
      }
    } else {
      audio.pause();
      setUI(false);
      setStatus("Paused.");
    }
  });

  audio.addEventListener("play", () => setUI(true));
  audio.addEventListener("pause", () => setUI(false));
  audio.addEventListener("error", () => setStatus("Audio error. Check path/format."));

  setUI(false);
  setStatus("Click ▶ to enable music.");
})();
