import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { buildDeck, parseSlides } from '../public/deck.js';

test('Folien werden getrennt, Thema und Notizen erkannt', () => {
  const d = parseSlides('theme: wald\n# Titel\nUnter\n---\n## A\n- x\nNotiz: sag was\n---\n## B');
  assert.equal(d.theme, 'wald');
  assert.equal(d.title, 'Titel');
  assert.equal(d.slides.length, 3);
  assert.equal(d.slides[1].notes, 'sag was');
  assert.ok(!d.slides[1].md.includes('Notiz'));
});

test('Unbekanntes Thema → Standard, leere Folien fallen weg', () => {
  const d = parseSlides('theme: lila\n# T\n---\n\n---\n## Z');
  assert.equal(d.theme, 'nacht');
  assert.equal(d.slides.length, 2);
});

test('Präsentation enthält kein eingeschleustes HTML oder javascript:-Links', () => {
  const html = buildDeck('# Hi\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1))\n![b](data:image/png;base64,AAA)', { Marked });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/<script>alert/.test(html));
  assert.ok(!/<img src=x/.test(html));
  assert.ok(!/href="javascript/i.test(html));
  assert.ok(!/data:image\/png/.test(html));
  assert.match(html, /<title>Hi<\/title>/);
});
