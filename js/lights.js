/**
 * Creates a “Christmas lights” frame around .col-main and adapts to its size.
 * Uses ResizeObserver to re-render when the panel changes size.
 */
(() => {
  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * @param {number} i
   * @returns {string}
   */
  function pickColorClass(i) {
    const colors = ["is-red", "is-green", "is-blue", "is-yellow", "is-pink"];
    return colors[i % colors.length];
  }

  /**
   * @param {number} i
   * @returns {string}
   */
  function pickDelay(i) {
    const ms = (i * 110) % 900;
    return `${ms}ms`;
  }

  /**
   * @param {number} i
   * @returns {string}
   */
  function pickDrop(i) {
    const drop = Math.round(Math.sin(i / 2.2) * 6);
    return `${drop}px`;
  }

  /** @type {HTMLElement | null} */
  const panel = document.querySelector(".col-main");
  if (panel === null) {
    return;
  }

  /** @type {HTMLDivElement} */
  const frame = document.createElement("div");
  frame.id = "xmas-frame";
  frame.setAttribute("aria-hidden", "true");

  /**
   * @param {"top"|"right"|"bottom"|"left"} side
   * @param {number} count
   */
  function renderSide(side, count) {
    const s = document.createElement("div");
    s.className = `side ${side}`;

    for (let i = 0; i < count; i += 1) {
      const bulb = document.createElement("span");
      bulb.className = `bulb ${pickColorClass(i)}`;
      bulb.style.setProperty("--delay", pickDelay(i));
      bulb.style.setProperty("--drop", pickDrop(i));
      s.appendChild(bulb);
    }

    frame.appendChild(s);
  }

  function render() {
    const rect = panel.getBoundingClientRect();

    // spacing target for bulbs (px)
    const spacing = rect.width >= 900 ? 26 : 30;

    const topBottomCount = clamp(Math.floor(rect.width / spacing), 10, 48);
    const leftRightCount = clamp(Math.floor(rect.height / spacing), 10, 60);

    frame.innerHTML = "";
    renderSide("top", topBottomCount);
    renderSide("right", leftRightCount);
    renderSide("bottom", topBottomCount);
    renderSide("left", leftRightCount);
  }

  // Mount once
  panel.appendChild(frame);
  render();

  // Re-render on size changes
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      render();
    });
    ro.observe(panel);
  } else {
    // Fallback
    window.addEventListener("resize", () => {
      render();
    });
  }
})();
