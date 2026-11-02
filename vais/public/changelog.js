// „Was ist neu?“ – die neuesten Änderungen zuerst. Neue Einträge oben anfügen (id hochzählen).
import { t } from './i18n.js';

export const CHANGES = () => [
  {
    id: 16, date: '2026-11-02',
    items: [
      ['⚡', t('Schnell, Experte, Agent X', 'Fast, Expert, Agent X'), t('Unten rechts wählst du nur noch, wie gründlich VAIs antworten soll. Alles andere (eigenes Modell, Vergleich, Battle, Code) steht unter „Mehr“.', 'Bottom right you now just pick how thorough VAIs should be. Everything else (own model, compare, battle, code) is under “More”.')],
      ['🧠', t('Denken', 'Think'), t('Tippe auf das Gehirn, und VAIs denkt vor der Antwort gründlich nach (zählt als 2 Antworten). Was es gedacht hat, siehst du kurz zusammengefasst.', 'Tap the brain and VAIs thinks carefully before answering (counts as 2 answers). You see a short summary of what it thought.')],
      ['🌐', t('Echte Websuche mit Quellen', 'Real web search with sources'), t('Mit der Weltkugel sucht VAIs im Internet und zeigt nummerierte Quellen direkt im Text – einfach antippen.', 'With the globe, VAIs searches the internet and shows numbered sources right in the text – just tap them.')],
      ['🚀', t('Stärkere Antworten', 'Stronger answers'), t('Neue, bessere kostenlose Modelle, VAIs kennt das heutige Datum, duzt dich immer und erinnert sich in allen Chats an dich.', 'New, better free models, VAIs knows today’s date and remembers you in every chat.')],
    ],
  },
  {
    id: 15, date: '2026-11-02',
    items: [
      ['🍳', t('Kocht …', 'Cooking …'), t('Solange die KI nachdenkt, siehst du kurze Sprüche wie „Kocht …“, „Cooked …“ oder „Tüftelt …“.', 'While the AI is thinking you see short phrases like “Cooking …”, “Cooked …” or “Crafting …”.')],
      ['📌', t('Antworten vom VAIs-Team', 'Answers from the VAIs team'), t('Häufige Fragen beantwortet das Team jetzt selbst – sofort und ohne dein Tageslimit zu verbrauchen.', 'The team now answers frequent questions itself – instantly and without using your daily limit.')],
      ['🌌', t('Neue Galaxie', 'New galaxy'), t('Der geheime Galaxie-Befehl ist jetzt ein kleiner Film … 🤫', 'The secret galaxy command is now a little movie … 🤫')],
    ],
  },
  {
    id: 14, date: '2026-11-02',
    items: [
      ['🕳️', t('Lebendiges Schwarzes Loch', 'Living black hole'), t('Das Logo atmet, dreht sich, während die KI denkt, und schluckt deine Nachricht beim Senden.', 'The logo breathes, spins while the AI thinks and swallows your message when you send.')],
      ['✍️', t('Weiches Tippen', 'Smooth typing'), t('Antworten fließen gleichmäßig herein – mit leuchtendem Cursor.', 'Answers flow in smoothly – with a glowing cursor.')],
      ['🌌', t('Himmel nach Tageszeit', 'Sky by time of day'), t('Morgens warm, abends Sonnenuntergang, nachts Sterne. Dazu 3D-Karten (Beta) in den Einstellungen.', 'Warm in the morning, sunset in the evening, stars at night. Plus 3D cards (beta) in settings.')],
      ['⚡', t('Schneller & stabiler', 'Faster & more stable'), t('Die App öffnet dort, wo du warst. Antworten werden auch bei Funkloch fertig, gleiche Fragen kommen sofort, und kaputte Modelle werden automatisch ausgeblendet.', 'The app opens where you left off. Answers finish even if your connection drops, repeated questions answer instantly and broken models are hidden automatically.')],
      ['🤫', t('Geheime Befehle', 'Secret commands'), t('Es gibt ein paar versteckte Befehle, die mit „/“ anfangen … und das Logo mag es, oft angetippt zu werden.', 'There are a few hidden commands starting with “/” … and the logo likes being tapped a lot.')],
    ],
  },
  {
    id: 13, date: '2026-11-02',
    items: [
      ['✨', t('Auto-Modus', 'Auto mode'), t('Wähl „✨ Automatisch“ als Modell – VAIs nimmt für jede Frage das passende: Code, Mathe, Aktuelles, Kreatives oder schnell bei kurzen Fragen.', 'Pick “✨ Automatic” as the model – VAIs chooses the right one for every question: code, maths, current info, creative or fast for short questions.')],
      ['👆', t('Wischgesten & Vibration', 'Swipe gestures & haptics'), t('Im Chat nach rechts wischen öffnet das Menü, nach links ein neuer Chat. Kurzes Tippen beim Senden und wenn die Antwort fertig ist (iPhone ab iOS 18). Beides in den Einstellungen abschaltbar.', 'In a chat, swipe right for the menu and left for a new chat. A short tap when sending and when the answer is ready (iPhone from iOS 18). Both can be turned off in settings.')],
      ['📴', t('Offline schreiben', 'Write offline'), t('Ohne Internet geschriebene Nachrichten werden gemerkt und automatisch gesendet, sobald du wieder online bist.', 'Messages written without internet are kept and sent automatically when you are back online.')],
      ['🔐', t('Angemeldete Geräte', 'Signed-in devices'), t('In den Einstellungen siehst du alle Geräte mit deinem Konto und kannst sie abmelden. Bei einer neuen Anmeldung bekommst du eine Benachrichtigung.', 'In settings you see all devices with your account and can sign them out. You get a notification on every new sign-in.')],
      ['🚩', t('Inhalte melden', 'Report content'), t('Veröffentlichte Webseiten und geteilte Chats haben jetzt einen „Melden“-Knopf – unser Team prüft jede Meldung.', 'Published websites and shared chats now have a “Report” button – our team checks every report.')],
    ],
  },
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
