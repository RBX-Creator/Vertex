import { T, B, ROLES, REPORT_REASONS, roleFromText, roleKeyboard, cardText } from './texts.js';
import { containsContact, normalizeLink, escapeHtml } from './filter.js';

const HOUR = 3600_000;
const kb = (rows) => ({ keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true });
const inline = (rows) => ({ inline_keyboard: rows });
const REMOVE_KB = { remove_keyboard: true };

const BROWSE_KB = kb([[B.like, B.likeMsg, B.skipCard, B.sleep], [B.report, B.block]]);
const LIKES_KB = kb([[B.like, B.skipCard, B.sleep], [B.report, B.block]]);

export const isMinor = (u) => Number(u?.age) < 18;
const bounds = (u) => (isMinor(u) ? { minAge: 13, maxAge: 17 } : { minAge: 18, maxAge: 200 });
const sameGroup = (a, b) => isMinor(a) === isMinor(b);
const len = (s) => [...(s || '')].length;

/**
 * Kernlogik des Bots. Transport-unabhängig: bekommt Telegram-Updates und ruft `api.call(method, params)` auf.
 */
export function createBot({ api, store, config, now = () => Date.now(), random = Math.random, log = console }) {
  const queues = new Map();
  const isAdmin = (id) => config.adminIds.includes(Number(id));

  // ---------- Telegram-Helfer ----------
  async function call(method, params) {
    try {
      return await api.call(method, params);
    } catch (e) {
      log.warn?.(`[telegram] ${method} -> ${e?.description || e?.message || e}`);
      return null;
    }
  }
  const send = (chatId, text, extra = {}) =>
    call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

  async function sendCard(chatId, u, extra = {}, prefix = '') {
    const caption = prefix + cardText(u);
    if (u.photo) {
      if (caption.length <= 1024) return call('sendPhoto', { chat_id: chatId, photo: u.photo, caption, parse_mode: 'HTML', ...extra });
      await call('sendPhoto', { chat_id: chatId, photo: u.photo });
    }
    return send(chatId, caption, extra);
  }

  async function setState(user, state, data = null) {
    user.state = state;
    user.data = data;
    await store.upsertUser(user.id, { state, data });
  }

  // ---------- Update-Verarbeitung (pro User serialisiert) ----------
  function handleUpdate(update) {
    const uid = update?.message?.from?.id ?? update?.callback_query?.from?.id;
    if (!uid) return Promise.resolve();
    const prev = queues.get(uid) || Promise.resolve();
    const p = prev.then(() => processUpdate(update)).catch((e) => log.error?.('[bot] update failed:', e?.stack || e));
    queues.set(uid, p);
    p.then(() => queues.get(uid) === p && queues.delete(uid));
    return p;
  }

  async function processUpdate(update) {
    if (update.message) return onMessage(update.message);
    if (update.callback_query) return onCallback(update.callback_query);
  }

  async function loadUser(from) {
    let user = await store.getUser(from.id);
    const username = from.username || null;
    if (!user || user.username !== username || now() - (user.last_active || 0) > 60_000) {
      user = await store.upsertUser(from.id, { username, last_active: now() });
    }
    return user;
  }

  // ---------- Nachrichten ----------
  async function onMessage(msg) {
    if (msg.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
    const user = await loadUser(msg.from);
    if (await store.isBanned(user.id)) return send(user.id, T.banned, { reply_markup: REMOVE_KB });

    const text = (msg.text || '').trim();
    const cmdMatch = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
    if (cmdMatch) {
      const handled = await onCommand(user, cmdMatch[1].toLowerCase(), (cmdMatch[2] || '').trim(), msg);
      if (handled !== false) return;
    }

    if (!user.rules_accepted) {
      if (user.state === 'rules' && text === B.accept) {
        await store.upsertUser(user.id, { rules_accepted: 1 });
        user.rules_accepted = 1;
        return startWizard(user, msg.from);
      }
      return showRules(user, user.state === 'rules');
    }

    switch (user.state) {
      case 'reg': return onWizard(user, msg);
      case 'browse': return onBrowse(user, msg);
      case 'browse_msg': return onBrowseMsg(user, msg);
      case 'likes': return onLikes(user, msg);
      case 'chat': return onChat(user, msg);
      case 'report': return onReport(user, msg);
      case 'edit_photo': return onEditPhoto(user, msg);
      case 'edit_text_pick': return onEditTextPick(user, msg);
      case 'edit_text': return onEditText(user, msg);
      case 'delete_confirm': return onDeleteConfirm(user, msg);
      default:
        if (!user.complete) return startWizard(user, msg.from);
        return onMenu(user, msg);
    }
  }

  async function onCommand(user, cmd, arg, msg) {
    if (cmd.startsWith('admin_')) return onAdmin(user, cmd, arg);
    switch (cmd) {
      case 'start':
        if (!user.rules_accepted) {
          await send(user.id, T.welcome(config.botName), { reply_markup: REMOVE_KB });
          return showRules(user);
        }
        if (!user.complete) return user.state === 'reg' ? askStep(user) : startWizard(user, msg.from);
        return showMenu(user);
      case 'hilfe':
      case 'help':
        return send(user.id, T.help(config.botName));
      case 'regeln':
        return send(user.id, T.rules.replace(/\n\nAkzeptierst du die Regeln\?$/, ''));
      case 'loeschen':
      case 'delete':
        if (!user.complete && !user.rules_accepted) {
          await store.deleteUser(user.id);
          return send(user.id, T.deleted, { reply_markup: REMOVE_KB });
        }
        await setState(user, 'delete_confirm', { back: user.state, backData: user.data });
        return send(user.id, T.askDelete, { reply_markup: kb([[B.deleteYes], [B.cancel]]) });
    }
    if (!user.rules_accepted) return showRules(user);
    switch (cmd) {
      case 'neu':
        return startWizard(user, msg.from);
    }
    if (!user.complete) return user.state === 'reg' ? askStep(user) : startWizard(user, msg.from);
    switch (cmd) {
      case 'menu':
      case 'menue':
        return showMenu(user);
      case 'profil':
      case 'profile':
        return showMyProfile(user);
      case 'matches':
        return showMatches(user);
      case 'interessen':
        return showNextLike(user);
      case 'ende':
      case 'stop':
        if (user.state === 'chat') {
          await send(user.id, T.chatEnded);
        }
        return showMenu(user);
    }
    if (user.state === 'chat') return send(user.id, T.unknown);
    return false; // als normale Nachricht behandeln
  }

  // ---------- Regeln ----------
  async function showRules(user, reminder = false) {
    await setState(user, 'rules');
    return send(user.id, reminder ? T.mustAccept : T.rules, { reply_markup: kb([[B.accept]]) });
  }

  // ---------- Profil-Wizard ----------
  const STEPS = {
    name: {
      ask: (d, from) => ({ text: T.askName, rows: [d.draft.name || from?.first_name].filter(Boolean).map((n) => [n.slice(0, 40)]) }),
      handle(msg, d) {
        const v = (msg.text || '').trim();
        if (len(v) < 2 || len(v) > 40 || v.startsWith('/')) return T.errName;
        d.draft.name = v;
      },
    },
    age: {
      ask: (d) => ({ text: T.askAge, rows: d.draft.age ? [[String(d.draft.age)]] : [] }),
      handle(msg, d) {
        const v = (msg.text || '').trim();
        if (!/^\d{1,3}$/.test(v)) return T.errAge;
        const n = parseInt(v, 10);
        if (n < config.minAge) return T.errTooYoung(config.minAge);
        if (n > 99) return T.errAge;
        d.draft.age = n;
      },
    },
    city: {
      ask: (d) => ({ text: T.askCity, rows: [[B.online], ...(d.draft.city && d.draft.city !== 'Online' ? [[d.draft.city]] : [])] }),
      handle(msg, d) {
        const v = (msg.text || '').trim();
        if (v === B.online || v.toLowerCase() === 'online') return void (d.draft.city = 'Online');
        if (len(v) < 2 || len(v) > 50 || /[\d@/]/.test(v)) return T.errCity;
        d.draft.city = v;
      },
    },
    role: {
      ask: () => ({ text: T.askRole, rows: roleKeyboard(false) }),
      handle(msg, d) {
        const r = roleFromText(msg.text);
        if (!r) return T.errRole;
        d.draft.role = r;
      },
    },
    seek_role: {
      ask: () => ({ text: T.askSeekRole, rows: roleKeyboard(true) }),
      handle(msg, d) {
        const r = roleFromText(msg.text, { allowAny: true });
        if (!r) return T.errRole;
        d.draft.seek_role = r;
      },
    },
    offers: textStep('offers', T.askOffers, 3, 200),
    seeks: textStep('seeks', T.askSeeks, 3, 200),
    about: textStep('about', T.askAbout, 10, 400),
    photo: {
      ask: (d) => ({ text: T.askPhoto, rows: [d.draft.photo ? [B.keep, B.skip] : [B.skip]] }),
      handle(msg, d) {
        if (msg.photo?.length) return void (d.draft.photo = msg.photo[msg.photo.length - 1].file_id);
        if (msg.text === B.keep && d.draft.photo) return;
        if (msg.text === B.skip) return void (d.draft.photo = null);
        return T.errPhoto;
      },
    },
    link: {
      ask: (d) => ({ text: T.askLink, rows: [d.draft.link ? [B.keep, B.skip] : [B.skip]] }),
      handle(msg, d) {
        const v = (msg.text || '').trim();
        if (v === B.keep && d.draft.link) return;
        if (v === B.skip) return void (d.draft.link = null);
        const minor = d.draft.age < 18;
        const link = normalizeLink(v, { minor });
        if (!link) return minor && normalizeLink(v) ? T.errLinkMinor : T.errLink;
        d.draft.link = link;
      },
    },
  };
  const STEP_ORDER = Object.keys(STEPS);

  function textStep(field, prompt, min, max) {
    return {
      ask: (d) => ({ text: prompt, rows: d.draft[field] ? [[B.keep]] : [] }),
      handle(msg, d) {
        const v = (msg.text || '').trim();
        if (v === B.keep && d.draft[field]) return;
        if (len(v) < min || len(v) > max || v.startsWith('/')) return T.errText(min, max);
        if (d.draft.age < 18 && containsContact(v)) return T.errContactMinor;
        d.draft[field] = v;
      },
    };
  }

  async function startWizard(user, from) {
    const draft = {};
    if (user.complete) for (const k of ['name', 'age', 'city', 'role', 'seek_role', 'offers', 'seeks', 'about', 'photo', 'link']) draft[k] = user[k];
    await setState(user, 'reg', { step: 'name', draft, prevAge: user.complete ? user.age : null, fromName: from?.first_name || null });
    return askStep(user);
  }

  async function askStep(user) {
    const d = user.data;
    if (d.step === 'confirm') {
      await sendCard(user.id, d.draft);
      return send(user.id, T.preview, { reply_markup: kb([[B.confirm], [B.redo]]) });
    }
    const { text, rows } = STEPS[d.step].ask(d, { first_name: d.fromName });
    return send(user.id, text, { reply_markup: rows.length ? kb(rows) : REMOVE_KB });
  }

  async function onWizard(user, msg) {
    const d = user.data || { step: 'name', draft: {} };
    if (d.step === 'confirm') {
      if (msg.text === B.redo) return startWizard(user, msg.from);
      if (msg.text !== B.confirm) return send(user.id, T.useButtons);
      return finishWizard(user, d);
    }
    const err = STEPS[d.step].handle(msg, d);
    if (err) return send(user.id, err);
    const idx = STEP_ORDER.indexOf(d.step);
    d.step = STEP_ORDER[idx + 1] || 'confirm';
    await setState(user, 'reg', d);
    return askStep(user);
  }

  async function finishWizard(user, d) {
    const dr = d.draft;
    const bad = dr.age < 18 && ['name', 'offers', 'seeks', 'about'].find((k) => containsContact(dr[k]));
    if (bad) {
      d.step = bad;
      dr[bad] = null;
      await setState(user, 'reg', d);
      await send(user.id, T.errContactMinor);
      return askStep(user);
    }
    const groupChanged = d.prevAge != null && (d.prevAge < 18) !== (dr.age < 18);
    Object.assign(user, await store.upsertUser(user.id, { ...dr, complete: 1 }));
    if (groupChanged) {
      await store.clearRelations(user.id);
      await send(user.id, T.ageGroupChanged);
    }
    return showMenu(user, T.profileSaved);
  }

  // ---------- Menü ----------
  async function showMenu(user, intro) {
    await setState(user, 'menu');
    const pending = (await store.pendingLikes(user.id, { ...bounds(user), limit: 99 })).length;
    const rows = [['1', '2', '3'], ['4', '5', '6']];
    if (pending) rows.push([B.likes(pending)]);
    return send(user.id, (intro ? intro + '\n\n' : '') + T.menu(!!user.paused, pending), { reply_markup: kb(rows) });
  }

  async function onMenu(user, msg) {
    const t = (msg.text || '').trim();
    if (t.startsWith(B.likesPrefix)) return showNextLike(user);
    switch (t.charAt(0)) {
      case '1': return showNextProfile(user);
      case '2': return showMyProfile(user);
      case '3':
        await setState(user, 'edit_photo');
        return send(user.id, T.askNewPhoto, { reply_markup: kb([user.photo ? [B.removePhoto, B.back] : [B.back]]) });
      case '4':
        await setState(user, 'edit_text_pick');
        return send(user.id, T.pickText, { reply_markup: kb([[B.editAbout], [B.editOffers, B.editSeeks], [B.back]]) });
      case '5': {
        const paused = user.paused ? 0 : 1;
        await store.upsertUser(user.id, { paused });
        user.paused = paused;
        return showMenu(user, paused ? T.paused : T.resumed);
      }
      case '6': return showMatches(user);
    }
    return showMenu(user);
  }

  async function showMyProfile(user) {
    await sendCard(user.id, user);
    return showMenu(user, T.myProfile);
  }

  async function onEditPhoto(user, msg) {
    if (msg.photo?.length) {
      await store.upsertUser(user.id, { photo: msg.photo[msg.photo.length - 1].file_id });
      return showMenu(user, T.photoSaved);
    }
    if (msg.text === B.removePhoto) {
      await store.upsertUser(user.id, { photo: null });
      user.photo = null;
      return showMenu(user, T.photoRemoved);
    }
    if (msg.text === B.back) return showMenu(user);
    return send(user.id, T.askNewPhoto);
  }

  const EDIT_FIELDS = { [B.editAbout]: ['about', T.askAbout, 10, 400], [B.editOffers]: ['offers', T.askOffers, 3, 200], [B.editSeeks]: ['seeks', T.askSeeks, 3, 200] };
  async function onEditTextPick(user, msg) {
    if (msg.text === B.back) return showMenu(user);
    const f = EDIT_FIELDS[msg.text];
    if (!f) return send(user.id, T.useButtons);
    await setState(user, 'edit_text', { field: f[0] });
    return send(user.id, f[1], { reply_markup: kb([[B.back]]) });
  }
  async function onEditText(user, msg) {
    if (msg.text === B.back) return showMenu(user);
    const f = Object.values(EDIT_FIELDS).find((x) => x[0] === user.data?.field);
    if (!f) return showMenu(user);
    const v = (msg.text || '').trim();
    if (len(v) < f[2] || len(v) > f[3]) return send(user.id, T.errText(f[2], f[3]));
    if (isMinor(user) && containsContact(v)) return send(user.id, T.errContactMinor);
    Object.assign(user, await store.upsertUser(user.id, { [f[0]]: v }));
    await sendCard(user.id, user);
    return showMenu(user, T.textSaved);
  }

  // ---------- Partner finden ----------
  function score(me, c) {
    let s = 0;
    const roleKw = (name) => ROLES.find((r) => r.name === name)?.keywords || [];
    const mentions = (text, role) => roleKw(role).some((k) => (text || '').toLowerCase().includes(k));
    if (me.seek_role && me.seek_role !== 'Egal' && c.role === me.seek_role) s += 5;
    if (c.seek_role && c.seek_role === me.role) s += 3;
    if (mentions(me.seeks, c.role)) s += 2;
    if (mentions(c.seeks, me.role)) s += 1;
    if (me.city && c.city && me.city !== 'Online' && me.city.toLowerCase() === c.city.toLowerCase()) s += 1.5;
    if (c.city === 'Online' || me.city === 'Online') s += 0.5;
    if (c.role === me.role && me.seek_role !== me.role) s -= 1;
    return s + random() * 1.5;
  }

  async function showNextProfile(user) {
    if (user.paused) return showMenu(user, T.pausedNoBrowse);
    const list = await store.listCandidates(user.id, { ...bounds(user), viewedSince: now() - config.viewCooldownHours * HOUR });
    const cands = list.filter((c) => sameGroup(user, c));
    if (!cands.length) return showMenu(user, T.noProfiles);
    let best = cands[0];
    let bestScore = -Infinity;
    for (const c of cands) {
      const s = score(user, c);
      if (s > bestScore) [best, bestScore] = [c, s];
    }
    await store.addView(user.id, best.id);
    await setState(user, 'browse', { cur: best.id });
    return sendCard(user.id, best, { reply_markup: BROWSE_KB }, '🚀 ');
  }

  async function onBrowse(user, msg) {
    const cur = user.data?.cur;
    switch (msg.text) {
      case B.like:
        await doLike(user, cur, null);
        return showNextProfile(user);
      case B.likeMsg:
        await setState(user, 'browse_msg', { cur });
        return send(user.id, T.askLikeMsg, { reply_markup: kb([[B.back]]) });
      case B.skipCard:
        return showNextProfile(user);
      case B.sleep:
        return showMenu(user);
      case B.report:
        return startReport(user, cur, 'browse');
      case B.block:
        await store.addBlock(user.id, cur);
        await send(user.id, T.blocked);
        return showNextProfile(user);
    }
    return send(user.id, T.useButtons, { reply_markup: BROWSE_KB });
  }

  async function onBrowseMsg(user, msg) {
    const cur = user.data?.cur;
    if (msg.text === B.back) {
      const target = await store.getUser(cur);
      await setState(user, 'browse', { cur });
      if (!target) return showNextProfile(user);
      return sendCard(user.id, target, { reply_markup: BROWSE_KB }, '🚀 ');
    }
    const v = (msg.text || '').trim();
    if (len(v) < 1 || len(v) > 300) return send(user.id, T.errText(1, 300));
    const target = await store.getUser(cur);
    if ((isMinor(user) || isMinor(target)) && containsContact(v)) return send(user.id, T.chatBlockedContact);
    await doLike(user, cur, v);
    return showNextProfile(user);
  }

  async function canInteract(user, target) {
    return !!(target && target.complete && sameGroup(user, target) && !(await store.isBanned(target.id)) && !(await store.isBlocked(user.id, target.id)));
  }

  /** Interesse zeigen. Gibt 'match' | 'liked' | 'limit' | 'invalid' zurück. */
  async function doLike(user, targetId, message) {
    const target = await store.getUser(targetId);
    if (!(await canInteract(user, target))) {
      await send(user.id, T.notAvailable);
      return 'invalid';
    }
    if ((await store.countEvents(user.id, 'like', now() - 24 * HOUR)) >= config.likesPerDay) {
      await send(user.id, T.likeLimit(config.likesPerDay));
      return 'limit';
    }
    await store.addEvent(user.id, 'like');
    const reverse = await store.getLike(target.id, user.id);
    if (reverse) {
      await createMatch(user, target, { notifyActorCard: false });
      return 'match';
    }
    if (await store.getMatch(user.id, target.id)) return 'match';
    await store.addLike(user.id, target.id, message);
    await send(user.id, T.likeSent);
    const pending = (await store.pendingLikes(target.id, { ...bounds(target), limit: 99 })).length;
    await send(target.id, T.likedNotify(pending), { reply_markup: inline([[{ text: '👀 Anzeigen', callback_data: 'likes' }]]) });
    return 'liked';
  }

  async function createMatch(a, b) {
    await store.addMatch(a.id, b.id);
    await store.answerLike(a.id, b.id);
    await store.answerLike(b.id, a.id);
    const buttons = (other, me) => {
      const rows = [[{ text: `💬 Chat mit ${other.name}`.slice(0, 60), callback_data: `chat:${other.id}` }]];
      if (!isMinor(me) && !isMinor(other)) rows.push([{ text: B.share, callback_data: `share:${other.id}` }]);
      return inline(rows);
    };
    await send(a.id, T.match(b.name), { reply_markup: buttons(b, a) });
    await sendCard(b.id, a);
    await send(b.id, T.match(a.name), { reply_markup: buttons(a, b) });
  }

  // ---------- Eingehende Interessen ----------
  async function showNextLike(user) {
    if (!user.complete) return startWizard(user);
    const [next] = await store.pendingLikes(user.id, { ...bounds(user), limit: 1 });
    if (!next) return showMenu(user, T.noLikes);
    const liker = await store.getUser(next.from_id);
    await setState(user, 'likes', { cur: liker.id });
    await sendCard(user.id, liker, { reply_markup: LIKES_KB }, T.likeHeader);
    if (next.message) await send(user.id, T.likeMessage(next.message), { reply_markup: LIKES_KB });
  }

  async function onLikes(user, msg) {
    const cur = user.data?.cur;
    switch (msg.text) {
      case B.like: {
        const target = await store.getUser(cur);
        if (await canInteract(user, target)) {
          await store.addEvent(user.id, 'like');
          await createMatch(user, target);
        } else await send(user.id, T.notAvailable);
        return showNextLike(user);
      }
      case B.skipCard:
        await store.answerLike(cur, user.id);
        return showNextLike(user);
      case B.sleep:
        return showMenu(user);
      case B.report:
        return startReport(user, cur, 'likes');
      case B.block:
        await store.addBlock(user.id, cur);
        await send(user.id, T.blocked);
        return showNextLike(user);
    }
    return send(user.id, T.useButtons, { reply_markup: LIKES_KB });
  }

  // ---------- Matches & Chat ----------
  async function activeMatches(user) {
    const ids = await store.listMatches(user.id);
    const out = [];
    for (const id of ids) {
      const o = await store.getUser(id);
      if (await canInteract(user, o)) out.push(o);
    }
    return out;
  }

  async function showMatches(user) {
    const list = await activeMatches(user);
    if (!list.length) return showMenu(user, T.noMatches);
    await setState(user, 'menu');
    return send(user.id, T.matchList(list.length), {
      reply_markup: inline(list.slice(0, 50).map((o) => [{ text: `💬 ${o.name}, ${o.age} · ${o.role}`.slice(0, 60), callback_data: `chat:${o.id}` }])),
    });
  }

  const chatKb = (user, partner) => {
    const rows = [[B.endChat], [B.report, B.block]];
    if (!isMinor(user) && !isMinor(partner)) rows.push([B.share]);
    return kb(rows);
  };

  async function chatAllowed(user, partner) {
    return (await canInteract(user, partner)) && !!(await store.getMatch(user.id, partner.id));
  }

  async function startChat(user, partnerId) {
    const partner = await store.getUser(partnerId);
    if (!(await chatAllowed(user, partner))) return send(user.id, T.chatNotPossible);
    await setState(user, 'chat', { with: partner.id });
    return send(user.id, T.chatStart(partner.name, isMinor(user)), { reply_markup: chatKb(user, partner) });
  }

  async function onChat(user, msg) {
    const partner = await store.getUser(user.data?.with);
    switch (msg.text) {
      case B.endChat:
        await send(user.id, T.chatEnded);
        return showMenu(user);
      case B.report:
        return startReport(user, partner?.id, 'chat');
      case B.block:
        if (partner) await store.addBlock(user.id, partner.id);
        await send(user.id, T.blocked);
        return showMenu(user);
      case B.share:
        return shareUsername(user, partner?.id);
    }
    if (!(await chatAllowed(user, partner))) {
      await send(user.id, T.chatNotPossible);
      return showMenu(user);
    }
    return relay(user, partner, msg);
  }

  async function relay(user, partner, msg) {
    if ((await store.countEvents(user.id, 'msg', now() - 60_000)) >= config.msgsPerMinute) return send(user.id, T.chatRate);
    const protect = isMinor(user) || isMinor(partner);
    const text = msg.text ?? null;
    const caption = msg.caption ?? '';
    if (protect && containsContact(text ?? caption)) return send(user.id, T.chatBlockedContact);
    if (text != null && len(text) > 2000) return send(user.id, T.chatTooLong);
    const isMedia = text == null;
    if (isMedia && protect && !(msg.photo || msg.sticker)) return send(user.id, T.chatMediaMinor);
    if (isMedia && (msg.contact || msg.location || msg.venue)) return send(user.id, protect ? T.chatBlockedContact : T.useButtons);
    if (protect && (msg.forward_origin || msg.forward_from || msg.forward_from_chat)) return send(user.id, T.chatBlockedContact);

    await store.addEvent(user.id, 'msg');
    const inChat = partner.state === 'chat' && Number(partner.data?.with) === Number(user.id);
    const replyBtn = inline([[{ text: '↩️ Antworten', callback_data: `chat:${user.id}` }]]);
    let ok;
    if (!isMedia) {
      ok = inChat
        ? await send(partner.id, T.chatFrom(user.name, text))
        : await send(partner.id, `${T.chatNew(user.name)}\n\n${escapeHtml(text)}`, { reply_markup: replyBtn });
    } else {
      if (!inChat) await send(partner.id, T.chatNew(user.name), { reply_markup: replyBtn });
      const params = { chat_id: partner.id, from_chat_id: user.id, message_id: msg.message_id };
      if (!msg.sticker && !msg.video_note) Object.assign(params, { caption: T.chatFrom(user.name, caption).trim(), parse_mode: 'HTML' });
      ok = await call('copyMessage', params);
    }
    if (!ok) return send(user.id, T.chatUndelivered);
  }

  async function shareUsername(user, partnerId) {
    const partner = await store.getUser(partnerId);
    if (!(await chatAllowed(user, partner))) return send(user.id, T.chatNotPossible);
    if (isMinor(user) || isMinor(partner)) return send(user.id, T.shareMinor);
    const m = await store.setShare(user.id, partner.id);
    if (m.share_a && m.share_b) {
      await send(user.id, T.shareDone(partner.name, partner.username));
      await send(partner.id, T.shareDone(user.name, user.username));
      return;
    }
    await send(user.id, T.shareAsked(partner.name));
    return send(partner.id, T.shareRequest(user.name), {
      reply_markup: inline([[{ text: '🤝 Ja, tauschen', callback_data: `share:${user.id}` }]]),
    });
  }

  // ---------- Melden ----------
  async function startReport(user, targetId, back) {
    if (!targetId) return showMenu(user);
    await setState(user, 'report', { target: targetId, back, backData: user.data });
    const rows = [];
    for (let i = 0; i < REPORT_REASONS.length; i += 2) rows.push(REPORT_REASONS.slice(i, i + 2));
    rows.push([B.cancel]);
    return send(user.id, T.askReport, { reply_markup: kb(rows) });
  }

  async function onReport(user, msg) {
    const { target, back, backData } = user.data || {};
    if (msg.text === B.cancel) {
      if (back === 'chat') return startChat(user, target);
      if (back === 'likes') return showNextLike(user);
      if (back === 'browse') {
        const t = await store.getUser(target);
        await setState(user, 'browse', backData);
        return t ? sendCard(user.id, t, { reply_markup: BROWSE_KB }, '🚀 ') : showNextProfile(user);
      }
      return showMenu(user);
    }
    if (!REPORT_REASONS.includes(msg.text)) return send(user.id, T.useButtons);
    const reported = await store.getUser(target);
    await store.addReport({ reporterId: user.id, reportedId: target, reason: msg.text, context: back });
    await store.addBlock(user.id, target);
    if (back === 'likes') await store.answerLike(target, user.id);
    const n = await store.countReportsAgainst(target);
    const ctxName = { browse: 'Profil beim Ansehen', likes: 'Eingehendes Interesse', chat: 'Chat' }[back] || back;
    for (const adminId of config.adminIds) {
      if (reported) await sendCard(adminId, reported);
      await send(adminId, T.adminReport(user, reported || { id: target }, msg.text, ctxName, n), {
        reply_markup: inline([[{ text: '🔨 Bannen', callback_data: `ban:${target}` }]]),
      });
    }
    await send(user.id, T.reported);
    if (back === 'browse') return showNextProfile(user);
    if (back === 'likes') return showNextLike(user);
    return showMenu(user);
  }

  // ---------- Löschen ----------
  async function onDeleteConfirm(user, msg) {
    if (msg.text === B.deleteYes) {
      await store.deleteUser(user.id);
      return send(user.id, T.deleted, { reply_markup: REMOVE_KB });
    }
    await send(user.id, T.deleteCancelled);
    if (!user.complete) return startWizard(user, msg.from);
    return showMenu(user);
  }

  // ---------- Admin ----------
  async function banUser(adminId, id, reason) {
    await store.ban(id, reason || 'admin');
    const u = await store.getUser(id);
    if (u) await store.upsertUser(id, { state: 'menu', data: null });
    await send(id, T.banned, { reply_markup: REMOVE_KB });
    return send(adminId, T.adminBanned(id));
  }

  async function onAdmin(user, cmd, arg) {
    if (!isAdmin(user.id)) return send(user.id, T.adminOnly);
    const [idStr, ...rest] = arg.split(/\s+/);
    const id = parseInt(idStr, 10);
    switch (cmd) {
      case 'admin_bann':
      case 'admin_ban':
        if (!Number.isFinite(id)) return send(user.id, T.adminUsage);
        return banUser(user.id, id, rest.join(' '));
      case 'admin_entbann':
      case 'admin_unban':
        if (!Number.isFinite(id)) return send(user.id, 'Benutzung: /admin_entbann <id>');
        await store.unban(id);
        return send(user.id, T.adminUnbanned(id));
      case 'admin_stats':
        return send(user.id, T.adminStats(await store.stats(), store.kind || 'db'));
      case 'admin_info': {
        const u = Number.isFinite(id) ? await store.getUser(id) : null;
        if (!u) return send(user.id, 'Nicht gefunden. Benutzung: /admin_info <id>');
        if (u.complete) await sendCard(user.id, u);
        return send(user.id, `ID <code>${u.id}</code>${u.username ? ' · @' + u.username : ''}\nGebannt: ${(await store.isBanned(u.id)) ? 'ja' : 'nein'} · Meldungen: ${await store.countReportsAgainst(u.id)}`);
      }
    }
    return send(user.id, 'Admin-Befehle: /admin_bann <id> [Grund], /admin_entbann <id>, /admin_info <id>, /admin_stats');
  }

  // ---------- Inline-Buttons ----------
  async function onCallback(cq) {
    await call('answerCallbackQuery', { callback_query_id: cq.id });
    if (!cq.from || cq.from.is_bot) return;
    const user = await loadUser(cq.from);
    if (await store.isBanned(user.id)) return send(user.id, T.banned, { reply_markup: REMOVE_KB });
    if (!user.rules_accepted) return showRules(user);
    if (!user.complete) return user.state === 'reg' ? askStep(user) : startWizard(user, cq.from);
    const [action, arg] = String(cq.data || '').split(':');
    const id = parseInt(arg, 10);
    switch (action) {
      case 'likes': return showNextLike(user);
      case 'chat': return startChat(user, id);
      case 'share': return shareUsername(user, id);
      case 'ban':
        if (!isAdmin(user.id)) return send(user.id, T.adminOnly);
        return banUser(user.id, id, 'report');
    }
  }

  return { handleUpdate, _score: score };
}
