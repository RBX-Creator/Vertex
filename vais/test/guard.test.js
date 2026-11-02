// Schutz gegen Limit-Diebstahl (ohne Server)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-guard-')), 'g.db')}`;
const g = await import('../src/guard.js');
const req = (ip, id = 1) => ({ ip, user: { id } });

test('Neue Konten: höchstens 6 pro Netz und Tag', () => {
  g.__resetGuard();
  for (let i = 0; i < 6; i++) g.signupGuard(req('1.2.3.4'), `a${i}@example.com`);
  assert.throws(() => g.signupGuard(req('1.2.3.4'), 'zu@example.com'), /viele Konten|Many accounts/);
  g.signupGuard(req('5.6.7.8'), 'b@example.com'); // anderes Netz geht
  assert.throws(() => g.signupGuard(req('9.9.9.9'), 'x@yopmail.com'), /Wegwerf|disposable/);
});

test('Codes: höchstens 8 pro Adresse und Tag', () => {
  g.__resetGuard();
  for (let i = 0; i < 8; i++) g.codeGuard(req(`10.0.0.${i}`), 'opfer@example.com');
  assert.throws(() => g.codeGuard(req('10.0.1.1'), 'opfer@example.com'), /zu viele Codes|Too many codes/);
});

test('Helfer-Funktionen: Tagesgrenze pro Konto', () => {
  g.__resetGuard();
  for (let i = 0; i < 120; i++) g.helperQuota(req('2.2.2.2', 7), 'improve');
  assert.throws(() => g.helperQuota(req('2.2.2.2', 7), 'improve'), /ausgeschöpft|used up/);
  g.helperQuota(req('2.2.2.2', 8), 'improve'); // anderes Konto geht noch
});

test('Viele Konten aus einem Netz: Grenze greift, Rückgabe zählt zurück', () => {
  g.__resetGuard();
  for (let i = 0; i < 1000; i++) g.ipAnswerQuota('3.3.3.3', 'text', 100);
  assert.throws(() => g.ipAnswerQuota('3.3.3.3', 'text', 100), /deinem Netz|your network/);
  g.undoIpAnswer('3.3.3.3', 'text');
  g.ipAnswerQuota('3.3.3.3', 'text', 100);
});
