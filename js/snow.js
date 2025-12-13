/**
 * Lightweight “2000s-style” snowfall overlay (snowflake crystals).
 * Respects prefers-reduced-motion, handles DPR, and resizes safely.
 */
(() => {
  const reduceMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const shouldReduceMotion = reduceMotionMq.matches === true;

  if (shouldReduceMotion === true) {
    return;
  }

  /** @type {HTMLCanvasElement} */
  const canvas = document.createElement("canvas");
  canvas.id = "snow-canvas";
  document.body.appendChild(canvas);

  /** @type {CanvasRenderingContext2D | null} */
  const ctx = canvas.getContext("2d", { alpha: true });

  if (ctx === null) {
    return;
  }

  const state = {
    dpr: 1,
    w: 0,
    h: 0,
    flakes:
      /** @type {Array<{x:number,y:number,r:number,v:number,dx:number,op:number,tw:number,tws:number,rot:number,rotv:number}>} */ ([]),
    lastTs: 0,
  };

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * @returns {number}
   */
  function pickFlakeCount() {
    const area = window.innerWidth * window.innerHeight;
    const base = Math.floor(area / 22000);
    return Math.max(40, Math.min(140, base));
  }

  /**
   * Draws a simple 6-arm snow crystal at (0,0) in local space.
   * @param {CanvasRenderingContext2D} c
   * @param {number} size
   */
  function drawCrystal(c, size) {
    const armLen = size;
    const b1 = armLen * 0.55;
    const b2 = armLen * 0.8;
    const br = armLen * 0.35;
    const br2 = br * 0.7;

    c.beginPath();

    for (let a = 0; a < 6; a += 1) {
      // main arm (upwards)
      c.moveTo(0, 0);
      c.lineTo(0, -armLen);

      // branches
      c.moveTo(0, -b1);
      c.lineTo(-br, -b1 - br * 0.3);
      c.moveTo(0, -b1);
      c.lineTo(br, -b1 - br * 0.3);

      c.moveTo(0, -b2);
      c.lineTo(-br2, -b2 - br2 * 0.35);
      c.moveTo(0, -b2);
      c.lineTo(br2, -b2 - br2 * 0.35);

      // rotate for next arm
      c.rotate(Math.PI / 3);
    }

    c.stroke();
  }

  function resize() {
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    state.w = Math.floor(window.innerWidth);
    state.h = Math.floor(window.innerHeight);

    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const target = pickFlakeCount();
    const current = state.flakes.length;

    if (current < target) {
      for (let i = 0; i < target - current; i += 1) {
        state.flakes.push({
          x: rand(0, state.w),
          y: rand(-state.h, state.h),

          // Flake size (bigger)
          r: rand(3.0, 7.0),

          v: rand(30, 85),
          dx: rand(-10, 10),
          op: rand(0.4, 0.95),

          // twinkle
          tw: rand(0, Math.PI * 2),
          tws: rand(1.5, 4.0),

          // rotation (slow)
          rot: rand(0, Math.PI * 2),
          rotv: rand(-0.6, 0.6),
        });
      }
    } else if (current > target) {
      state.flakes.length = target;
    }
  }

  /**
   * @param {number} dtSec
   */
  function step(dtSec) {
    ctx.clearRect(0, 0, state.w, state.h);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < state.flakes.length; i += 1) {
      const f = state.flakes[i];

      f.y += f.v * dtSec;
      f.x += f.dx * dtSec;

      // wrap
      if (f.y > state.h + 12) {
        f.y = -12;
        f.x = rand(0, state.w);
      }
      if (f.x < -12) {
        f.x = state.w + 12;
      }
      if (f.x > state.w + 12) {
        f.x = -12;
      }

      // twinkle
      f.tw += f.tws * dtSec;
      const twinkle = (Math.sin(f.tw) + 1) / 2; // 0..1
      const alpha = Math.max(0.12, Math.min(1, f.op * (0.60 + 0.70 * twinkle)));

      // subtle size pulse
      const size = f.r * (0.90 + 0.30 * twinkle);

      // rotate slowly
      f.rot += f.rotv * dtSec;

      // line width scales with size
      const lw = Math.max(1, Math.round(size * 0.22));
      const outline = Math.max(1, lw + 1);

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);

      // dark outline first (helps on white panels)
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = outline;
      drawCrystal(ctx, size);

      // white body on top
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#EAF6FF";
      ctx.lineWidth = lw;
      drawCrystal(ctx, size);

      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  /**
   * @param {number} ts
   */
  function loop(ts) {
    if (state.lastTs === 0) {
      state.lastTs = ts;
    }

    const deltaMs = ts - state.lastTs;
    if (deltaMs >= 33) {
      const dtSec = Math.min(0.05, deltaMs / 1000);
      state.lastTs = ts;
      step(dtSec);
    }

    window.requestAnimationFrame(loop);
  }

  window.addEventListener("resize", () => {
    resize();
  });

  resize();
  window.requestAnimationFrame(loop);
})();
