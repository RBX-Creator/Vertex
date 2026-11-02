// Effekte für VAIs: lebendiges Logo, Himmel je nach Tageszeit, 3D-Karten (Beta) und geheime Befehle.
// Alles respektiert „Bewegung reduzieren“ und lässt sich in den Einstellungen abschalten.
const quiet = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pref = (key, def = true) => { try { const v = localStorage.getItem(key); return v === null ? def : v === 'on'; } catch { return def; } };
const setPref = (key, on) => { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* egal */ } };

export const fxPrefs = {
  logo: () => pref('vais.fxlogo', true),
  sky: () => pref('vais.sky', true),
  tilt: () => pref('vais.tilt', false),
  set: (name, on) => { setPref({ logo: 'vais.fxlogo', sky: 'vais.sky', tilt: 'vais.tilt' }[name], on); applyFx(); },
};

// ── Lebendiges Schwarzes Loch ───────────────────────────────────────
export function setBusy(busy) { document.body.classList.toggle('ai-busy', !!busy); }
// Beim Senden: ein leuchtender Punkt fliegt vom Senden-Knopf ins Logo, das Logo „schluckt“ ihn
export function sendOrb(from) {
  if (!fxPrefs.logo() || quiet() || !from) return;
  const logo = document.querySelector('.topbar .brand svg');
  if (!logo) return;
  const a = from.getBoundingClientRect();
  const b = logo.getBoundingClientRect();
  const orb = document.createElement('div');
  orb.className = 'fx-orb';
  orb.style.left = `${a.left + a.width / 2 - 7}px`;
  orb.style.top = `${a.top + a.height / 2 - 7}px`;
  document.body.append(orb);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = orb.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.35}px) scale(1.25)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0.2 },
  ], { duration: 650, easing: 'cubic-bezier(.5,0,.75,0)' });
  anim.onfinish = () => {
    orb.remove();
    logo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
}

// ── Himmel je nach Tageszeit ────────────────────────────────────────
function paintSky() {
  const h = new Date().getHours();
  const sky = h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
  document.body.dataset.sky = fxPrefs.sky() ? sky : '';
}

// ── 3D-Karten (Beta): Antworten kippen leicht, wenn man das Handy bewegt ──
let tiltOn = false;
function onOrient(e) {
  const x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 30));
  const y = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 30));
  document.documentElement.style.setProperty('--tilt-x', (y * -5).toFixed(2));
  document.documentElement.style.setProperty('--tilt-y', (x * 6).toFixed(2));
}
function onMouse(e) {
  const x = (e.clientX / innerWidth) * 2 - 1;
  const y = (e.clientY / innerHeight) * 2 - 1;
  document.documentElement.style.setProperty('--tilt-x', (y * -3).toFixed(2));
  document.documentElement.style.setProperty('--tilt-y', (x * 4).toFixed(2));
}
// iPhone fragt beim ersten Einschalten nach Erlaubnis (muss aus einem Tipp heraus passieren)
export async function enableTilt() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false; } catch { return false; }
  }
  fxPrefs.set('tilt', true);
  return true;
}
function applyTilt() {
  const want = fxPrefs.tilt() && !quiet();
  document.body.classList.toggle('tilt3d', want);
  if (want === tiltOn) return;
  tiltOn = want;
  if (want) { addEventListener('deviceorientation', onOrient); addEventListener('mousemove', onMouse, { passive: true }); }
  else { removeEventListener('deviceorientation', onOrient); removeEventListener('mousemove', onMouse); }
}

export function applyFx() {
  document.body.classList.toggle('fx-logo', fxPrefs.logo() && !quiet());
  paintSky();
  applyTilt();
}
setInterval(paintSky, 10 * 60 * 1000);

