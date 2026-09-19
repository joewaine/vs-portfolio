'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../server');
const dillo = require('../dillo');
const { serve } = require('./helpers');

const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'site.json'), 'utf8'));
const publicUrls = site.explorer.flatMap((f) => f.files || []).filter((f) => !f.external).map((f) => f.url);

let http;
test.before(async () => { http = await serve(app); });
test.after(async () => { await http.close(); });

// The rule this file exists to enforce: a new public page needs a views/lite
// twin, or no-JavaScript browsers get the flexbox template and an unstyled pile.
test('every public page has a views/lite twin', async () => {
  const missing = [];
  for (const url of publicUrls.concat(['/blog/' + JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'content', 'blog.json'), 'utf8'))[0].id])) {
    const { text } = await http.get(url + (url.includes('?') ? '&' : '?') + 'lite=1');
    if (!text.includes('/css/dillo.css')) missing.push(url);
  }
  assert.deepEqual(missing, [], `no lite twin for: ${missing.join(', ')}`);
});

test('lite pages carry no script tags at all', async () => {
  for (const url of publicUrls) {
    const { text } = await http.get(`${url}?lite=1`);
    assert.ok(!/<script/i.test(text), `${url} has a <script> in lite mode`);
  }
});

test('a no-JavaScript browser gets lite mode without asking', async () => {
  const { text } = await http.get('/', { headers: { 'User-Agent': 'Dillo/3.5.0' } });
  assert.ok(text.includes('/css/dillo.css'));
  assert.ok(!/<script/i.test(text));
});

test('?lite=0 opts back out, and the choice sticks in a cookie', async () => {
  const res = await http.get('/?lite=0', { headers: { 'User-Agent': 'Dillo/3.5.0' } });
  assert.ok(res.text.includes('/css/style.css'), 'should be the full stylesheet');
  assert.match(res.headers.get('set-cookie') || '', /lite=0/);

  const on = await http.get('/?lite=1');
  assert.match(on.headers.get('set-cookie') || '', /lite=1/);
  assert.match(on.headers.get('vary') || '', /User-Agent/);
});

test('internal links in lite mode keep ?lite=1, so the mode survives cookies being off', async () => {
  const { text } = await http.get('/?lite=1');
  // Page links only: a link to a file (a PDF, an image) is not a page and has
  // no lite version to stay inside.
  const internal = [...text.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1])
    .filter((href) => !/\.[a-z0-9]{2,4}($|\?)/i.test(href));
  assert.ok(internal.length, 'the lite home page should link somewhere');
  internal.forEach((href) => {
    assert.match(href, /[?&]lite=[01]/, `${href} loses lite mode`);
  });
});

test('the view-name guard refuses to escape views/lite', () => {
  assert.equal(dillo.hasLiteView('../admin/index'), false);
  assert.equal(dillo.hasLiteView('index'), true);
});

test('liteHref leaves external links alone', () => {
  assert.equal(dillo.liteHref('https://example.com'), 'https://example.com');
  assert.equal(dillo.liteHref('/about'), '/about?lite=1');
});
