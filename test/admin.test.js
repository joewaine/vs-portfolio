'use strict';

// node:test gives each file its own process, so setting the password here does
// not leak into the other suites — which is how they test the disabled case.
process.env.ADMIN_PASSWORD = 'test-password';

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const { serve } = require('./helpers');

let http;
test.before(async () => { http = await serve(app); });
test.after(async () => { await http.close(); });

test('the login page renders, and a wrong password is rejected', async () => {
  const page = await http.get('/admin');
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('Admin Login'));

  const bad = await http.post('/admin/login', { password: 'wrong' });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
});

test('a correct password sets an HttpOnly session cookie and opens the panel', async () => {
  const login = await http.post('/admin/login', { password: 'test-password' });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /^session=[0-9a-f]{48};/);
  assert.match(cookie, /HttpOnly/);

  const panel = await http.get('/admin', { headers: { Cookie: cookie.split(';')[0] } });
  assert.ok(panel.text.includes('Admin Panel'));
});

test('writing endpoints reject a request with no session', async () => {
  for (const url of ['/admin/about', '/admin/contact', '/admin/blog/new', '/admin/blog/delete/x']) {
    const res = await http.post(url, { title: 'nope' });
    assert.equal(res.status, 401, `${url} was not protected`);
  }
});

test('a forged session id is not accepted', async () => {
  const res = await http.get('/admin', { headers: { Cookie: 'session=' + 'a'.repeat(48) } });
  assert.ok(res.text.includes('Admin Login'), 'should fall back to the login page');
});

test('the chrome links to the admin panel once it is on', async () => {
  const home = await http.get('/');
  assert.ok(home.text.includes('href="/admin"'), 'activity bar should link to /admin');
  const blog = await http.get('/blog');
  assert.ok(blog.text.includes('quick-post-btn'), 'the new-post button should be shown');
});
