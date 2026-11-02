// Melden-Seite: Webseite (?site=ID) oder geteilten Chat (?chat=ID) an das VAIs-Team melden
import { t, translateDom } from './i18n.js';

translateDom?.(document);
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const kind = q.get('chat') ? 'share' : 'site';
const target = q.get('chat') || q.get('site') || '';

async function init() {
  try {
    const [info, reasons] = await Promise.all([
      fetch(`/api/report/target?kind=${kind}&id=${encodeURIComponent(target)}`).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Fehler'); return r.json(); }),
      fetch('/api/report/reasons').then((r) => r.json()),
    ]);
    $('#rp-target').textContent = kind === 'site' ? t(`Webseite: „${info.title}“`, `Website: “${info.title}”`) : t(`Geteilter Chat: „${info.title}“`, `Shared chat: “${info.title}”`);
    $('#rp-reasons').innerHTML = reasons.reasons.map((r, i) => `<label class="rp-reason"><input type="radio" name="reason" value="${r.id}"${i === 0 ? '' : ''}><span></span></label>`).join('');
    document.querySelectorAll('.rp-reason span').forEach((s, i) => { s.textContent = reasons.reasons[i].label; });
    $('#rp-form').hidden = false;
  } catch (err) {
    $('#rp-target').textContent = err.message;
  }
}

$('#rp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reason = document.querySelector('input[name="reason"]:checked')?.value;
  const msg = $('#rp-msg');
  if (!reason) { msg.textContent = t('Bitte wähle einen Grund.', 'Please choose a reason.'); return; }
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, target, reason, note: $('#rp-note').value }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || t('Das hat nicht geklappt.', 'That did not work.'));
    $('#rp-form').hidden = true;
    $('#rp-done').hidden = false;
  } catch (err) {
    msg.textContent = err.message;
    btn.disabled = false;
  }
});

init();
