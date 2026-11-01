// Führt Python-Code aus (Pyodide) – abgeschirmt: eigener Ursprung, in einem Web Worker,
// der nach einer Zeitgrenze hart beendet wird. Kein Zugriff auf VAIs, Cookies oder Login.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const WORKER = `
importScripts('${PYODIDE}pyodide.js');
let py = null;
async function boot() {
  if (!py) {
    py = await loadPyodide({ indexURL: '${PYODIDE}' });
  }
  return py;
}
self.onmessage = async (e) => {
  const { code } = e.data;
  const out = [];
  try {
    self.postMessage({ status: 'loading' });
    const p = await boot();
    p.setStdout({ batched: (s) => out.push(s) });
    p.setStderr({ batched: (s) => out.push(s) });
    self.postMessage({ status: 'packages' });
    await p.loadPackagesFromImports(code, { messageCallback: () => {}, errorCallback: () => {} });
    const usesPlot = /matplotlib|pyplot/.test(code);
    if (usesPlot) await p.runPythonAsync("import matplotlib\\nmatplotlib.use('Agg')");
    self.postMessage({ status: 'running' });
    let result = await p.runPythonAsync(code);
    const images = [];
    if (usesPlot) {
      const pngs = await p.runPythonAsync(\`
import io, base64
import matplotlib.pyplot as plt
_imgs = []
for _n in plt.get_fignums():
    _b = io.BytesIO()
    plt.figure(_n).savefig(_b, format='png', dpi=110, bbox_inches='tight')
    _imgs.append(base64.b64encode(_b.getvalue()).decode())
plt.close('all')
_imgs
\`);
      for (const b of pngs.toJs()) images.push('data:image/png;base64,' + b);
      pngs.destroy?.();
    }
    if (result !== undefined && result !== null) {
      const text = result.toString ? result.toString() : String(result);
      result.destroy?.();
      if (text && text !== 'None') out.push(text);
    }
    self.postMessage({ status: 'done', ok: true, output: out.join('\\n'), images });
  } catch (err) {
    self.postMessage({ status: 'done', ok: false, output: out.join('\\n'), error: String(err && err.message || err).split('\\n').slice(-12).join('\\n'), images: [] });
  }
};`;

const LIMIT = 30_000; // längstens 30 Sekunden pro Ausführung
let worker = null;
const newWorker = () => new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.type !== 'vais-py') return;
  const { id, code } = event.data;
  const reply = (msg) => window.parent.postMessage({ type: 'vais-py-result', id, ...msg }, '*');
  if (!worker) worker = newWorker();
  const w = worker;
  const timer = setTimeout(() => {
    w.terminate();
    if (worker === w) worker = null;
    reply({ status: 'done', ok: false, output: '', error: 'Abgebrochen: Der Code lief länger als 30 Sekunden.', images: [] });
  }, LIMIT);
  w.onmessage = (e) => {
    if (e.data.status === 'done') clearTimeout(timer);
    reply(e.data);
  };
  w.onerror = (e) => { clearTimeout(timer); reply({ status: 'done', ok: false, output: '', error: e.message || 'Python konnte nicht starten.', images: [] }); };
  w.postMessage({ code: String(code ?? '') });
});
window.parent.postMessage({ type: 'vais-py-ready' }, '*');
