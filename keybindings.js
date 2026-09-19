'use strict';

/**
 * The site's keyboard shortcuts, rendered at /keybindings as a VS Code
 * keybindings.json. The bindings themselves live in public/js/edit.js
 * (COMMANDS); test/keybindings.test.js keeps the two lists in step.
 *
 * `key` is the Windows/Linux binding and `mac` the macOS one, as in a VS Code
 * extension's keybinding contribution. `reserved` is the alt-based binding
 * that works in a browser when the real one never reaches the page.
 */
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];

const ENTRIES = [
  { command: 'workbench.action.quickOpen', label: 'Go to File...', key: 'ctrl+p', mac: 'cmd+p' },
  { command: 'workbench.action.showCommands', label: 'Show All Commands', key: 'ctrl+shift+p', mac: 'cmd+shift+p' },
  {
    command: 'workbench.action.reopenClosedEditor', label: 'View: Reopen Closed Editor',
    key: 'ctrl+shift+t', mac: 'cmd+shift+t', reserved: 'alt+shift+t',
    why: 'it reopens its own last-closed tab instead',
  },
  {
    command: 'workbench.action.closeActiveEditor', label: 'View: Close Editor',
    key: 'ctrl+w', mac: 'cmd+w', reserved: 'alt+shift+w', when: 'activeEditor',
    why: 'it closes its own tab instead',
  },
  {
    command: 'workbench.action.closeAllEditors', label: 'View: Close All Editors',
    key: 'ctrl+k ctrl+w', mac: 'cmd+k cmd+w', also: 'ctrl+k w / cmd+k w',
  },
  {
    command: 'workbench.action.nextEditor', label: 'View: Open Next Editor',
    key: 'ctrl+pagedown', mac: 'cmd+alt+right', reserved: 'alt+shift+right',
    why: 'it switches its own tabs instead',
  },
  {
    command: 'workbench.action.previousEditor', label: 'View: Open Previous Editor',
    key: 'ctrl+pageup', mac: 'cmd+alt+left', reserved: 'alt+shift+left',
    why: 'it switches its own tabs instead',
  },
  { command: 'workbench.action.toggleSidebarVisibility', label: 'View: Toggle Primary Side Bar Visibility', key: 'ctrl+b', mac: 'cmd+b' },
  { command: 'workbench.action.openGlobalKeybindingsFile', label: 'Preferences: Open Keyboard Shortcuts (JSON)', key: 'ctrl+k ctrl+s', mac: 'cmd+k cmd+s' },
  { command: 'workbench.action.files.save', label: 'File: Save', key: 'ctrl+s', mac: 'cmd+s', when: "resourceFilename == 'keybindings.json'" },
  ...ORDINALS.map((ordinal, i) => ({
    command: `workbench.action.openEditorAtIndex${i + 1}`,
    label: `View: Open ${ordinal} Editor in Group`,
    key: `alt+${i + 1}`,
    mac: `ctrl+${i + 1}`,
  })),
  { command: 'site.toggleEditing', label: 'Edit: Toggle Editing This Page', paletteOnly: true },
  { command: 'site.openDilloVersion', label: 'View: Open Plain HTML Version (Dillo)', paletteOnly: true },
  { command: 'site.resetKeybindings', label: 'Preferences: Reset Keyboard Shortcuts to Defaults', paletteOnly: true },
];

const HEADER = [
  'Place your key bindings in this file to override the defaults',
  '',
  'Browsers keep a few of these (ctrl/cmd+shift+t, ctrl/cmd+w, tab switching)',
  'for themselves, and a web page never sees those keys. Every reserved',
  'binding is left below, commented out, above the alt-based one that',
  'actually works. "key" is Windows/Linux, "mac" is macOS.',
  '',
  'Not a key, but: the tabs up top drag to reorder, same as the real editor.',
  '',
  'This file is live. Click "edit this page" (bottom right), change a key or',
  'a command, then ctrl/cmd+s. It is validated first — unknown commands, bad',
  'key syntax and duplicate bindings are refused — and saved to this browser',
  'only. On a Mac the "mac" column is the one that counts (the dimmed column',
  'is the other platform). "reset" restores the defaults.',
];

// A line is a list of [tokenType, text] pairs; tokenType is one of
// comment | punct | key | string | plain.
function comment(text) {
  return [['comment', text ? `// ${text}` : '//']];
}

// The quotes are punctuation, not part of the string token: on the page only
// the value between them is editable.
function pair(name, value) {
  return [['key', `"${name}"`], ['punct', ': "'], ['string', value], ['punct', '"']];
}

function entryTokens(fields, trailing) {
  const tokens = [['punct', '  { ']];
  fields.forEach(([name, value], i) => {
    if (i) tokens.push(['punct', ', ']);
    tokens.push(...pair(name, value));
  });
  tokens.push(['punct', ' },']);
  if (trailing) tokens.push(['plain', ' '], ['comment', `// ${trailing}`]);
  return tokens;
}

function commentedEntry(fields) {
  const text = fields.map(([name, value]) => `"${name}": "${value}"`).join(', ');
  return [['comment', `  // { ${text} },`]];
}

function lines() {
  const out = HEADER.map(comment);
  out.push([['punct', '[']]);

  const bound = ENTRIES.filter((e) => !e.paletteOnly);
  bound.forEach((entry) => {
    const fields = [['key', entry.key], ['mac', entry.mac], ['command', entry.command]];
    if (entry.when) fields.push(['when', entry.when]);
    if (entry.reserved) {
      out.push([['comment', `  // Reserved by the browser: ${entry.why}.`]]);
      out.push(commentedEntry(fields));
      const fallback = [['key', entry.reserved], ['command', entry.command]];
      if (entry.when) fallback.push(['when', entry.when]);
      out.push(entryTokens(fallback, entry.label));
    } else {
      out.push(entryTokens(fields, entry.also ? `${entry.label} (${entry.also} works too)` : entry.label));
    }
  });

  const paletteOnly = ENTRIES.filter((e) => e.paletteOnly);
  if (paletteOnly.length) {
    out.push([['comment', '  // No default binding — run these from the command palette:']]);
    const width = Math.max(...paletteOnly.map((e) => e.command.length)) + 2;
    paletteOnly.forEach((e) => {
      out.push([['comment', `  //   ${e.command.padEnd(width)}${e.label}`]]);
    });
  }

  out.push([['punct', ']']]);
  return out;
}

function text() {
  return lines().map((line) => line.map(([, t]) => t).join('')).join('\n');
}

module.exports = { ENTRIES, lines, text };
