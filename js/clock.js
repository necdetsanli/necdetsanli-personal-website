/**
 * Updates the "Local" and "GMT" clock inputs once per second.
 * Keeps the retro form UI but uses modern, safe JS (no string-eval timeouts).
 */
(() => {
  /** @type {HTMLInputElement | null} */
  const localEl = document.getElementById("clock-local");
  /** @type {HTMLInputElement | null} */
  const gmtEl = document.getElementById("clock-gmt");

  if (localEl === null || gmtEl === null) {
    return;
  }

  /**
   * Pads a number to 2 digits.
   * @param {number} n
   * @returns {string}
   */
  const pad2 = (n) => String(n).padStart(2, "0");

  /**
   * Formats local time as 12-hour clock with AM/PM.
   * @param {Date} d
   * @returns {string}
   */
  const formatLocal = (d) => {
    const hours24 = d.getHours();
    const hours12 = hours24 % 12 === 0 ? 12 : (hours24 % 12);
    const ampm = hours24 >= 12 ? "PM" : "AM";
    return `${hours12}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
  };

  const tick = () => {
    const now = new Date();
    localEl.value = formatLocal(now);
    gmtEl.value = now.toUTCString();
  };

  tick();
  window.setInterval(tick, 1000);
})();
