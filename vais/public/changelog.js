// „Was ist neu?“ – die neuesten Änderungen zuerst. Neue Einträge oben anfügen (id hochzählen).
import { t } from './i18n.js';

export const CHANGES = () => [
  {
    id: 12, date: '2026-11-02',
    items: [
      ['📊', t('Tageslimit ohne Punkte', 'Daily limit without points'), t('Statt Punkten hast du jetzt pro Tag eine feste Anzahl Antworten, Websuchen, Bilder und Agent-X-Aufträge – jede Art mit eigenem Balken in deiner Statistik.', 'Instead of points you now get a fixed number of answers, web searches, images and Agent X tasks per day – each with its own bar in your stats.')],
    ],
  },
  {
    id: 11, date: '2026-11-01',
    items: [
      ['🏗️', t('Webseiten wie vom Profi', 'Websites like a pro'), t('Agent X fragt erst nach, was du willst (Antworten zum Antippen), und baut die Seite dann Schritt für Schritt: Entwurf, Design-System, jeder Abschnitt einzeln, Prüfung. Größer, schöner – und ohne erfundene Fake-Inhalte.', 'Agent X first asks what you want (tap to answer), then builds the site step by step: draft, design system, each section on its own, check. Bigger, nicer – and without made-up fake content.')],
      ['✏️', t('Gezielt ändern', 'Targeted changes'), t('Sag einfach, was anders sein soll – nur die betroffenen Teile werden neu geschrieben.', 'Just say what should change – only the affected parts are rewritten.')],
    ],
  },
  {
    id: 10, date: '2026-11-01',
    items: [
      ['📽️', t('Präsentationen mit Agent X', 'Presentations with Agent X'), t('Sag „Mach mir eine Präsentation über …“ – Agent X recherchiert und baut schöne Folien. Wischen zum Blättern, 📝 für Sprechernotizen, mit 🌐 als Link teilen.', 'Say “Make me a presentation about …” – Agent X researches and builds beautiful slides. Swipe to flip, 📝 for speaker notes, share as a link with 🌐.')],
    ],
  },
  {
    id: 9, date: '2026-11-01',
    items: [
      ['🗣️', t('Bessere Spracherkennung', 'Better speech recognition'), t('Mikrofon und Übersetzer erkennen Sprache jetzt genauer.', 'Microphone and translator now recognise speech more accurately.')],
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
