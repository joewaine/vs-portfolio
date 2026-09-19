'use strict';

// No ADMIN_PASSWORD in this process: the whole /admin area must be closed.
delete process.env.ADMIN_PASSWORD;

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const { serve } = require('./helpers');

let http;
test.before(async () => { http = await serve(app); });
test.after(async () => { await http.close(); });

test('/admin is 503 until a password is configured', async () => {
  const res = await http.get('/admin');
  assert.equal(res.status, 503);
  assert.ok(res.text.includes('ADMIN_PASSWORD'));
});

test('the admin write endpoints are closed too, not just the page', async () => {
  const res = await http.post('/admin/blog/new', { title: 'x' });
  assert.equal(res.status, 503);
});

test('an empty password cannot be used to log in', async () => {
  const res = await http.post('/admin/login', { password: '' });
  assert.equal(res.status, 503);
});

test('the chrome does not link to the admin panel while it is off', async () => {
  const home = await http.get('/');
  assert.ok(!home.text.includes('href="/admin"'), 'activity bar still links to /admin');
  const blog = await http.get('/blog');
  assert.ok(!blog.text.includes('quick-post-btn'), 'the new-post button is still shown');
});
