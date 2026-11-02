// Sichere Code-Ausführung für Agent X: JavaScript in einem eigenen Thread mit Speicher- und Zeitlimit,
// in einem leeren Kontext ohne require, process, Netzwerk oder Dateien; eval/new Function sind gesperrt.
// Zwischen Sandbox und Server gehen nur Texte hin und her (keine Funktionen/Objekte des Servers).
import { Worker } from 'node:worker_threads';

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
let out;
try {
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(\`
    var __out = [];
    var __fmt = function (x) {
      if (typeof x === 'string') return x;
      try { var s = JSON.stringify(x); return s === undefined ? String(x) : s; } catch (e) { return String(x); }
    };
    var console = { log: function () { if (__out.length < 400) __out.push(Array.prototype.map.call(arguments, __fmt).join(' ')); } };
    console.info = console.warn = console.error = console.log;
  \`, ctx, { timeout: 500 });
  const result = vm.runInContext('(function () { "use strict";\\n' + workerData.code + '\\n})()', ctx, { timeout: workerData.ms, displayErrors: false });
  ctx.__result = undefined;
  out = vm.runInContext('JSON.stringify({ out: __out.join("\\\\n") })', ctx, { timeout: 500 });
  out = JSON.parse(out);
  out.result = result === undefined ? null : (typeof result === 'object' ? (() => { try { return JSON.stringify(result); } catch (e) { return String(result); } })() : String(result));
} catch (err) {
  out = { error: String(err && err.message || err).slice(0, 500) };
}
parentPort.postMessage(JSON.stringify(out));
`;

let busy = Promise.resolve(); // immer nur eine Ausführung gleichzeitig (schont den Speicher)

export function runJavaScript(code, { ms = 2000 } = {}) {
  const src = String(code ?? '').slice(0, 20_000);
  const job = busy.then(() => new Promise((resolve) => {
    if (!src.trim()) return resolve({ error: 'Kein Code.' });
    const worker = new Worker(WORKER, { eval: true, workerData: { code: src, ms }, resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 12, stackSizeMb: 4 }, env: {}, stdout: true, stderr: true });
    const timer = setTimeout(() => { worker.terminate(); resolve({ error: `Zeitlimit (${ms / 1000} s) überschritten.` }); }, ms + 1500);
    worker.once('message', (msg) => { clearTimeout(timer); worker.terminate(); try { resolve(JSON.parse(msg)); } catch { resolve({ error: 'Ungültige Ausgabe.' }); } });
    worker.once('error', (err) => { clearTimeout(timer); resolve({ error: String(err.message).slice(0, 300) }); });
    worker.once('exit', (codeNo) => { clearTimeout(timer); if (codeNo !== 0) resolve({ error: 'Abgebrochen (zu viel Speicher oder Zeit).' }); });
  }));
  busy = job.catch(() => {});
  return job;
}

// Für das Modell als Text
export async function runJavaScriptText(code) {
  const r = await runJavaScript(code);
  if (r.error) return `Fehler: ${r.error}${r.out ? `\nAusgabe bis dahin:\n${r.out}` : ''}`;
  return [r.out ? `Ausgabe:\n${String(r.out).slice(0, 6000)}` : 'Keine Ausgabe (console.log benutzen).', r.result !== null && r.result !== undefined ? `Rückgabewert: ${String(r.result).slice(0, 2000)}` : ''].filter(Boolean).join('\n');
}
