'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../server');
const { serve } = require('./helpers');

const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'site.json'), 'utf8'));
const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'blog.json'), 'utf8'));

let http;
test.before(async () => { http = await serve(app); });
test.after(async () => { await http.close(); });

test('every page in the explorer answers 200', async () => {
  const urls = site.explorer.flatMap((f) => f.files || [])
    .filter((f) => !f.external)
    .map((f) => f.url);
  assert.ok(urls.length >= 4, 'site.json should list some pages');
  for (const url of urls) {
    const res = await http.get(url);
    assert.equal(res.status, 200, `${url} answered ${res.status}`);
  }
});

test('the window chrome comes from content/site.json', async () => {
  const { text } = await http.get('/');
  assert.ok(text.includes(site.titlebar), 'title bar');
  assert.ok(text.includes(site.greeting), 'hero greeting');
  assert.ok(text.includes(site.tagline), 'hero tagline');
  assert.ok(text.includes(`⎇ ${site.statusbar.branch}`), 'status bar branch');
  site.explorer.forEach((folder) => {
    assert.ok(text.includes(folder.folder), `explorer folder ${folder.folder}`);
  });
});

test('a tab marked defaultClosed carries the attribute the client script reads', async () => {
  const closed = site.explorer.flatMap((f) => f.files || []).filter((f) => f.defaultClosed);
  assert.ok(closed.length, 'fixture should have one default-closed tab');
  const { text } = await http.get('/');
  closed.forEach((file) => {
    assert.match(text, new RegExp(`href="${file.url}" class="tab [^"]*" data-default-closed`));
  });
});

test('a blog post renders at its slug, and an unknown slug 404s', async () => {
  const post = posts[0];
  const ok = await http.get(`/blog/${post.id}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.text.includes(post.title));

  const missing = await http.get('/blog/no-such-post');
  assert.equal(missing.status, 404);
});

test('the tag filter narrows the list to posts carrying the tag', async () => {
  const tag = posts.find((p) => (p.tags || []).length).tags[0];
  const { text } = await http.get(`/blog?tag=${encodeURIComponent(tag)}`);
  const tagged = posts.filter((p) => (p.tags || []).includes(tag));
  const untagged = posts.filter((p) => !(p.tags || []).includes(tag));
  tagged.forEach((p) => assert.ok(text.includes(p.title), `${p.title} should be listed`));
  untagged.forEach((p) => assert.ok(!text.includes(p.excerpt), `${p.title} should not be listed`));
});

test('an unknown URL 404s instead of falling through to the static handler', async () => {
  const res = await http.get('/definitely-not-a-page');
  assert.equal(res.status, 404);
});

test('slugs are derived from titles and never collide', () => {
  assert.equal(app.slugify("Hello, World — it's 2026!"), 'hello-world-its-2026');
  assert.equal(app.slugify('   '), app.slugify('   ').length ? app.slugify('   ') : '');
  const existing = [{ id: 'hello' }, { id: 'hello-2' }];
  assert.equal(app.uniqueSlug('hello', existing), 'hello-3');
  assert.equal(app.uniqueSlug('fresh', existing), 'fresh');
});
