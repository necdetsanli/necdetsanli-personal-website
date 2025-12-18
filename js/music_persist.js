/**
 * Persist background music state across full page navigations.
 * Stores: currentTime, volume, playing/paused.
 */

"use strict";

/**
 * @typedef {{ t: number; v: number; p: boolean }} MusicState
 */

const MUSIC_STATE_KEY = "necdet:music:v1";

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * @returns {MusicState}
 */
function readState() {
  try {
    const raw = localStorage.getItem(MUSIC_STATE_KEY);
    if (typeof raw !== "string" || raw.length === 0) {
      return { t: 0, v: 0.6, p: false };
    }
    /** @type {unknown} */
    const parsed = JSON.parse(raw);

    /** @type {Partial<MusicState>} */
    const obj =
      parsed !== null && typeof parsed === "object"
        ? /** @type {any} */ (parsed)
        : {};

    const t = isFiniteNumber(obj.t) ? Math.max(0, obj.t) : 0;
    const v = isFiniteNumber(obj.v) ? clamp(obj.v, 0, 1) : 0.6;
    const p = typeof obj.p === "boolean" ? obj.p : false;

    return { t, v, p };
  } catch {
    return { t: 0, v: 0.6, p: false };
  }
}

/**
 * @param {Partial<MusicState>} patch
 * @returns {void}
 */
function writeState(patch) {
  const prev = readState();
  const next = {
    t: isFiniteNumber(patch.t) ? Math.max(0, patch.t) : prev.t,
    v: isFiniteNumber(patch.v) ? clamp(patch.v, 0, 1) : prev.v,
    p: typeof patch.p === "boolean" ? patch.p : prev.p,
  };
  try {
    localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * @returns {void}
 */
function initMusicPersist() {
  /** @type {HTMLAudioElement|null} */
  const audio = document.getElementById("bg-audio");
  if (audio === null) return;

  const state = readState();

  // Restore volume early.
  audio.volume = clamp(state.v, 0, 1);

  // Restore time once metadata is available.
  const applyTime = () => {
    if (!isFiniteNumber(audio.duration) || audio.duration <= 0) {
      return;
    }
    const safeT = clamp(state.t, 0, Math.max(0, audio.duration - 0.25));
    if (isFiniteNumber(safeT)) {
      try {
        audio.currentTime = safeT;
      } catch {
        // ignore
      }
    }
  };

  if (audio.readyState >= 1) {
    applyTime();
  } else {
    audio.addEventListener("loadedmetadata", applyTime, { once: true });
  }

  // If user was playing before, try to resume playback.
  if (state.p === true) {
    const tryPlay = async () => {
      try {
        await audio.play();
      } catch {
        // Autoplay blocked: resume on first user gesture.
        const onFirstGesture = async () => {
          document.removeEventListener("click", onFirstGesture, true);
          document.removeEventListener("keydown", onFirstGesture, true);
          try {
            await audio.play();
          } catch {
            // ignore
          }
        };
        document.addEventListener("click", onFirstGesture, true);
        document.addEventListener("keydown", onFirstGesture, true);
      }
    };
    void tryPlay();
  }

  // Persist state continuously (lightweight, once per second).
  let lastSavedSec = -1;

  const tick = () => {
    const sec = Math.floor(audio.currentTime);
    if (sec !== lastSavedSec && isFiniteNumber(audio.currentTime)) {
      lastSavedSec = sec;
      writeState({ t: audio.currentTime });
    }
  };

  const intervalId = window.setInterval(tick, 1000);

  audio.addEventListener("play", () => writeState({ p: true }));
  audio.addEventListener("pause", () => writeState({ p: false }));
  audio.addEventListener("volumechange", () => writeState({ v: audio.volume }));

  window.addEventListener("beforeunload", () => {
    window.clearInterval(intervalId);
    if (isFiniteNumber(audio.currentTime)) {
      writeState({
        t: audio.currentTime,
        v: audio.volume,
        p: audio.paused === false,
      });
    }
  });
}

initMusicPersist();
