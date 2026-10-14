import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, parseCss, runCli, RULES } from '../src/index.js';

const ids = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();
const io = () => { const o = { s: '', e: '' }; return { o, io: { stdout: { write: (x) => { o.s += x; } }, stderr: { write: (x) => { o.e += x; } } } }; };
const site = (head, body = '<p>x</p>', files = {}) => { const d = mkdtempSync(join(tmpdir(), 'fp-')); mkdirSync(join(d, 'f')); writeFileSync(join(d, 'index.html'), `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`); for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), v); return d; };
const face = (extra = 'font-display:swap;', url = '/f/a.woff2') => `<style>@font-face{font-family:A;src:url(${url}) format("woff2");${extra}} body{font-family:A,sans-serif}</style>`;
const pre = '<link rel="preload" href="/f/a.woff2" as="font" type="font/woff2" crossorigin>';
const files = { 'f/a.woff2': Buffer.alloc(2000) };

test('parseCss: faces, sources, formats, used families and weights', () => {
  const p = parseCss(`/* c */ @font-face { font-family: "My Font"; src: local("x"), url('a.woff2') format('woff2'), url(a.ttf) format("truetype"); font-weight: 200 800; font-style: italic }
    h1 { font: italic bold 2rem/1.1 "My Font", serif } p { font-family: var(--f) } :root { --f: "Other", sans-serif; --w: 600 } b { font-weight: bolder }`);
  assert.equal(p.faces.length, 1); const f = p.faces[0];
  assert.deepEqual([f.family, f.weight, f.style, f.urls.map((u) => u.format)], ['my font', [200, 800], 'italic', ['woff2', 'ttf']]);
  assert.ok(p.used.families.has('my font') && p.used.families.has('other')); assert.ok(p.used.weights.has(700) && p.used.weights.has(600)); assert.ok(p.used.italic);
});
test('good fixture is clean (even at info)', () => assert.deepEqual(ids(check('test/fixtures/good')), []));
test('bad fixture', () => {
  const r = check('test/fixtures/bad', {}, JSON.parse(readFileSync('test/fixtures/bad/.font-pulse.json', 'utf8')));
  assert.deepEqual(ids(r), ['font-display-missing', 'font-google-display', 'font-heavy', 'font-no-preconnect', 'font-no-unicode-range', 'font-no-woff2', 'font-payload', 'font-preload-no-crossorigin', 'font-preload-unused', 'font-unused-face', 'font-unused-weight']);
  assert.ok(r.findings.find((f) => f.rule === 'font-no-woff2').line === 2);
});
test('inline style @font-face with preload is clean', () => assert.deepEqual(ids(check(site(pre + face(), '<p>x</p>', files))), []));
test('missing preload is reported; can be disabled', () => { const d = site(face(), '<p>x</p>', files); assert.deepEqual(ids(check(d)), ['font-not-preloaded']); assert.deepEqual(ids(check(d, {}, { requirePreload: false })), []); });
test('font-display optional/fallback ok, block/auto reported', () => { assert.deepEqual(ids(check(site(pre + face('font-display:optional;'), '', files))), []); assert.deepEqual(ids(check(site(pre + face('font-display:auto;'), '', files))), ['font-display-missing']); });
test('google fonts with display=swap and preconnect is clean', () => assert.deepEqual(ids(check(site('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">'))), []));
test('too many preloads and faces', () => {
  const css = Array.from({ length: 8 }, (_, i) => `@font-face{font-family:A;src:url(/f/${i}.woff2) format("woff2");font-weight:${(i + 1) * 100};font-display:swap}`).join('') + 'body{font-family:A;font-weight:var(--w)}';
  const fs = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f/${i}.woff2`, Buffer.alloc(1000)]));
  const r = check(site(Array.from({ length: 4 }, (_, i) => `<link rel="preload" href="/f/${i}.woff2" as="font" crossorigin>`).join('') + `<style>${css}</style>`, '', fs));
  assert.deepEqual(ids(r), ['font-too-many-faces', 'font-too-many-preloads']);
});
test('bold implied by headings keeps 700 face', () => {
  const st = `<style>@font-face{font-family:A;src:url(/f/a.woff2) format("woff2");font-display:swap}@font-face{font-family:A;src:url(/f/b.woff2) format("woff2");font-weight:700;font-display:swap}body{font-family:A}</style>`;
  assert.deepEqual(ids(check(site(pre + st, '<h1>x</h1>', { ...files, 'f/b.woff2': Buffer.alloc(10) }))), []);
  assert.deepEqual(ids(check(site(pre + st, '<p>x</p>', { ...files, 'f/b.woff2': Buffer.alloc(10) }))), ['font-unused-weight']);
});
test('CLI exit codes and SARIF', async () => {
  const cli = { name: 'font-pulse', version: '1.0.0', configKey: 'fontPulse', rules: RULES, tagline: 't', usage: 'u', help: '', options: {}, run: async ({ dir, config }) => check(dir, {}, config) };
  let t = io(); assert.equal(await runCli(cli, ['test/fixtures/good', '--fail-on', 'info'], t.io), 0);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'sarif', '--fail-on', 'medium'], t.io), 1); assert.equal(JSON.parse(t.o.s).version, '2.1.0');
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/none'], t.io), 2);
});
