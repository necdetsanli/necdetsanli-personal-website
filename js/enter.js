(() => {
  /**
   * Matrix rain effect + safe navigation.
   * No external deps. Works on static GitHub Pages.
   */

  const canvas = document.getElementById("matrix");
  const cancelLink = document.getElementById("cancelLink");

  if (!(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;

  /** @type {number} */
  let w = 0;
  /** @type {number} */
  let h = 0;

  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$%&*+-<>?/\\|=()[]{}";

  /** @type {number[]} */
  let drops = [];
  const fontSize = 16;

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * window.devicePixelRatio);
    canvas.height = Math.floor(h * window.devicePixelRatio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(
      window.devicePixelRatio,
      0,
      0,
      window.devicePixelRatio,
      0,
      0
    );

    const cols = Math.max(1, Math.floor(w / fontSize));
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * 50));
  };

  const draw = () => {
    // background fade
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, w, h);

    ctx.font = `${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = "rgba(0, 255, 102, 0.85)";

    for (let i = 0; i < drops.length; i += 1) {
      const text = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      ctx.fillText(text, x, y);

      if (y > h && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  };

  const navigateHome = () => {
    window.location.assign("./home.html");
  };

  const gifLink = document.querySelector(".gif-link");
  if (gifLink instanceof HTMLAnchorElement) {
    gifLink.addEventListener("click", (e) => {
      e.preventDefault();
      navigateHome();
    });
  }

  if (cancelLink instanceof HTMLAnchorElement) {
    cancelLink.addEventListener("click", (e) => {
      e.preventDefault();
      navigateHome();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") navigateHome();
  });

  window.addEventListener("resize", resize);

  resize();

  if (prefersReducedMotion !== true) {
    window.setInterval(draw, 40);
  }
})();
