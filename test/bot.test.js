import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STORE_KINDS } from './helpers.js';
import { B, REPORT_REASONS } from '../src/texts.js';

const cur = async (env, id) => (await env.store.getUser(id)).data?.cur;

for (const storeKind of STORE_KINDS) {
  describe(`Bot [${storeKind}]`, () => {
    test('Wizard: Regeln, Validierung, optionale Schritte, Bestätigung', async () => {
      const env = await setup({ storeKind });
      const { say, tg, store } = env;
      await say(10, '/start');
      assert.match(tg.allText(10), /Willkommen/);
      assert.match(tg.lastText(10), /Regeln/);
      await say(10, 'hallo');
      assert.match(tg.lastText(10), /akzeptiere zuerst/);
      await say(10, B.accept);
      assert.match(tg.lastText(10), /Wie heißt du/);
      await say(10, 'L');
      assert.match(tg.lastText(10), /2–40 Zeichen/);
      await say(10, 'Leeam');
      await say(10, 'abc');
      assert.match(tg.lastText(10), /als Zahl/);
      await say(10, '12');
      assert.match(tg.lastText(10), /mindestens 13/);
      await say(10, '15');
      assert.match(tg.lastText(10), /Stadt/);
      await say(10, 'Hamburg');
      await say(10, 'Koch');
      assert.match(tg.lastText(10), /Rolle über die Buttons/);
      await say(10, '💻 Entwickler');
      await say(10, '🎨 Designer');
      await say(10, 'Bots und Websites');
      await say(10, 'Designer für Logos');
      await say(10, 'kurz');
      assert.match(tg.lastText(10), /10–400/);
      await say(10, 'Ruf mich an 0176 12345678 für mehr Infos');
      assert.match(tg.lastText(10), /unter 18 nicht erlaubt/);
      await say(10, 'Ich baue Telegram-Bots für die VERTEX Community.');
      assert.match(tg.lastText(10), /Foto oder Logo/);
      await say(10, 'kein foto');
      assert.match(tg.lastText(10), /Bitte schick ein Foto/);
      await env.photo(10, 'logo1');
      assert.match(tg.lastText(10), /Link/);
      await say(10, 'kein link hier');
      assert.match(tg.lastText(10), /gültigen Link/);
      await say(10, 't.me/irgendwer');
      assert.match(tg.lastText(10), /Messenger-Links/);
      await say(10, 'vertex.de');
      assert.match(tg.lastText(10), /Passt alles/);
      let u = await store.getUser(10);
      assert.equal(u.complete, 0, 'erst nach Bestätigung fertig');
      await say(10, B.confirm);
      u = await store.getUser(10);
      assert.equal(u.complete, 1);
      assert.equal(u.name, 'Leeam');
      assert.equal(u.age, 15);
      assert.equal(u.role, 'Entwickler');
      assert.equal(u.seek_role, 'Designer');
      assert.equal(u.photo, 'logo1');
      assert.equal(u.link, 'https://vertex.de/');
      assert.match(tg.lastText(10), /Menü/);
      assert.deepEqual(tg.lastKeyboard(10).slice(0, 6), ['1', '2', '3', '4', '5', '6']);
      // Mein Profil
      await say(10, '2');
      assert.ok(tg.sent(10).some((c) => c.method === 'sendPhoto' && /Leeam<\/b>, 15/.test(c.params.caption)));
      // Online statt Stadt + Skip Foto/Link
      const v = await env.register(11, { city: 'Online', age: 20 });
      assert.equal(v.city, 'Online');
      assert.equal(v.photo, null);
      assert.equal(v.link, null);
    });

    test('Browsen: komplementäre Rollen zuerst, kein eigenes Profil, keine Wiederholung', async () => {
      const env = await setup({ storeKind });
      const { say, tg, register } = env;
      await register(1, { role: 'Gründer', seekRole: 'Entwickler', seeks: 'Entwickler für meine App' });
      await register(2, { role: 'Designer', seekRole: 'Egal' });
      await register(3, { role: 'Entwickler', seekRole: 'Gründer' });
      await register(4, { role: 'Marketing', seekRole: 'Egal' });
      await say(1, '1');
      assert.equal(await cur(env, 1), 3, 'Entwickler zuerst');
      assert.deepEqual(tg.lastKeyboard(1), [B.like, B.likeMsg, B.skipCard, B.sleep, B.report, B.block]);
      const seen = [3];
      await say(1, B.skipCard);
      seen.push(await cur(env, 1));
      await say(1, B.skipCard);
      seen.push(await cur(env, 1));
      assert.deepEqual([...seen].sort(), [2, 3, 4]);
      assert.ok(!seen.includes(1));
      await say(1, B.skipCard);
      assert.match(tg.lastText(1), /keine neuen Profile/);
      // nach Ablauf der Sperrzeit wieder sichtbar
      env.clock.t += 25 * 3600_000;
      await say(1, '1');
      assert.ok([2, 3, 4].includes(await cur(env, 1)));
      await say(1, B.sleep);
      assert.match(tg.lastText(1), /Menü/);
    });

    test('Like -> Benachrichtigung -> Like zurück = Match für beide', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register, store } = env;
      await register(1, { name: 'Anna' });
      await register(2, { name: 'Ben', role: 'Entwickler' });
      await say(1, '1');
      assert.equal(await cur(env, 1), 2);
      await say(1, B.like);
      assert.match(tg.allText(2), /Jemand hat Interesse an dir/);
      assert.ok(tg.inlineButtons(2).some((b) => b.callback_data === 'likes'));
      assert.match(tg.allText(1), /Interesse gesendet/);
      // Ben öffnet Interessen
      await click(2, 'likes');
      assert.match(tg.allText(2), /Diese Person hat Interesse an dir:[\s\S]*Anna/);
      tg.clear();
      await say(2, B.like);
      assert.match(tg.allText(1), /Match!.*Ben/);
      assert.match(tg.allText(2), /Match!.*Anna/);
      assert.ok(tg.inlineButtons(1).some((b) => b.callback_data === 'chat:2'));
      assert.ok(await store.getMatch(1, 2));
      // Matches-Liste
      await say(1, '6');
      assert.match(tg.lastText(1), /Deine Matches \(1\)/);
      // Ben sieht Anna im Browsen nicht mehr
      await say(2, '💤');
      await say(2, '1');
      assert.notEqual(await cur(env, 2), 1);
    });

    test('Gegenseitiges ❤️ beim Browsen erzeugt sofort Match', async () => {
      const env = await setup({ storeKind });
      const { say, tg, register } = env;
      await register(1);
      await register(2);
      await say(1, '1');
      await say(1, B.like);
      await say(2, '1');
      assert.equal(await cur(env, 2), 1);
      await say(2, B.like);
      assert.match(tg.allText(1), /Match!/);
      assert.match(tg.allText(2), /Match!/);
    });

    test('💌 Interesse mit Nachricht wird mitgeliefert, 👎 lehnt ab', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register, store } = env;
      await register(1, { name: 'Anna' });
      await register(2, { name: 'Ben' });
      await register(3, { name: 'Cem' });
      await say(1, '1');
      const target = await cur(env, 1);
      await say(1, B.likeMsg);
      assert.match(tg.lastText(1), /kurze Nachricht/);
      await say(1, 'Hey, Lust auf ein gemeinsames Projekt?');
      await click(target, 'likes');
      assert.match(tg.allText(target), /Nachricht an dich:[\s\S]*gemeinsames Projekt/);
      await say(target, B.skipCard);
      assert.equal((await store.getLike(1, target)).answered, 1);
      assert.match(tg.lastText(target), /Keine offenen Interessen/);
      assert.equal(await store.getMatch(1, target), null);
    });

    test('Anonymer Relay-Chat, /ende, Benachrichtigung außerhalb des Chats', async () => {
      const env = await setup({ storeKind, env: { ADMIN_IDS: '' } });
      const { say, tg, click, register, photo } = env;
      await register(1, { name: 'Anna', age: 19 });
      await register(2, { name: 'Ben', age: 22 });
      await say(1, '1');
      await say(1, B.like);
      await click(2, 'likes');
      await say(2, B.like);
      await click(1, 'chat:2');
      assert.match(tg.lastText(1), /Chat mit Ben/);
      tg.clear();
      // Ben ist nicht im Chat -> Benachrichtigung mit Antworten-Button
      await say(1, 'Hi Ben, schreib mir hier! www.vertex.de');
      assert.match(tg.lastText(2), /Neue Nachricht von Anna[\s\S]*Hi Ben/);
      assert.ok(tg.inlineButtons(2).some((b) => b.callback_data === 'chat:1'));
      assert.ok(!tg.allText(2).includes('user1'), 'kein Username geleakt');
      await click(2, 'chat:1');
      tg.clear();
      await say(2, 'Hallo Anna!');
      assert.equal(tg.lastText(1), '💬 <b>Ben:</b> Hallo Anna!');
      await say(1, 'Super 🚀');
      assert.equal(tg.lastText(2), '💬 <b>Anna:</b> Super 🚀');
      await photo(1, 'pic', 'Mein Mockup');
      const copy = tg.calls.find((c) => c.method === 'copyMessage');
      assert.equal(copy.params.chat_id, 2);
      assert.equal(copy.params.from_chat_id, 1);
      // Username teilen (18+): erst nach Zustimmung beider
      await say(1, B.share);
      assert.ok(!tg.allText(1).includes('@user2'));
      await click(2, 'share:1');
      assert.match(tg.allText(1), /@user2/);
      assert.match(tg.allText(2), /@user1/);
      // Chat verlassen
      await say(1, '/ende');
      assert.match(tg.lastText(1), /Menü/);
      tg.clear();
      await say(1, 'Das ist jetzt keine Chatnachricht');
      assert.equal(tg.sent(2).length, 0);
    });

    test('Unter 18: Kontaktdaten im Chat werden blockiert, kein Username-Tausch', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register } = env;
      await register(1, { name: 'Mia', age: 15 });
      await register(2, { name: 'Tom', age: 16 });
      await say(1, '1');
      await say(1, B.like);
      await click(2, 'likes');
      await say(2, B.like);
      await click(1, 'chat:2');
      await click(2, 'chat:1');
      tg.clear();
      for (const bad of ['Ruf an: 0176 1234 5678', 'schreib mir auf t.me/tom', 'mein insta @tom_official', 'mail: tom@example.com', 'https://evil.example']) {
        await say(1, bad);
        assert.match(tg.lastText(1), /Nicht gesendet/, bad);
      }
      assert.equal(tg.sent(2).length, 0, 'nichts zugestellt');
      await say(1, 'Wollen wir zusammen ein Logo bauen? Ich bin 15 und seit 2024 dabei.');
      assert.match(tg.lastText(2), /Mia:.*Logo/);
      await say(1, B.share);
      assert.match(tg.lastText(1), /unter 18 .*deaktiviert/);
      assert.ok(!tg.lastKeyboard(1).includes(B.share));
    });

    test('Altersgruppen sind strikt getrennt', async () => {
      const env = await setup({ storeKind });
      const { say, tg, register } = env;
      await register(1, { age: 15 });
      await register(2, { age: 17 });
      await register(3, { age: 18 });
      await register(4, { age: 30 });
      const seenBy = async (id) => {
        const seen = [];
        await say(id, '1');
        for (let i = 0; i < 5; i++) {
          const c = await cur(env, id);
          if (!c || (await env.store.getUser(id)).state !== 'browse') break;
          seen.push(c);
          await say(id, B.skipCard);
        }
        await say(id, B.sleep);
        return seen.sort();
      };
      assert.deepEqual(await seenBy(1), [2]);
      assert.deepEqual(await seenBy(2), [1]);
      assert.deepEqual(await seenBy(3), [4]);
      assert.deepEqual(await seenBy(4), [3]);
      // Erzwungener Chat über fremde Callback-Daten geht nicht
      await env.click(1, 'chat:4');
      assert.match(tg.lastText(1), /nicht \(mehr\) möglich/);
      // Wechsel der Altersgruppe über /neu löscht alte Matches
      env.clock.t += 25 * 3600_000;
      await say(1, '1');
      await say(1, B.like);
      await env.click(2, 'likes');
      await say(2, B.like);
      assert.ok(await env.store.getMatch(1, 2));
      await say(1, '/neu');
      await say(1, 'Name1');
      await say(1, '19');
      await say(1, 'Hamburg');
      await say(1, '🚀 Gründer');
      await say(1, '🔀 Egal');
      await say(1, B.keep);
      await say(1, B.keep);
      await say(1, B.keep);
      await say(1, B.skip);
      await say(1, B.skip);
      await say(1, B.confirm);
      assert.match(tg.allText(1), /Altersgruppe hat sich geändert/);
      assert.equal(await env.store.getMatch(1, 2), null);
    });

    test('Blockieren & Melden: Admin wird informiert, Bann wirkt', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register, store } = env;
      await register(1, { name: 'Anna', age: 20 });
      await register(2, { name: 'Spammer', age: 20 });
      await register(3, { name: 'Cem', age: 20 });
      await register(999, { name: 'Admin', age: 20 });
      // Anna blockiert Cem
      await say(1, '1');
      while ((await cur(env, 1)) !== 3) await say(1, B.skipCard);
      await say(1, B.block);
      assert.ok(await store.isBlocked(1, 3));
      env.clock.t += 48 * 3600_000;
      await say(3, '1');
      const cemSeen = [await cur(env, 3)];
      await say(3, B.skipCard);
      cemSeen.push(await cur(env, 3));
      assert.ok(!cemSeen.includes(1), 'Blockierte sehen sich nicht');
      // Anna meldet Spammer
      await say(1, '💤');
      await say(1, '1');
      while ((await cur(env, 1)) !== 2) await say(1, B.skipCard);
      await say(1, B.report);
      assert.match(tg.lastText(1), /Warum meldest du/);
      await say(1, REPORT_REASONS[0]);
      assert.match(tg.allText(1), /Danke!/);
      assert.match(tg.allText(999), /Neue Meldung[\s\S]*Spammer[\s\S]*Spam\/Werbung/);
      assert.ok(tg.inlineButtons(999).some((b) => b.callback_data === 'ban:2'));
      // Nicht-Admin darf nicht bannen
      await say(3, '/admin_bann 2');
      assert.match(tg.lastText(3), /Nur für Admins/);
      // Admin bannt
      await say(999, '/admin_bann 2 Spam');
      assert.match(tg.lastText(999), /gebannt/);
      assert.ok(await store.isBanned(2));
      await say(2, '1');
      assert.match(tg.lastText(2), /gesperrt/);
      env.clock.t += 48 * 3600_000;
      await say(3, '💤');
      await say(3, '1');
      const seen = [];
      for (let i = 0; i < 4 && (await store.getUser(3)).state === 'browse'; i++) {
        seen.push(await cur(env, 3));
        await say(3, B.skipCard);
      }
      assert.ok(!seen.includes(2), 'Gebannte werden nicht angezeigt');
      await say(999, '/admin_stats');
      assert.match(tg.lastText(999), /Statistik[\s\S]*Bans: 1/);
      await say(999, '/admin_entbann 2');
      assert.equal(await store.isBanned(2), false);
    });

    test('Melden & Blockieren im Chat beendet den Relay', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register } = env;
      await register(1, { age: 25 });
      await register(2, { age: 25 });
      await say(1, '1');
      await say(1, B.like);
      await click(2, 'likes');
      await say(2, B.like);
      await click(1, 'chat:2');
      await say(1, B.block);
      assert.match(tg.allText(1), /Blockiert/);
      tg.clear();
      await click(2, 'chat:1');
      assert.match(tg.lastText(2), /nicht \(mehr\) möglich/);
      await click(1, 'chat:2');
      assert.match(tg.lastText(1), /nicht \(mehr\) möglich/);
    });

    test('Pausieren versteckt das Profil, Aktivieren zeigt es wieder', async () => {
      const env = await setup({ storeKind });
      const { say, tg, register } = env;
      await register(1);
      await register(2);
      await say(2, '5');
      assert.match(tg.allText(2), /pausiert/);
      await say(1, '1');
      assert.match(tg.lastText(1), /keine neuen Profile/);
      await say(2, '1');
      assert.match(tg.lastText(2), /pausiert/);
      await say(2, '5');
      assert.match(tg.allText(2), /wieder <b>aktiv/);
      await say(1, '1');
      assert.equal(await cur(env, 1), 2);
    });

    test('Foto & Text ändern', async () => {
      const env = await setup({ storeKind });
      const { say, register, photo, store } = env;
      await register(1);
      await say(1, '3');
      await photo(1, 'neu');
      assert.equal((await store.getUser(1)).photo, 'neu');
      await say(1, '4');
      await say(1, B.editAbout);
      await say(1, 'Neue Beschreibung für mein Projekt 🚀');
      assert.equal((await store.getUser(1)).about, 'Neue Beschreibung für mein Projekt 🚀');
      await say(1, '3');
      await say(1, B.removePhoto);
      assert.equal((await store.getUser(1)).photo, null);
    });

    test('/loeschen mit Bestätigung entfernt Profil und Matches', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register, store } = env;
      await register(1);
      await register(2);
      await say(1, '1');
      await say(1, B.like);
      await click(2, 'likes');
      await say(2, B.like);
      await say(1, '/loeschen');
      assert.match(tg.lastText(1), /wirklich löschen/);
      await say(1, B.cancel);
      assert.ok(await store.getUser(1));
      await say(1, '/loeschen');
      await say(1, B.deleteYes);
      assert.match(tg.lastText(1), /gelöscht/);
      assert.equal(await store.getUser(1), null);
      assert.equal(await store.getMatch(1, 2), null);
      await say(2, '1');
      assert.match(tg.lastText(2), /keine neuen Profile/);
      await say(1, '/start');
      assert.match(tg.lastText(1), /Regeln/);
    });

    test('Rate-Limits: Likes pro Tag und Nachrichten pro Minute', async () => {
      const env = await setup({ storeKind, env: { LIKES_PER_DAY: '2', MSGS_PER_MINUTE: '3' } });
      const { say, tg, click, register } = env;
      for (const id of [1, 2, 3, 4]) await register(id, { age: 30 });
      await say(1, '1');
      await say(1, B.like);
      await say(1, B.like);
      await say(1, B.like);
      assert.match(tg.allText(1), /heute schon 2×/);
      // Chat-Limit
      const liked = (await env.store.listMatches(1)).length;
      assert.equal(liked, 0);
      const firstLiked = tg.calls.filter((c) => /Jemand hat Interesse/.test(c.params.text || '')).map((c) => c.params.chat_id)[0];
      await click(firstLiked, 'likes');
      await say(firstLiked, B.like);
      await click(1, `chat:${firstLiked}`);
      for (let i = 0; i < 4; i++) await say(1, 'Nachricht ' + i);
      assert.match(tg.lastText(1), /Langsamer/);
      env.clock.t += 61_000;
      await say(1, 'wieder ok');
      assert.match(tg.lastText(firstLiked), /wieder ok/);
    });

    test('Nicht zustellbare Nachricht wird gemeldet, Fehler crashen nicht', async () => {
      const env = await setup({ storeKind });
      const { say, tg, click, register } = env;
      await register(1, { age: 25 });
      await register(2, { age: 25 });
      await say(1, '1');
      await say(1, B.like);
      await click(2, 'likes');
      await say(2, B.like);
      await click(1, 'chat:2');
      tg.unreachable.add(2);
      await say(1, 'Hallo?');
      assert.match(tg.lastText(1), /nicht zugestellt/);
    });
  });
}
