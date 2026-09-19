/**
 * Plain-HTML ("lite") mode.
 *
 * The normal site is a VS Code pastiche built on flexbox, CSS custom properties
 * and a bit of JavaScript. Dillo (dillo-browser.org) runs no JavaScript and
 * implements roughly CSS 2.1 — no flexbox, no custom properties — so the normal
 * site renders as an unstyled pile there. This middleware serves the same
 * content from `views/lite/*` with a CSS 2.1 stylesheet and zero script tags.
 *
 * It turns on when:
 *   - the User-Agent is a known no-JS browser (Dillo, NetSurf, Lynx, w3m, …), or
 *   - the request carries `?lite=1` (the "plain version" link), or
 *   - a previous `?lite=1` set the `lite` cookie.
 * `?lite=0` opts back out. Dillo denies cookies by default, which is why the
 * lite templates also carry `?lite=1` on their internal links via the `L()`
 * helper — the mode survives navigation with cookies off.
 *
 * One override does the actual work, so ordinary route handlers stay untouched:
 * res.render('x') renders 'lite/x' when views/lite/x.ejs exists, and the
 * original template otherwise.
 *
 * ADDING A PAGE: give it a views/lite/ twin, or it falls back to the
 * JavaScript-dependent template and renders as a pile in a no-JS browser.
 * test/dillo.test.js fails the build if a public page has no twin.
 */

const fs = require('fs');
const path = require('path');

const LITE_VIEWS_DIR = path.join(__dirname, 'views', 'lite');
const COOKIE_NAME = 'lite';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a year

// Graphical and terminal browsers that render HTML+CSS but execute no JavaScript.
// Dillo is the one this was built for; the others get the same treatment free.
const NO_JS_BROWSER = /\b(dillo|netsurf|lynx|w3m|links|elinks|edbrowse|retawq)\b/i;

const TRUTHY = new Set(['1', 'on', 'true', 'yes']);
const FALSY = new Set(['0', 'off', 'false', 'no']);

const liteViewCache = new Map();

function hasLiteView(view) {
  if (!liteViewCache.has(view)) {
    const file = path.join(LITE_VIEWS_DIR, `${view}.ejs`);
    // path.resolve guards against a view name like '../admin/index' escaping the dir
    const inside = path.resolve(file).startsWith(path.resolve(LITE_VIEWS_DIR) + path.sep);
    liteViewCache.set(view, inside && fs.existsSync(file));
  }
  return liteViewCache.get(view);
}

function readCookie(req, name) {
  const match = String(req.headers.cookie || '')
    .match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

/** `?lite=` on this request: true, false, or null when absent/unparseable. */
function explicitChoice(req) {
  const raw = req.query && req.query.lite;
  if (raw === undefined) return null;
  const value = String(Array.isArray(raw) ? raw[0] : raw).toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return null;
}

function isNoJsBrowser(req) {
  return NO_JS_BROWSER.test(String(req.headers['user-agent'] || ''));
}

function wantsLite(req) {
  const explicit = explicitChoice(req);
  if (explicit !== null) return explicit;
  const cookie = readCookie(req, COOKIE_NAME);
  if (cookie === '1') return true;
  if (cookie === '0') return false;
  return isNoJsBrowser(req);
}

/** Same URL with `lite` forced to `value` — used for the two escape-hatch links. */
function urlWithLite(req, value) {
  const [pathname, search = ''] = String(req.originalUrl || '/').split('?');
  const params = new URLSearchParams(search);
  params.set('lite', value);
  return `${pathname}?${params.toString()}`;
}

/** Link helper for lite templates: keeps `?lite=1` on internal links. */
function liteHref(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return target;
  const [pathname, search = ''] = target.split('?');
  const params = new URLSearchParams(search);
  params.set('lite', '1');
  return `${pathname}?${params.toString()}`;
}

module.exports = function dilloMode() {
  return function dilloModeMiddleware(req, res, next) {
    const lite = wantsLite(req);

    res.locals.lite = lite;
    res.locals.dilloUrl = urlWithLite(req, '1');
    res.locals.fullUrl = urlWithLite(req, '0');
    res.locals.L = lite ? liteHref : (target) => target;
    res.locals.query = req.query || {};
    res.locals.selfUrl = String(req.originalUrl || '/');

    if (explicitChoice(req) !== null) {
      res.append('Set-Cookie',
        `${COOKIE_NAME}=${lite ? '1' : '0'}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`);
    }
    // the same URL renders differently per UA/cookie — keep shared caches honest
    res.append('Vary', 'User-Agent, Cookie');

    if (!lite) return next();

    const render = res.render.bind(res);
    res.render = function renderLite(view, ...rest) {
      return render(hasLiteView(view) ? `lite/${view}` : view, ...rest);
    };

    return next();
  };
};

module.exports.wantsLite = wantsLite;
module.exports.liteHref = liteHref;
module.exports.hasLiteView = hasLiteView;
module.exports.NO_JS_BROWSER = NO_JS_BROWSER;
