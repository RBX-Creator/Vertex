// Der orange Orb. Zustände: idle | listening | thinking | speaking.
// Orb.setLevel(0..1) lässt ihn auf Mikrofon- oder Sprachpegel reagieren.
(function () {
  const canvas = document.getElementById("orb");
  const ctx = canvas.getContext("2d");
  const hit = document.getElementById("orbHit");

  const STATE = {
    idle: { energy: 0.15, speed: 0.35, glow: 0.55 },
    listening: { energy: 0.45, speed: 0.6, glow: 0.8 },
    thinking: { energy: 0.35, speed: 1.8, glow: 0.7 },
    speaking: { energy: 0.6, speed: 0.9, glow: 0.95 },
  };

  let state = "idle";
  let target = STATE.idle;
  const cur = { ...STATE.idle };
  let level = 0; // geglätteter Pegel
  let levelTarget = 0;
  let t = 0;
  let dpr = 1;

  // Plasma-Flecken im Inneren
  const blobs = Array.from({ length: 7 }, (_, i) => ({
    a: (i / 7) * Math.PI * 2,
    r: 0.25 + Math.random() * 0.35,
    s: 0.6 + Math.random() * 0.9,
    size: 0.35 + Math.random() * 0.3,
    hue: 18 + Math.random() * 22,
  }));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  addEventListener("resize", resize);
  resize();

  function geometry() {
    const r = hit.getBoundingClientRect();
    if (!r.width) {
      // Orb-Schaltfläche unsichtbar (z. B. Anmeldung): mittig im oberen Bereich zeichnen
      const R = Math.min(canvas.width, canvas.height) * 0.2;
      return { x: canvas.width / 2, y: canvas.height * 0.33, R };
    }
    return { x: (r.left + r.width / 2) * dpr, y: (r.top + r.height / 2) * dpr, R: (r.width / 2) * dpr * 0.78 };
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;
    for (const k in cur) cur[k] += (target[k] - cur[k]) * Math.min(1, dt * 4);
    level += (levelTarget - level) * Math.min(1, dt * 14);
    levelTarget *= Math.pow(0.02, dt); // fällt ab, wenn keine neuen Werte kommen
    t += dt * cur.speed;

    const { x, y, R: baseR } = geometry();
    const pulse = 1 + Math.sin(t * 2.2) * 0.025 + level * 0.16;
    const R = baseR * pulse;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Äußeres Glühen
    const glow = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * (2.4 + level));
    glow.addColorStop(0, `rgba(255,110,20,${0.32 * cur.glow + level * 0.2})`);
    glow.addColorStop(0.4, `rgba(255,80,0,${0.1 * cur.glow})`);
    glow.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Kugel
    ctx.save();
    ctx.beginPath();
    const wobble = (cur.energy + level) * 0.045;
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const n = Math.sin(a * 3 + t * 2.1) * 0.5 + Math.sin(a * 5 - t * 1.4) * 0.35 + Math.sin(a * 7 + t * 3.3) * 0.15;
      const rr = R * (1 + n * wobble);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const body = ctx.createRadialGradient(x - R * 0.25, y - R * 0.3, R * 0.05, x, y, R);
    body.addColorStop(0, "#ffd3a1");
    body.addColorStop(0.25, "#ff9a3c");
    body.addColorStop(0.65, "#ff6a00");
    body.addColorStop(1, "#8a2a00");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();

    // Plasma
    ctx.globalCompositeOperation = "lighter";
    for (const b of blobs) {
      const a = b.a + t * b.s * (state === "thinking" ? 1.6 : 1);
      const bx = x + Math.cos(a) * R * b.r * (1 + level * 0.4);
      const by = y + Math.sin(a * 1.3) * R * b.r;
      const br = R * b.size * (0.8 + cur.energy * 0.6 + level * 0.5);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `hsla(${b.hue},100%,${62 + level * 18}%,${0.28 + cur.energy * 0.25})`);
      g.addColorStop(1, "hsla(20,100%,50%,0)");
      ctx.fillStyle = g;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    ctx.restore();

    // Ring beim Zuhören / Denken
    if (state === "listening" || state === "thinking") {
      ctx.save();
      ctx.strokeStyle = `rgba(255,150,70,${state === "listening" ? 0.35 + level * 0.5 : 0.45})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      if (state === "thinking") {
        const s = t * 2.5;
        ctx.arc(x, y, R * 1.18, s, s + Math.PI * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, R * 1.18, s + Math.PI, s + Math.PI * 1.6);
      } else {
        ctx.arc(x, y, R * (1.15 + level * 0.12), 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.Orb = {
    setState(s) {
      if (!STATE[s]) return;
      state = s;
      target = STATE[s];
    },
    get state() {
      return state;
    },
    setLevel(v) {
      levelTarget = Math.max(levelTarget, Math.min(1, v));
    },
  };
})();