// ── Geheime Befehle (Easter Eggs) ───────────────────────────────────
function canvasLayer(ms) {
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  document.body.append(c);
  const ctx = c.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const end = performance.now() + ms;
  return { c, ctx, end, done: () => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).onfinish = () => c.remove() };
}
function loop(layer, draw) {
  const frame = (now) => {
    if (now > layer.end) return layer.done();
    draw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
const W = () => innerWidth;
const H = () => innerHeight;

// Rückmeldung per Vibration (die App reicht ihre Haptik-Funktion herein)
let buzz = () => {};
export const setHaptic = (fn) => { buzz = fn || (() => {}); };

// Das Schwarze-Loch-Logo groß in der Mitte (dreht sich, leuchtet, Akkretionsscheibe dahinter)
function holeCenter(ms) {
  const svg = document.querySelector('.topbar .brand svg, .brand svg');
  if (!svg) return null;
  const box = document.createElement('div');
  box.className = 'fx-hole-center';
  box.innerHTML = `<span class="fx-disk"></span><span class="fx-core"></span>${svg.outerHTML}`;
  document.body.append(box);
  setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 600); }, ms);
  return box;
}

// /galaxie – ein kleiner Film in 4 Akten (ca. 6,5 s):
// 1. Erscheinen: Dunkelheit, Sterne, das Schwarze Loch wächst mit glühender Scheibe
// 2. Sog: Sterne spiralen hinein, die App wird eingesaugt
// 3. Hyper-Sprung: Lichtblitz, Sterne schießen mit Lichtgeschwindigkeit heraus, Bildschirm bebt
// 4. Ankunft: bunte Nebel, Sternschnuppe, „VAIs Galaxie“ – dann ist alles wieder da
function warp() {
  const TOTAL = 6600;
  const P1 = 1200, P2 = 2700, P3 = 4700;
  const hole = holeCenter(P2 + 150);
  const L = canvasLayer(TOTAL);
  const cx = () => W() / 2, cy = () => H() / 2;
  const R = Math.hypot(W(), H()) / 2;
  const sky = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, r: 40 + Math.random() * R, s: Math.random() * 1.6 + 0.4, tw: Math.random() * 6, hue: 200 + Math.random() * 100 }));
  const disk = Array.from({ length: 180 }, () => ({ a: Math.random() * Math.PI * 2, r: 0, base: 38 + Math.random() * 70, sp: 0.02 + Math.random() * 0.03 }));
  const jump = Array.from({ length: 320 }, () => ({ x: (Math.random() - 0.5) * W(), y: (Math.random() - 0.5) * H(), z: Math.random() * W() }));
  const nebula = [
    { x: 0.25, y: 0.3, r: 0.55, c: '139,124,255' }, { x: 0.75, y: 0.65, r: 0.6, c: '61,214,198' },
    { x: 0.6, y: 0.2, r: 0.45, c: '255,94,126' }, { x: 0.3, y: 0.8, r: 0.5, c: '255,211,110' },
  ];
  let flashed = false, pulled = false, said = false;
  const start = performance.now();
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  buzz('tap');
  loop(L, (now) => {
    const t = now - start;
    const { ctx } = L;
    ctx.save();
    // Akt 3: Bildschirm bebt
    if (t > P2 && t < P2 + 900) { const k = (1 - (t - P2) / 900) * 6; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    if (t < P2) {
      // Akt 1 + 2: Hintergrund wird dunkel
      ctx.fillStyle = `rgba(4,5,16,${0.18 + 0.6 * ease(t / P1)})`;
      ctx.fillRect(-10, -10, W() + 20, H() + 20);
      const pull = t < P1 ? 0 : ease((t - P1) / (P2 - P1));
      if (pull > 0 && !pulled) { pulled = true; document.body.classList.add('fx-pull'); buzz('tap'); }
      for (const st of sky) {
        const pr = st.r;
        if (pull > 0) { st.r *= 1 - 0.012 - pull * 0.05; st.a += (0.6 / Math.max(st.r, 20)) * (1 + pull * 5); }
        if (st.r < 22) { st.r = R * (0.7 + Math.random() * 0.3); st.a = Math.random() * Math.PI * 2; continue; }
        const x = cx() + Math.cos(st.a) * st.r, y = cy() + Math.sin(st.a) * st.r;
        const alpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 400 + st.tw));
        ctx.strokeStyle = ctx.fillStyle = `hsla(${st.hue},90%,${75 + pull * 20}%,${alpha})`;
        if (pull > 0.05) {
          ctx.lineWidth = st.s;
          ctx.beginPath();
          ctx.moveTo(cx() + Math.cos(st.a - 0.08) * pr, cy() + Math.sin(st.a - 0.08) * pr);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else { ctx.beginPath(); ctx.arc(x, y, st.s, 0, Math.PI * 2); ctx.fill(); }
      }
      // glühende Akkretionsscheibe (flache Ellipse, innen heiß)
      const grow = ease(t / P1);
      for (const d of disk) {
        d.a += d.sp * (1 + pull * 4);
        d.r = d.base * grow * (1 - pull * 0.55);
        const x = cx() + Math.cos(d.a) * d.r * 1.9, y = cy() + Math.sin(d.a) * d.r * 0.42;
        const hot = 1 - (d.base - 38) / 70;
        ctx.fillStyle = `hsla(${30 + (1 - hot) * 230},100%,${55 + hot * 35}%,${0.55 * grow})`;
        ctx.beginPath(); ctx.arc(x, y, 1.6 + hot * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // Gravitationslinse: Leuchtring um das Loch
      const g = ctx.createRadialGradient(cx(), cy(), 20 * grow, cx(), cy(), 120 * grow + 1);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, `rgba(139,124,255,${0.18 * grow})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W(), H());
    } else if (t < P3) {
      // Akt 3: Lichtblitz + Hyper-Sprung
      if (!flashed) { flashed = true; document.body.classList.remove('fx-pull'); buzz('success'); }
      const k = (t - P2) / (P3 - P2);
      ctx.fillStyle = `rgba(4,5,16,${0.28 + k * 0.2})`;
      ctx.fillRect(-10, -10, W() + 20, H() + 20);
      const speed = 10 + 46 * Math.sin(Math.min(1, k * 1.25) * Math.PI / 2) * (k < 0.85 ? 1 : (1 - k) / 0.15 + 0.15);
      for (const s of jump) {
        const pz = s.z;
        s.z -= speed;
        if (s.z < 1) { s.z = W(); s.x = (Math.random() - 0.5) * W(); s.y = (Math.random() - 0.5) * H(); continue; }
        const kk = 240 / s.z, pk = 240 / pz;
        ctx.strokeStyle = `hsla(${190 + k * 120 + (s.x % 40)},95%,${62 + 30 * (1 - s.z / W())}%,.95)`;
        ctx.lineWidth = Math.max(0.6, 2.6 * (1 - s.z / W()));
        ctx.beginPath(); ctx.moveTo(cx() + s.x * pk, cy() + s.y * pk); ctx.lineTo(cx() + s.x * kk, cy() + s.y * kk); ctx.stroke();
      }
      const fl = Math.max(0, 1 - (t - P2) / 450);
      if (fl > 0) {
        const g = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), R * (0.4 + (1 - fl)));
        g.addColorStop(0, `rgba(255,255,255,${fl})`); g.addColorStop(0.4, `rgba(190,180,255,${fl * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W(), H());
      }
    } else {
      // Akt 4: Ankunft in der Galaxie – Nebel, langsame Sterne, Sternschnuppe, Schriftzug
      const k = (t - P3) / (TOTAL - P3);
      ctx.fillStyle = 'rgba(4,5,16,.32)';
      ctx.fillRect(-10, -10, W() + 20, H() + 20);
      const vis = Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - Math.max(0, (k - 0.75) / 0.25));
      for (const n of nebula) {
        const g = ctx.createRadialGradient(n.x * W(), n.y * H(), 0, n.x * W(), n.y * H(), n.r * Math.max(W(), H()));
        g.addColorStop(0, `rgba(${n.c},${0.22 * vis})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W(), H());
      }
      for (const s of jump.slice(0, 180)) {
        s.z -= 2;
        if (s.z < 1) s.z = W();
        const kk = 240 / s.z;
        ctx.fillStyle = `rgba(255,255,255,${0.8 * vis})`;
        ctx.beginPath(); ctx.arc(cx() + s.x * kk, cy() + s.y * kk, Math.max(0.5, 1.8 * (1 - s.z / W())), 0, Math.PI * 2); ctx.fill();
      }
      const sx = W() * (1.1 - k * 1.4), sy = H() * (0.15 + k * 0.35);
      const tail = ctx.createLinearGradient(sx, sy, sx + 140, sy - 60);
      tail.addColorStop(0, `rgba(255,255,255,${vis})`); tail.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 140, sy - 60); ctx.stroke();
      if (!said) { said = true; title(TOTAL - P3); }
    }
    ctx.restore();
  });
  setTimeout(() => document.body.classList.remove('fx-pull'), TOTAL);
  return hole;
}
// Schriftzug am Ende
function title(ms) {
  const el = document.createElement('div');
  el.className = 'fx-title';
  el.innerHTML = '<b>VAIs Galaxie</b><span>✦ willkommen im All ✦</span>';
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}
function confetti() {
  const L = canvasLayer(3800);
  const colors = ['#ff5e7e', '#ffd36e', '#4fd1e8', '#7ddc8b', '#8b7cff', '#ff9f43'];
  const bits = Array.from({ length: 170 }, () => ({ x: W() / 2, y: H() * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * colors.length)] }));
  loop(L, () => {
    const { ctx } = L;
    ctx.clearRect(0, 0, W(), H());
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore();
    }
  });
}
function matrix() {
  const L = canvasLayer(5200);
  const size = 16;
  const cols = Math.ceil(W() / size);
  const drops = Array.from({ length: cols }, () => Math.random() * -40);
  const chars = 'アカサタナハマヤラワ0123456789VAIS';
  loop(L, () => {
    const { ctx } = L;
    ctx.fillStyle = 'rgba(0,10,0,.12)';
    ctx.fillRect(0, 0, W(), H());
    ctx.font = `${size}px monospace`;
    drops.forEach((d, i) => {
      ctx.fillStyle = Math.random() < 0.05 ? '#d6ffd6' : '#2bff6a';
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * size, d * size);
      drops[i] = d * size > H() && Math.random() > 0.97 ? 0 : d + 0.6;
    });
  });
}
function snow() {
  const L = canvasLayer(6500);
  const flakes = Array.from({ length: 140 }, () => ({ x: Math.random() * W(), y: Math.random() * -H(), r: Math.random() * 3 + 1, v: Math.random() * 1.2 + 0.6, w: Math.random() * 2 }));
  loop(L, (now) => {
    const { ctx } = L;
    ctx.clearRect(0, 0, W(), H());
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const f of flakes) {
      f.y += f.v; f.x += Math.sin(now / 900 + f.w) * 0.6;
      if (f.y > H()) { f.y = -5; f.x = Math.random() * W(); }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  });
}
function classFx(cls, ms) {
  document.body.classList.add(cls);
  setTimeout(() => document.body.classList.remove(cls), ms);
}
const EGGS = {
  galaxie: warp, galaxy: warp, warp,
  konfetti: confetti, confetti, party: confetti,
  matrix,
  schnee: snow, snow,
  disco: () => classFx('fx-disco', 6000),
  schwarzesloch: () => classFx('fx-hole', 2600), blackhole: () => classFx('fx-hole', 2600),
  kopfstand: () => classFx('fx-flip', 3000), flip: () => classFx('fx-flip', 3000),
};
export const EGG_NAMES = Object.keys(EGGS);
// „/galaxie“ usw. → Effekt abspielen (true = war ein geheimer Befehl)
export function runEgg(text) {
  const m = String(text).trim().toLowerCase().match(/^\/([a-zäöü]+)$/);
  if (!m || !EGGS[m[1]]) return false;
  if (quiet()) { confettiLite(); return true; }
  EGGS[m[1]]();
  return true;
}
function confettiLite() { classFx('fx-glow', 1200); }

// Logo 7× schnell antippen → Schwarzes Loch
let taps = [];
export function logoTap() {
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 2500), now];
  if (taps.length >= 7) { taps = []; classFx('fx-hole', 2600); return true; }
  return false;
}
