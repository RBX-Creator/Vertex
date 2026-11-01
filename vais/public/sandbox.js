// Abgeschirmte Vorschau für von KI erstellte Webseiten.
// Läuft in einem iframe ohne Zugriff auf VAIs (kein Cookie, kein Login, eigener Ursprung).
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.type !== 'vais-render') return;
  document.open();
  document.write(String(event.data.html ?? ''));
  document.close();
});
window.parent.postMessage({ type: 'vais-sandbox-ready' }, '*');
