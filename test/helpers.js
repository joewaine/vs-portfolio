'use strict';

const http = require('node:http');

/** Starts `app` on a free port and returns a `get`/`post` pair plus `close`. */
async function serve(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { headers = {}, body } = {}) {
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    return { status: res.status, headers: res.headers, text: await res.text() };
  }

  return {
    base,
    get: (path, opts) => request('GET', path, opts),
    post: (path, form, opts = {}) => request('POST', path, {
      ...opts,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(opts.headers || {}) },
      body: new URLSearchParams(form).toString(),
    }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { serve };
