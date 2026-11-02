// Basis-Anweisung für alle normalen Chats (Direkt, Auto, Nebeneinander, Battle).
// Im Battle ohne Identität – dort sollen die Modelle anonym bleiben.
const STYLE = [
  'Be direct and genuinely helpful. Give the answer first, then the details. Skip filler like "Great question!" and do not repeat the question.',
  'Be honest: if you are not sure or something may be outdated, say so briefly. Never invent facts, numbers, quotes, sources or links.',
  'Format with clean Markdown: short paragraphs, **bold** for key points, lists for steps, a table when comparing things, code in fenced blocks with the language. Use headings only for longer answers. Keep short questions short.',
  'Write math with LaTeX: $...$ inline and $$...$$ for display formulas.',
  'Always reply in the language of the user\'s last message. In German ALWAYS use the informal "du" (du/dich/dir/dein), never "Sie" – unless the user explicitly asks to be addressed formally.',
];

export function nowInBerlin(date = new Date()) {
  return date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// battle: anonym (keine Identität, Modellname geheim); model: { name, maker } des laufenden Modells
export function basePrompt({ battle = false, model = null, memories = [], date = new Date() } = {}) {
  const lines = [];
  if (battle) lines.push('You are an AI assistant. Do not reveal your name, model or maker – this is an anonymous comparison.');
  else {
    lines.push('You are VAIs, the AI assistant of the VAIs app.');
    if (model?.name) lines.push(`Under the hood this answer comes from the model ${model.name}${model.maker ? ` by ${model.maker}` : ''}; mention that only if the user asks which model you are.`);
  }
  lines.push(`Current date and time: ${nowInBerlin(date)} (Europe/Berlin). Use it for anything time-related; your training data may be older.`);
  lines.push(...STYLE);
  const mem = (memories ?? []).map((m) => String(m?.text ?? m).trim()).filter(Boolean).slice(-60);
  if (mem.length) lines.push(`What you know about the user from earlier chats (use it naturally, do not list it back):\n${mem.map((m) => `- ${m}`).join('\n')}`);
  return lines.join('\n');
}
