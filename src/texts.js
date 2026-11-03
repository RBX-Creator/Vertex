import { escapeHtml as e } from './filter.js';

export const ROLES = [
  { name: 'Gründer', label: '🚀 Gründer', keywords: ['gründer', 'gruender', 'founder', 'cofounder', 'co-founder', 'mitgründer', 'unternehmer', 'ceo', 'startup'] },
  { name: 'Entwickler', label: '💻 Entwickler', keywords: ['entwickler', 'developer', 'dev', 'programmierer', 'coder', 'programmier', 'code', 'tech', 'app', 'website', 'software', 'bot'] },
  { name: 'Designer', label: '🎨 Designer', keywords: ['designer', 'design', 'grafik', 'ui', 'ux', 'logo', 'branding', '3d'] },
  { name: 'Marketing', label: '📈 Marketing', keywords: ['marketing', 'werbung', 'ads', 'social media', 'growth', 'vertrieb', 'sales', 'reichweite'] },
  { name: 'Content Creator', label: '🎬 Content Creator', keywords: ['creator', 'content', 'youtube', 'tiktok', 'video', 'influencer', 'streamer', 'editor', 'editing'] },
  { name: 'Investor', label: '💰 Investor', keywords: ['investor', 'investment', 'kapital', 'geld', 'funding', 'finanzierung', 'sponsor'] },
  { name: 'Sonstiges', label: '✨ Sonstiges', keywords: [] },
];
export const ANY_ROLE = { name: 'Egal', label: '🔀 Egal' };

export function roleFromText(text, { allowAny = false } = {}) {
  const t = (text || '').trim().toLowerCase();
  const list = allowAny ? [...ROLES, ANY_ROLE] : ROLES;
  return list.find((r) => r.label.toLowerCase() === t || r.name.toLowerCase() === t)?.name ?? null;
}
export const roleLabel = (name) => [...ROLES, ANY_ROLE].find((r) => r.name === name)?.label ?? name;

export function roleKeyboard(allowAny = false) {
  const labels = ROLES.map((r) => r.label);
  const rows = [];
  for (let i = 0; i < labels.length; i += 2) rows.push(labels.slice(i, i + 2));
  if (allowAny) rows.push([ANY_ROLE.label]);
  return rows;
}

export const B = {
  accept: '✅ Ich akzeptiere',
  skip: '⏭ Überspringen',
  keep: '↩️ Beibehalten',
  online: '🌐 Online',
  confirm: '✅ Ja, passt',
  redo: '🔄 Neu ausfüllen',
  back: '↩️ Zurück',
  cancel: '↩️ Abbrechen',
  like: '❤️',
  likeMsg: '💌',
  skipCard: '👎',
  sleep: '💤',
  report: '⚠️ Melden',
  block: '🚫 Blockieren',
  endChat: '🚪 Chat beenden',
  share: '🤝 Username teilen',
  removePhoto: '🗑 Foto entfernen',
  editAbout: '📝 Beschreibung',
  editOffers: '💼 Was ich biete',
  editSeeks: '🔎 Was ich suche',
  deleteYes: '🗑 Ja, endgültig löschen',
  likesPrefix: '✨ Interessen',
  likes: (n) => `✨ Interessen ansehen (${n})`,
};

export const REPORT_REASONS = ['Spam/Werbung', 'Dating/Belästigung', 'Unangemessen', 'Fake/Betrug', 'Sonstiges'];

