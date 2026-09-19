'use strict';

// keybindings.js is the page at /keybindings; public/js/edit.js is what actually
// binds the keys. This file is the thing that keeps the two from drifting.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const keybindings = require('../keybindings');

const editJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'edit.js'), 'utf8');

// Labels edit.js registers in its COMMANDS table (the openEditorAtIndex ones
// are built from ORDINALS at runtime, so expand them the same way here).
function commandLabelsInEditJs() {
  const labels = [...editJs.matchAll(/^\s*\{ id: '[^']+', command: '[^']+', label: '([^']+)'/gm)].map((m) => m[1]);
  const ordinals = /const ORDINALS = \[([^\]]+)\]/.exec(editJs)[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
  ordinals.forEach((o) => labels.push(`View: Open ${o} Editor in Group`));
  return labels;
}

test('keybindings.json lists exactly the commands edit.js registers', () => {
  assert.deepEqual(keybindings.ENTRIES.map((e) => e.label).sort(), commandLabelsInEditJs().sort());
});

test('every command id in keybindings.json exists in edit.js, and vice versa', () => {
  const ids = [...editJs.matchAll(/command: '([^']+)'/g)].map((m) => m[1]).filter((id) => !id.endsWith('openEditorAtIndex'));
  for (let n = 1; n <= 9; n++) ids.push(`workbench.action.openEditorAtIndex${n}`);
  assert.deepEqual(keybindings.ENTRIES.map((e) => e.command).sort(), [...new Set(ids)].sort());
});

test('every browser-reserved binding is shown commented out above its working fallback', () => {
  const lines = keybindings.text().split('\n');
  keybindings.ENTRIES.filter((e) => e.reserved).forEach((e) => {
    const reservedLine = lines.findIndex((l) => l.startsWith('  // {') && l.includes(`"${e.mac}"`) && l.includes(e.command));
    const fallbackLine = lines.findIndex((l) => l.startsWith('  {') && l.includes(`"key": "${e.reserved}"`) && l.includes(e.command));
    assert.ok(reservedLine >= 0, `${e.command}: reserved binding missing`);
    assert.equal(fallbackLine, reservedLine + 1, `${e.command}: fallback should directly follow the reserved line`);
  });
});

test('the fallback keys in keybindings.json are the ones edit.js actually binds', () => {
  keybindings.ENTRIES.filter((e) => e.reserved).forEach((e) => {
    const bound = e.reserved.replace(/right$/, 'arrowright').replace(/left$/, 'arrowleft');
    assert.ok(editJs.includes(`'${bound}'`), `${e.reserved} not bound in edit.js`);
  });
});

test('the page body is valid JSONC once comments are stripped', () => {
  const stripped = keybindings.text().split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .map((l) => l.replace(/\s*\/\/.*$/, ''))
    .join('\n')
    .replace(/,(\s*\])/g, '$1');
  const parsed = JSON.parse(stripped);
  assert.ok(Array.isArray(parsed) && parsed.length >= 10);
  parsed.forEach((b) => assert.ok(b.key && b.command, JSON.stringify(b)));
});

test('the view renders highlighted lines with a gutter', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'keybindings.ejs'), {
    site: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'site.json'), 'utf8')),
    adminEnabled: false,
    page: 'keybindings',
    title: 'keybindings.json',
    lines: keybindings.lines(),
  });
  assert.match(html, /<pre class="kb-file"/);
  assert.equal((html.match(/class="kb-line"/g) || []).length, keybindings.lines().length);
});

test('⌘K ⌘S and the palette open the file', () => {
  assert.match(editJs, /label: 'Preferences: Open Keyboard Shortcuts \(JSON\)', keys: \['mod\+k mod\+s'\], run: \(\) => navigateTo\('\/keybindings'\)/);
});
