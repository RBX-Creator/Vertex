// Kontostand-Tool: Beträge, Kontostand eintragen, Verlauf, Monate, Text für Agent X
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-ledger-')), 'l.db')}`;
const L = await import('../src/ledger.js');

test('Beträge werden sicher in Cent gelesen (deutsches und englisches Format)', () => {
  assert.equal(L.parseCents('12,50'), 1250);
  assert.equal(L.parseCents('-4,99'), -499);
  assert.equal(L.parseCents('1.000,99'), 100099);
  assert.equal(L.parseCents('+3.2'), 320);
  assert.equal(L.parseCents('7 €'), 700);
  assert.equal(L.parseCents(-12.5), -1250);
  assert.ok(Number.isNaN(L.parseCents('abc')));
  assert.ok(Number.isNaN(L.parseCents('1,234,5')));
});

test('Buchen, Kontostand eintragen, Verlauf und Monate', async () => {
  const uid = 1;
  await L.setBalance(uid, { balance: '250,00', day: '2026-10-01' });
  await L.addEntry(uid, { amount: '-12,50', note: 'Kino', day: '2026-10-05' });
  await L.addEntry(uid, { amount: '20', note: 'Taschengeld', day: '2026-11-01' });
  let l = await L.ledgerOf(uid);
  assert.equal(l.balance, 25750);
  assert.equal(l.count, 3);
  assert.equal(l.entries[0].note, 'Taschengeld'); // neueste zuerst
  assert.deepEqual(l.series.map((p) => p.value), [25000, 23750, 25750]);
  assert.deepEqual(l.months, [{ month: '2026-10', plus: 0, minus: 1250 }, { month: '2026-11', plus: 2000, minus: 0 }]); // Korrektur zählt nicht als Einnahme
  // Kontostand neu eintragen → Korrektur mit der Differenz
  await L.setBalance(uid, { balance: '300', day: '2026-11-02' });
  l = await L.ledgerOf(uid);
  assert.equal(l.balance, 30000);
  assert.equal(l.entries[0].kind, 'set');
  assert.equal(l.entries[0].amount, 4250);
  await L.removeEntry(uid, l.entries[0].id);
  assert.equal((await L.ledgerOf(uid)).balance, 25750);
  await assert.rejects(L.addEntry(uid, { amount: '0' }), /gültigen Betrag/);
  await assert.rejects(L.addEntry(uid, { amount: 'viel' }), /gültigen Betrag/);
  // andere Nutzer sehen nichts und können nichts löschen
  assert.equal((await L.ledgerOf(2)).count, 0);
  await L.removeEntry(2, l.entries[1].id);
  assert.equal((await L.ledgerOf(uid)).count, 3);
});

test('Agent X: Kontostand lesen und auf Wunsch buchen', async () => {
  const uid = 3;
  assert.match(await L.ledgerText(uid), /noch nichts eingetragen/);
  assert.match(await L.ledgerAddText(uid, { betrag: 50, notiz: 'Geburtstag' }), /Gebucht: \+50,00\s€.*Neuer Kontostand: 50,00\s€/);
  assert.match(await L.ledgerAddText(uid, { betrag: -7.5, notiz: 'Döner' }), /Gebucht: −7,50\s€.*42,50\s€/);
  const text = await L.ledgerText(uid);
  assert.match(text, /Aktueller Kontostand: 42,50\s€/);
  assert.match(text, /Döner/);
});