export const T = {
  welcome: (bot) =>
    `🚀 <b>Willkommen bei ${e(bot)}!</b>\n\n` +
    `Hier findest du <b>Business-Partner</b>: Mitgründer, Entwickler, Designer, Creator, Marketing-Leute und mehr.\n\n` +
    `<b>So läuft's:</b>\n` +
    `1️⃣ Profil erstellen\n` +
    `2️⃣ Profile ansehen: ❤️ Interesse oder 👎 weiter\n` +
    `3️⃣ Beide haben Interesse = 🎉 Match\n` +
    `4️⃣ Anonym über den Bot schreiben – ohne Nummer oder Username`,
  rules:
    `📜 <b>Regeln</b>\n\n` +
    `• <b>Nur Business</b> – kein Dating, kein Flirten\n` +
    `• <b>Respektvoll</b> bleiben, kein Spam, keine Werbung\n` +
    `• Keine Fake-Profile, gib dein echtes Alter an\n` +
    `• Unter 18 triffst du nur Leute unter 18, ab 18 nur Leute ab 18\n` +
    `• Teile keine privaten Daten (Adresse, Nummer, Passwörter)\n` +
    `• Triff dich nie allein mit Fremden aus dem Internet – sag immer jemandem Bescheid\n` +
    `• Verstöße mit ⚠️ <b>Melden</b> an das Team schicken – wer sich nicht dran hält, wird gesperrt\n\n` +
    `Akzeptierst du die Regeln?`,
  mustAccept: 'Bitte akzeptiere zuerst die Regeln, um fortzufahren 👇',
  banned: '⛔ Dein Zugang zu diesem Bot wurde wegen eines Regelverstoßes gesperrt.',
  useButtons: 'Bitte nutze die Buttons unten 👇',
  unknown: 'Das habe ich nicht verstanden 🤔 Nutze die Buttons oder /hilfe.',

  // Wizard
  askName: '👤 <b>Wie heißt du?</b>\nVorname oder Spitzname (2–40 Zeichen).',
  askAge: '🎂 <b>Wie alt bist du?</b>\nNur die Zahl, z. B. 16.',
  askCity: `📍 <b>Aus welcher Stadt kommst du?</b>\nOder tippe „${B.online}“, wenn der Ort egal ist.`,
  askRole: '🧭 <b>Was ist deine Rolle?</b>\nWähle unten aus.',
  askSeekRole: '🔭 <b>Welche Rolle suchst du am meisten?</b>',
  askOffers: '💼 <b>Was bietest du?</b>\nDeine Skills, z. B. „Webentwicklung, Video-Editing, Social Media“ (max. 200 Zeichen).',
  askSeeks: '🔎 <b>Was suchst du?</b>\nZ. B. „Mitgründer für meine App-Idee“ oder „Editor für meinen YouTube-Kanal“ (max. 200 Zeichen).',
  askAbout: '📝 <b>Beschreib dich oder dein Projekt kurz.</b>\n10–400 Zeichen.',
  askPhoto: '📸 <b>Schick ein Foto oder Logo</b> (optional).\nTipp: Ein Logo oder Projekt-Bild reicht völlig.',
  askLink: '🔗 <b>Hast du einen Link?</b> (optional)\nWebsite oder Portfolio, z. B. vertex.de',
  preview: '👆 <b>So sieht dein Profil aus.</b> Passt alles?',

  errName: '❌ Der Name muss 2–40 Zeichen lang sein.',
  errAge: '❌ Bitte gib dein Alter als Zahl an (z. B. 16).',
  errTooYoung: (min) => `❌ Sorry, du musst mindestens ${min} Jahre alt sein, um den Bot zu nutzen.`,
  errCity: '❌ Bitte gib eine Stadt an (2–50 Zeichen) oder tippe „🌐 Online“.',
  errRole: '❌ Bitte wähle eine Rolle über die Buttons aus.',
  errText: (min, max) => `❌ Bitte schreib ${min}–${max} Zeichen.`,
  errPhoto: '❌ Bitte schick ein Foto (kein Datei-Anhang) oder tippe „⏭ Überspringen“.',
  errLink: '❌ Das sieht nicht nach einem gültigen Link aus. Beispiel: vertex.de – oder „⏭ Überspringen“.',
  errLinkMinor: '❌ Messenger-Links (Telegram, WhatsApp, Discord …) sind unter 18 nicht erlaubt. Nur Website/Portfolio.',
  errContactMinor: '🚫 Telefonnummern, Links, E-Mails und @Usernames sind im Profil unter 18 nicht erlaubt. Bitte schreib es ohne.',
  ageGroupChanged: 'ℹ️ Deine Altersgruppe hat sich geändert – alte Interessen und Matches wurden aus Sicherheitsgründen entfernt.',
  profileSaved: '✅ <b>Profil gespeichert!</b> Los geht\'s 🚀',

  // Menü
  menu: (paused, pending) =>
    `🛰 <b>Menü</b>\n\n` +
    `1. 🚀 Partner finden\n` +
    `2. 👤 Mein Profil\n` +
    `3. 🖼 Foto ändern\n` +
    `4. ✏️ Text ändern\n` +
    `5. ${paused ? '▶️ Profil aktivieren' : '⏸ Profil pausieren'}\n` +
    `6. 💬 Meine Matches` +
    (paused ? `\n\n⏸ <i>Dein Profil ist pausiert und wird niemandem angezeigt.</i>` : '') +
    (pending ? `\n\n✨ <b>${pending} ${pending === 1 ? 'Person hat' : 'Personen haben'} Interesse an dir!</b>` : ''),
  myProfile: '👆 Das ist dein Profil.\nKomplett neu ausfüllen: /neu · Löschen: /loeschen',
  askNewPhoto: '🖼 Schick mir dein neues Foto oder Logo.',
  photoSaved: '✅ Foto gespeichert.',
  photoRemoved: '🗑 Foto entfernt.',
  pickText: '✏️ Welchen Text möchtest du ändern?',
  textSaved: '✅ Text gespeichert.',
  paused: '⏸ Dein Profil ist jetzt <b>pausiert</b>. Niemand sieht dich, bis du es wieder aktivierst (Taste 5).',
  resumed: '▶️ Dein Profil ist wieder <b>aktiv</b>!',
  pausedNoBrowse: '⏸ Dein Profil ist pausiert. Aktiviere es mit Taste 5, um Partner zu finden.',

  // Browsing
  noProfiles: '🛰 Gerade keine neuen Profile in Reichweite. Schau später wieder vorbei – es kommen ständig neue dazu!',
  askLikeMsg: '💌 Schreib eine kurze Nachricht (max. 300 Zeichen), die mit deinem Interesse gesendet wird:',
  likeSent: '❤️ Interesse gesendet! Wenn es zurückkommt, gibt\'s ein Match.',
  likeLimit: (n) => `⏳ Du hast heute schon ${n}× Interesse gezeigt. Morgen geht's weiter!`,
  notAvailable: 'Dieses Profil ist nicht mehr verfügbar.',
  blocked: '🚫 Blockiert. Ihr seht euch nicht mehr und könnt euch nicht mehr schreiben.',

  // Likes
  likedNotify: (n) => `✨ <b>Jemand hat Interesse an dir!</b>${n > 1 ? `\n(${n} offene Anfragen)` : ''}\nSchau es dir an 👇`,
  likeHeader: '✨ <b>Diese Person hat Interesse an dir:</b>\n\n',
  likeMessage: (m) => `💌 <b>Nachricht an dich:</b>\n${e(m)}`,
  noLikes: 'Keine offenen Interessen gerade. ✨',

  // Matches
  match: (name) =>
    `🎉 <b>Match!</b> Du und <b>${e(name)}</b> habt gegenseitig Interesse.\n\n` +
    `Ihr könnt jetzt <b>anonym über den Bot</b> schreiben – ohne Nummer oder Username. Tippe auf „💬 Chat“.`,
  noMatches: 'Du hast noch keine Matches. Leg los mit 🚀 Partner finden!',
  matchList: (n) => `💬 <b>Deine Matches (${n})</b>\nWähle, mit wem du schreiben willst:`,

  // Chat
  chatStart: (name, minor) =>
    `💬 <b>Chat mit ${e(name)}</b>\n\nDeine Nachrichten werden anonym weitergeleitet.` +
    (minor ? `\n🛡 Telefonnummern, Links und @Usernames werden aus Sicherheitsgründen blockiert.` : '') +
    `\n\n/ende – Chat verlassen`,
  chatEnded: '🚪 Chat verlassen.',
  chatNotPossible: 'Der Chat ist nicht (mehr) möglich.',
  chatFrom: (name, text) => `💬 <b>${e(name)}:</b> ${e(text)}`,
  chatNew: (name) => `📨 <b>Neue Nachricht von ${e(name)}</b> (Match):`,
  chatBlockedContact: '🚫 Nicht gesendet: Telefonnummern, Links, E-Mails und @Usernames sind unter 18 aus Sicherheitsgründen nicht erlaubt.',
  chatRate: '⏳ Langsamer bitte – zu viele Nachrichten in kurzer Zeit.',
  chatMediaMinor: '🚫 Unter 18 können nur Text, Fotos und Sticker gesendet werden.',
  chatUndelivered: '⚠️ Die Nachricht konnte nicht zugestellt werden (die Person hat den Bot evtl. gestoppt).',
  chatTooLong: '❌ Nachricht zu lang (max. 2000 Zeichen).',

  // Username teilen
  shareMinor: '🛡 Username-Austausch ist unter 18 aus Sicherheitsgründen deaktiviert. Schreibt einfach anonym über den Bot.',
  shareAsked: (name) => `🤝 Du hast angeboten, Usernames mit <b>${e(name)}</b> zu tauschen. Sobald ${e(name)} zustimmt, bekommt ihr beide den Username.`,
  shareRequest: (name) => `🤝 <b>${e(name)}</b> möchte Telegram-Usernames mit dir tauschen. Einverstanden?`,
  shareDone: (name, username) =>
    username ? `🤝 Username von <b>${e(name)}</b>: @${e(username)}` : `🤝 <b>${e(name)}</b> hat keinen Telegram-Username eingestellt – schreibt weiter über den Bot.`,

  // Melden
  askReport: '⚠️ <b>Warum meldest du dieses Profil?</b>',
  reported: '✅ Danke! Das Team schaut sich das an. Dieses Profil wird dir nicht mehr angezeigt.',
  adminReport: (r, t, reason, ctx, count) =>
    `🚨 <b>Neue Meldung</b>\n\n` +
    `<b>Gegen:</b> ${e(t?.name ?? '?')} (${t?.age ?? '?'}) · ID <code>${t?.id ?? '?'}</code>${t?.username ? ' · @' + e(t.username) : ''}\n` +
    `<b>Von:</b> ${e(r.name ?? '?')} · ID <code>${r.id}</code>\n` +
    `<b>Grund:</b> ${e(reason)}\n<b>Ort:</b> ${e(ctx)}\n<b>Meldungen gesamt:</b> ${count}\n\n` +
    `Bannen: <code>/admin_bann ${t?.id}</code>`,

  // Löschen
  askDelete: '⚠️ <b>Willst du dein Profil wirklich löschen?</b>\nAlle Interessen, Matches und Chats gehen verloren.',
  deleted: '🗑 Dein Profil wurde gelöscht. Mit /start kannst du jederzeit neu anfangen.',
  deleteCancelled: 'Okay, nichts gelöscht.',

  help: (bot) =>
    `🛰 <b>${e(bot)} – Hilfe</b>\n\n` +
    `Finde Business-Partner: Profil erstellen, Profile ansehen, bei gegenseitigem Interesse anonym chatten.\n\n` +
    `<b>Buttons beim Ansehen</b>\n❤️ Interesse · 💌 Interesse + Nachricht · 👎 Weiter · 💤 Menü\n⚠️ Melden · 🚫 Blockieren\n\n` +
    `<b>Befehle</b>\n` +
    `/start – Start / Menü\n/profil – Mein Profil\n/matches – Meine Matches\n/interessen – Wer hat Interesse an mir?\n` +
    `/neu – Profil neu ausfüllen\n/ende – Chat verlassen\n/regeln – Regeln\n/loeschen – Profil löschen\n/hilfe – Diese Hilfe\n\n` +
    `Nur Business, kein Dating, respektvoll bleiben. 🚀`,

  // Admin
  adminOnly: 'Nur für Admins.',
  adminBanned: (id) => `🔨 User <code>${id}</code> wurde gebannt.`,
  adminUnbanned: (id) => `✅ User <code>${id}</code> wurde entbannt.`,
  adminUsage: 'Benutzung: /admin_bann <id> [Grund]',
  adminStats: (s, kind) =>
    `📊 <b>Statistik</b> (${e(kind)})\n\n` +
    `Users: ${s.users}\nFertige Profile: ${s.profiles} (unter 18: ${s.minors}, ab 18: ${s.adults})\n` +
    `Pausiert: ${s.paused}\nAktiv (24h): ${s.active24h}\nInteressen: ${s.likes}\nMatches: ${s.matches}\n` +
    `Meldungen: ${s.reports}\nBans: ${s.bans}`,
};

