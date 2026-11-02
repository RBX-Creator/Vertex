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

// Das Schwarze-Loch-Logo groß in der Mitte (dreht sich, leuchtet, Akkretionsscheibe dahinter)
function holeCenter(ms) {
  const svg = document.querySelector('.topbar .brand svg, .brand svg');
  if (!svg) return;
  const box = document.createElement('div');
  box.className = 'fx-hole-center';
  box.innerHTML = `<span class="fx-disk"></span><span class="fx-core"></span>${svg.outerHTML}`;
  document.body.append(box);
  setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 600); }, ms - 600);
}
function warp() { // Sprung durch die Galaxie – die Sterne kommen aus dem Schwarzen Loch in der Mitte
  holeCenter(3600);
  const L = canvasLayer(3600);
  const stars = Array.from({ length: 260 }, () => ({ x: (Math.random() - 0.5) * W(), y: (Math.random() - 0.5) * H(), z: Math.random() * W() }));
  loop(L, () => {
    const { ctx } = L;
    ctx.fillStyle = 'rgba(5,6,20,.35)';
    ctx.fillRect(0, 0, W(), H());
    for (const s of stars) {
      const pz = s.z;
      s.z -= 18;
      if (s.z < 1) { s.z = W(); s.x = (Math.random() - 0.5) * W(); s.y = (Math.random() - 0.5) * H(); continue; }
      const k = 220 / s.z, pk = 220 / pz;
      ctx.strokeStyle = `hsla(${200 + (s.x % 60)}, 90%, ${60 + 30 * (1 - s.z / W())}%, .9)`;
      ctx.lineWidth = Math.max(0.6, 2.2 * (1 - s.z / W()));
      ctx.beginPath();
      ctx.moveTo(W() / 2 + s.x * pk, H() / 2 + s.y * pk);
      ctx.lineTo(W() / 2 + s.x * k, H() / 2 + s.y * k);
      ctx.stroke();
    }
  });
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
