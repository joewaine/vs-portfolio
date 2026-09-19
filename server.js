'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const keybindings = require('./keybindings');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_DIR = path.join(__dirname, 'content');

// The admin panel writes to content/*.json. It is OFF until you set a password,
// because a template deployed with a default one is a template with no password.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// --- content ------------------------------------------------------------

function readJSON(filename) {
  const filepath = path.join(CONTENT_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(CONTENT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
}

// site.json drives the window chrome: title bar, tabs, explorer, status bar.
// Read once per request in development so edits show up on reload, and cached
// in production because it does not change between deploys there.
const PRODUCTION = process.env.NODE_ENV === 'production';
let cachedSite = null;
function readSite() {
  if (PRODUCTION && cachedSite) return cachedSite;
  cachedSite = readJSON('site.json');
  return cachedSite;
}

/** A URL slug from a title, falling back to a timestamp if nothing survives. */
function slugify(text) {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || Date.now().toString(36);
}

/** `slug`, or `slug-2`, `slug-3`… when the posts already have one. */
function uniqueSlug(slug, posts) {
  if (!posts.some((p) => p.id === slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-${n}`;
    if (!posts.some((p) => p.id === candidate)) return candidate;
  }
}

function parseTags(raw) {
  return String(raw || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// --- middleware ---------------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Every template gets `site`, so the chrome renders without each route passing it.
app.use((req, res, next) => {
  res.locals.site = readSite();
  // The chrome hides its two links into /admin when there is no password set,
  // rather than pointing visitors at a 503.
  res.locals.adminEnabled = Boolean(ADMIN_PASSWORD);
  next();
});

// Plain-HTML mode for browsers without JavaScript — see dillo.js. Must sit above
// the routes so their res.render() calls go through it.
app.use(require('./dillo')());

// --- public routes ------------------------------------------------------

app.get('/', (req, res) => {
  res.render('index', { page: 'home', projects: readJSON('projects.json') || [] });
});

app.get('/about', (req, res) => {
  res.render('about', { page: 'about', title: 'About', about: readJSON('about.json') });
});

app.get('/blog', (req, res) => {
  let posts = readJSON('blog.json') || [];
  const tag = req.query.tag;
  const allTags = [...new Set(posts.flatMap((p) => p.tags || []))].sort();
  if (tag) posts = posts.filter((p) => (p.tags || []).includes(tag));
  res.render('blog', { page: 'blog', title: 'Blog', posts, allTags, currentTag: tag || null });
});

app.get('/blog/:id', (req, res) => {
  const posts = readJSON('blog.json') || [];
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).render('404', { page: null, title: 'Not found' });
  res.render('post', { page: 'blog', title: post.title, post });
});

app.get('/contact', (req, res) => {
  res.render('contact', { page: 'contact', title: 'Contact', contact: readJSON('contact.json') });
});

app.get('/keybindings', (req, res) => {
  res.render('keybindings', { page: 'keybindings', title: 'keybindings.json', lines: keybindings.lines() });
});

// --- admin --------------------------------------------------------------
//
// A cookie in a Set on this process: it is gone on restart and not shared
// between instances, which is fine for one person editing their own site and
// wrong for anything else. Put a real session store here before you grow.

const sessions = new Set();

function newSessionId() {
  return require('crypto').randomBytes(24).toString('hex');
}

function isAuthenticated(req) {
  const id = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  return Boolean(id) && sessions.has(id);
}

/** 503s the whole admin area when no ADMIN_PASSWORD is set. */
function adminEnabled(req, res, next) {
  if (ADMIN_PASSWORD) return next();
  res.status(503).type('text/plain').send(
    'The admin panel is disabled because ADMIN_PASSWORD is not set.\n\n' +
    'Set it in the environment (locally: ADMIN_PASSWORD=... npm start) and restart.\n' +
    'You can also skip the panel entirely and edit the files in content/ directly.\n'
  );
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).type('text/plain').send('Unauthorized');
  next();
}

app.use('/admin', adminEnabled);

app.get('/admin', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.render('admin/login', { page: 'admin', title: 'Admin', error: null });
  }
  res.render('admin/index', {
    page: 'admin',
    title: 'Admin',
    about: readJSON('about.json'),
    contact: readJSON('contact.json'),
    posts: readJSON('blog.json') || [],
  });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).render('admin/login', { page: 'admin', title: 'Admin', error: 'Invalid password' });
  }
  const id = newSessionId();
  sessions.add(id);
  const secure = PRODUCTION ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `session=${id}; HttpOnly;${secure} Path=/; SameSite=Lax`);
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  const id = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  if (id) sessions.delete(id);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.redirect('/admin');
});

app.post('/admin/about', requireAuth, (req, res) => {
  writeJSON('about.json', {
    title: req.body.title,
    bio: req.body.bio,
    skills: String(req.body.skills || '').split(',').map((s) => s.trim()).filter(Boolean),
    background: req.body.background,
  });
  res.redirect('/admin');
});

app.post('/admin/contact', requireAuth, (req, res) => {
  const existing = readJSON('contact.json') || { social: {} };
  writeJSON('contact.json', {
    message: req.body.message,
    email: req.body.email,
    social: {
      ...existing.social,
      github: req.body.github,
      linkedin: req.body.linkedin,
      twitter: req.body.twitter,
    },
  });
  res.redirect('/admin');
});

app.post('/admin/blog/new', requireAuth, (req, res) => {
  const posts = readJSON('blog.json') || [];
  posts.unshift({
    id: uniqueSlug(slugify(req.body.slug || req.body.title), posts),
    title: req.body.title,
    date: new Date().toISOString().split('T')[0],
    excerpt: req.body.excerpt,
    tags: parseTags(req.body.tags),
    content: req.body.content,
  });
  writeJSON('blog.json', posts);
  res.redirect('/admin');
});

app.post('/admin/blog/edit/:id', requireAuth, (req, res) => {
  const posts = readJSON('blog.json') || [];
  const index = posts.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).type('text/plain').send('No such post');
  posts[index] = {
    ...posts[index],
    title: req.body.title,
    excerpt: req.body.excerpt,
    tags: parseTags(req.body.tags),
    content: req.body.content,
  };
  writeJSON('blog.json', posts);
  res.redirect('/admin');
});

app.post('/admin/blog/delete/:id', requireAuth, (req, res) => {
  const posts = (readJSON('blog.json') || []).filter((p) => p.id !== req.params.id);
  writeJSON('blog.json', posts);
  res.redirect('/admin');
});

// --- 404 ----------------------------------------------------------------

app.use((req, res) => {
  res.status(404).render('404', { page: null, title: 'Not found' });
});

// Exported unstarted so test/ can mount it; started only when run directly.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!ADMIN_PASSWORD) console.log('ADMIN_PASSWORD is not set — /admin is disabled.');
  });
}

module.exports = app;
module.exports.slugify = slugify;
module.exports.uniqueSlug = uniqueSlug;