/** Profilkarte als HTML-Text. */
export function cardText(u) {
  const where = u.city === 'Online' ? '🌐 Online' : `📍 ${e(u.city)}`;
  const seek = u.seek_role && u.seek_role !== 'Egal' ? ` · sucht ${e(roleLabel(u.seek_role))}` : '';
  return (
    `<b>${e(u.name)}</b>, ${u.age}, ${where}\n` +
    `${e(roleLabel(u.role))}${seek}\n\n` +
    `💼 <b>Bietet:</b> ${e(u.offers)}\n` +
    `🔎 <b>Sucht:</b> ${e(u.seeks)}\n\n` +
    `${e(u.about)}` +
    (u.link ? `\n\n🔗 ${e(u.link)}` : '')
  );
}

export const COMMANDS = [
  { command: 'start', description: 'Start / Menü' },
  { command: 'profil', description: 'Mein Profil' },
  { command: 'matches', description: 'Meine Matches' },
  { command: 'interessen', description: 'Wer hat Interesse an mir?' },
  { command: 'ende', description: 'Chat verlassen' },
  { command: 'neu', description: 'Profil neu ausfüllen' },
  { command: 'hilfe', description: 'Hilfe & Regeln' },
  { command: 'loeschen', description: 'Profil löschen' },
];
