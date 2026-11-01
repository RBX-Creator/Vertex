// „Was ist neu?“ – die neuesten Änderungen zuerst. Neue Einträge oben anfügen (id hochzählen).
import { t } from './i18n.js';

export const CHANGES = () => [
  {
    id: 10, date: '2026-11-01',
    items: [
      ['🗣️', t('Natürliche Stimme', 'Natural voice'), t('VAIs spricht jetzt mit einer natürlichen Online-Stimme – auch auf dem iPhone mit Ton. In den Einstellungen unter „Vorlesen“ kannst du die Stimme wählen.', 'VAIs now speaks with a natural online voice – with sound on iPhone too. Pick the voice in Settings under “Read aloud”.')],
    ],
  },
  {
    id: 9, date: '2026-11-01',
    items: [
      ['🎙️', t('Sprach-Modus repariert', 'Voice mode fixed'), t('Funktioniert jetzt auch auf dem iPhone: Der Kreis zeigt, dass du gehört wirst – antippen, wenn du fertig bist.', 'Now works on iPhone too: the circle shows you are being heard – tap it when you are done.')],
      ['🔊', t('Antworten mit Ton und schneller', 'Answers with sound, and faster'), t('Im Sprach-Modus liest VAIs schon den ersten Satz vor, während der Rest noch geschrieben wird.', 'In voice mode, VAIs starts reading the first sentence while the rest is still being written.')],
      ['🗣️', t('Bessere Spracherkennung', 'Better speech recognition'), t('Mikrofon, Sprach-Modus und Übersetzer erkennen Sprache jetzt genauer.', 'Microphone, voice mode and translator now recognise speech more accurately.')],
    ],
  },
  {
    id: 7, date: '2026-11-01',
    items: [
      ['🕶️', t('Inkognito-Chats', 'Incognito chats'), t('Chats, die nicht gespeichert werden.', 'Chats that are not saved.')],
      ['🆕', t('„Was ist neu?“', '“What’s new?”'), t('Nach jedem Update siehst du hier die Neuerungen.', 'After every update you see what’s new here.')],
    ],
  },
  {
    id: 6, date: '2026-11-01',
    items: [
      ['⏳', t('Nachrichten vormerken', 'Queue messages'), t('Schreib weiter, während die KI antwortet – oder bring es Agent X direkt in die Arbeit.', 'Keep writing while the AI answers – or hand it to Agent X right away.')],
      ['✨', t('Nachricht verbessern', 'Improve message'), t('Ein Tipp auf ✨ macht deine Frage klarer.', 'One tap on ✨ makes your question clearer.')],
      ['↔️', t('Wischbare Tabellen', 'Swipeable tables'), t('Breite Tabellen lassen sich auf dem Handy nach links und rechts wischen.', 'Wide tables can be swiped left and right on your phone.')],
    ],
  },
  {
    id: 5, date: '2026-11-01',
    items: [
      ['🛡️', t('Jugendschutz', 'Youth protection'), t('Gefährliche Anfragen werden freundlich abgelehnt.', 'Harmful requests are politely declined.')],
      ['🌍', t('6 Sprachen', '6 languages'), t('Neu: Türkçe, Español, Français, Українська.', 'New: Türkçe, Español, Français, Українська.')],
      ['🗺️', t('Plan zuerst', 'Plan first'), t('Agent X zeigt bei großen Aufgaben erst einen Plan.', 'Agent X shows a plan first for big tasks.')],
      ['📷', t('Kamera & QR-Codes', 'Camera & QR codes'), t('Fotos direkt aufnehmen, Links per QR-Code teilen.', 'Take photos directly, share links via QR code.')],
    ],
  },
  {
    id: 4, date: '2026-11-01',
    items: [
      ['🌐', t('Webseiten veröffentlichen', 'Publish websites'), t('Seiten von Agent X bekommen einen eigenen Link.', 'Pages by Agent X get their own link.')],
      ['🔔', t('Agent X meldet sich', 'Agent X notifies you'), t('Er arbeitet weiter, auch wenn die App zu ist.', 'He keeps working even when the app is closed.')],
      ['🗣️', t('Live-Übersetzer', 'Live translator'), t('Zwei Sprachen, sprechen oder tippen.', 'Two languages, speak or type.')],
    ],
  },
];
export const LATEST = () => CHANGES()[0].id;
