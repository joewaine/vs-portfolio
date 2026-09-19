(function () {
  const PATH = location.pathname;
  const EDITS_KEY = 'siteEdits:' + PATH;
  const HIDDEN_KEY = 'siteHidden:' + PATH;
  const CLOSED_TABS_KEY = 'closedTabs';
  const TAB_ORDER_KEY = 'tabOrder';
  // Tabs marked data-default-closed in the layout stay hidden until the
  // visitor opens them from the explorer (or lands on the page directly).
  const OPENED_TABS_KEY = 'openedTabs';
  // Explorer folders the visitor collapsed, by folder name, kept across pages.
  const CLOSED_FOLDERS_KEY = 'closedFolders';
  // Pointer must travel this far before a press on a tab becomes a drag,
  // so ordinary clicks (which jitter a px or two) still navigate.
  const TAB_DRAG_THRESHOLD_PX = 4;
  const EDITABLE_CONTAINERS = ['.editor-content'];
  const REMOVABLE_SELECTORS = ['.post-preview', '.skills-list li', '.hero-photo'];

  function getJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function setJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function clearKey(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function getEdits() { return getJSON(EDITS_KEY, {}); }
  function saveEdits(v) { setJSON(EDITS_KEY, v); }
  function getHidden() { return getJSON(HIDDEN_KEY, []); }
  function saveHidden(v) { setJSON(HIDDEN_KEY, v); }
  function getClosedTabs() { return getJSON(CLOSED_TABS_KEY, []); }
  function saveClosedTabs(v) { setJSON(CLOSED_TABS_KEY, v); }
  function getTabOrder() { return getJSON(TAB_ORDER_KEY, []); }
  function saveTabOrder(v) { setJSON(TAB_ORDER_KEY, v); }
  function getOpenedTabs() { return getJSON(OPENED_TABS_KEY, []); }
  function saveOpenedTabs(v) { setJSON(OPENED_TABS_KEY, v); }
  function getClosedFolders() { return getJSON(CLOSED_FOLDERS_KEY, []); }
  function saveClosedFolders(v) { setJSON(CLOSED_FOLDERS_KEY, v); }

  function hasAnyChanges() {
    return Object.keys(getEdits()).length > 0 || getHidden().length > 0;
  }

  // --- Text editing: wrap text nodes so each is independently editable ---
  function wrapTextNodes() {
    let counter = 0;
    EDITABLE_CONTAINERS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((container) => {
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue || !/\S/.test(node.nodeValue)) {
                return NodeFilter.FILTER_REJECT;
              }
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest('script, style, .editable-unit, .site-edit-btn, .site-remove-btn, [data-no-edit]')) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach((textNode) => {
          const span = document.createElement('span');
          span.className = 'editable-unit';
          span.dataset.editId = 'e' + counter;
          span.dataset.editOriginal = textNode.nodeValue;
          counter += 1;
          textNode.parentNode.insertBefore(span, textNode);
          span.appendChild(textNode);
        });
      });
    });
  }

  function applyEdits() {
    const edits = getEdits();
    document.querySelectorAll('.editable-unit').forEach((el) => {
      const id = el.dataset.editId;
      if (Object.prototype.hasOwnProperty.call(edits, id)) {
        el.textContent = edits[id];
      }
    });
  }

  // --- Removable boxes (project cards, skill tags) ---
  function assignRemovableBoxes() {
    let counter = 0;
    REMOVABLE_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.removableId) return;
        // Void elements (e.g. <img>) can't hold children — wrap them.
        let host = el;
        if (el.tagName === 'IMG') {
          const wrapper = document.createElement('span');
          wrapper.className = 'site-removable-wrap';
          el.parentNode.insertBefore(wrapper, el);
          wrapper.appendChild(el);
          host = wrapper;
        }
        host.dataset.removableId = 'r' + counter++;
        host.classList.add('site-removable');
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'site-remove-btn';
        x.setAttribute('aria-label', 'Hide this');
        x.title = 'Hide this';
        x.textContent = '×';
        x.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideBox(host);
        });
        host.appendChild(x);
      });
    });
  }

  function applyHidden() {
    const hidden = getHidden();
    hidden.forEach((id) => {
      const el = document.querySelector('[data-removable-id="' + id + '"]');
      if (el) el.style.display = 'none';
    });
  }

  function hideBox(el) {
    el.style.display = 'none';
    const id = el.dataset.removableId;
    const hidden = getHidden();
    if (!hidden.includes(id)) {
      hidden.push(id);
      saveHidden(hidden);
    }
    refreshButton();
  }

  // --- Tab close / reopen (always-on, desktop only via existing CSS) ---
  function defaultClosedHrefs() {
    return Array.from(document.querySelectorAll('.tabs-bar .tab[data-default-closed]'))
      .map((t) => t.getAttribute('href'))
      .filter(Boolean);
  }

  function isTabClosed(href) {
    if (!href) return false;
    if (getClosedTabs().includes(href)) return true;
    if (defaultClosedHrefs().includes(href)) return !getOpenedTabs().includes(href);
    return false;
  }

  function applyClosedTabs() {
    // Landing on a default-closed page counts as opening its file — unless the
    // visitor explicitly closed that tab, which must survive a reload.
    const here = location.pathname;
    if (defaultClosedHrefs().includes(here) && !getClosedTabs().includes(here)) {
      const opened = getOpenedTabs();
      if (!opened.includes(here)) {
        opened.push(here);
        saveOpenedTabs(opened);
      }
    }
    document.querySelectorAll('.tabs-bar .tab').forEach((tab) => {
      if (isTabClosed(tab.getAttribute('href'))) {
        tab.style.display = 'none';
      }
    });
  }

  function findAdjacentVisibleTab(tab) {
    const allTabs = Array.from(document.querySelectorAll('.tabs-bar .tab'));
    const idx = allTabs.indexOf(tab);
    if (idx === -1) return null;
    for (let i = idx - 1; i >= 0; i--) {
      const h = allTabs[i].getAttribute('href');
      if (h && !isTabClosed(h)) return h;
    }
    for (let i = idx + 1; i < allTabs.length; i++) {
      const h = allTabs[i].getAttribute('href');
      if (h && !isTabClosed(h)) return h;
    }
    return null;
  }

  function closeTab(tab) {
    const href = tab.getAttribute('href');
    if (!href) return;
    const isCurrent = href === location.pathname;
    const closed = getClosedTabs();
    if (!closed.includes(href)) {
      closed.push(href);
      saveClosedTabs(closed);
    }
    const opened = getOpenedTabs();
    const openedIdx = opened.indexOf(href);
    if (openedIdx >= 0) {
      opened.splice(openedIdx, 1);
      saveOpenedTabs(opened);
    }
    if (isCurrent) {
      const target = findAdjacentVisibleTab(tab);
      if (target) {
        location.href = target;
        return;
      }
    }
    tab.style.display = 'none';
    updateEditorVisibility();
    maybeShowReopenHint();
  }

  function reopenTab(href) {
    if (!href) return;
    const closed = getClosedTabs();
    const idx = closed.indexOf(href);
    if (idx >= 0) {
      closed.splice(idx, 1);
      saveClosedTabs(closed);
    }
    if (defaultClosedHrefs().includes(href)) {
      const opened = getOpenedTabs();
      if (!opened.includes(href)) {
        opened.push(href);
        saveOpenedTabs(opened);
      }
    }
  }

  function updateEditorVisibility() {
    const isCurrentClosed = isTabClosed(location.pathname);
    const editor = document.querySelector('.editor-content');
    if (editor) {
      editor.style.display = isCurrentClosed ? 'none' : '';
    }

    const editorArea = document.querySelector('.editor-area');
    if (!editorArea) return;
    let empty = editorArea.querySelector('.editor-empty-state');
    if (isCurrentClosed) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'editor-empty-state';
        empty.innerHTML = '<span class="editor-empty-comment">// no file open — pick one from the explorer to view</span>';
        editorArea.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function setupTabHandlers() {
    document.querySelectorAll('.tabs-bar .tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) {
          e.preventDefault();
          e.stopPropagation();
          closeTab(tab);
        }
      });
    });
    document.querySelectorAll('.sidebar .file-item').forEach((link) => {
      link.addEventListener('click', () => {
        reopenTab(link.getAttribute('href'));
      });
    });
  }

  // --- Tab drag-to-reorder (VS Code style) ---
  // Order is persisted as a list of hrefs; tabs the saved list doesn't know
  // about (new pages) keep their source order after the known ones.
  function applyTabOrder() {
    const bar = document.querySelector('.tabs-bar');
    if (!bar) return;
    const saved = getTabOrder();
    if (!Array.isArray(saved) || saved.length === 0) return;
    const tabs = Array.from(bar.querySelectorAll('.tab'));
    const rank = (tab) => {
      const i = saved.indexOf(tab.getAttribute('href'));
      return i === -1 ? saved.length : i;
    };
    tabs
      .map((tab, sourceIndex) => ({ tab, sourceIndex }))
      .sort((a, b) => (rank(a.tab) - rank(b.tab)) || (a.sourceIndex - b.sourceIndex))
      .forEach(({ tab }) => bar.appendChild(tab));
  }

  function persistTabOrder(bar) {
    const order = Array.from(bar.querySelectorAll('.tab'))
      .map((t) => t.getAttribute('href'))
      .filter(Boolean);
    saveTabOrder(order);
  }

  // FLIP: move `el` in the DOM but animate it from where it was.
  function flipMove(el, doMove) {
    const before = el.getBoundingClientRect().left;
    doMove();
    el.style.transition = 'none';
    el.style.transform = '';
    const after = el.getBoundingClientRect().left;
    el.style.transform = 'translateX(' + (before - after) + 'px)';
    void el.offsetWidth; // flush so the transition below starts from the inverted position
    el.style.transition = '';
    el.style.transform = '';
  }

  function setupTabDrag() {
    const bar = document.querySelector('.tabs-bar');
    if (!bar) return;
    let drag = null;

    const visibleTabs = () =>
      Array.from(bar.querySelectorAll('.tab')).filter((t) => t.style.display !== 'none');

    function clearTabTransforms() {
      bar.querySelectorAll('.tab').forEach((t) => {
        t.style.transform = '';
        t.style.transition = '';
      });
    }

    // Keep the dragged tab under the pointer regardless of where layout put it.
    function syncTransform(clientX) {
      const tab = drag.tab;
      const desiredLeft = clientX - drag.grabX;
      const layoutLeft = tab.getBoundingClientRect().left - drag.dx;
      drag.dx = desiredLeft - layoutLeft;
      tab.style.transform = 'translateX(' + drag.dx + 'px)';
    }

    function reorderAround(clientX) {
      const tab = drag.tab;
      // Compare centres in offsetParent space so sibling FLIP transforms are ignored.
      const center = () => tab.offsetLeft + drag.dx + tab.offsetWidth / 2;
      let moved = true;
      let guard = 0;
      while (moved && guard++ < 50) {
        moved = false;
        for (const other of visibleTabs()) {
          if (other === tab) continue;
          const mid = other.offsetLeft + other.offsetWidth / 2;
          const otherIsAfter = !!(tab.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (otherIsAfter && center() > mid) {
            flipMove(other, () => other.after(tab));
          } else if (!otherIsAfter && center() < mid) {
            flipMove(other, () => other.before(tab));
          } else {
            continue;
          }
          syncTransform(clientX);
          moved = true;
          break;
        }
      }
    }

    function finish(cancelled) {
      if (!drag) return;
      const { tab, pointerId, originalNext, active } = drag;
      try { tab.releasePointerCapture(pointerId); } catch (_) {}
      if (active) {
        if (cancelled) {
          if (originalNext && originalNext.parentNode === bar) bar.insertBefore(tab, originalNext);
          else bar.appendChild(tab);
        } else {
          persistTabOrder(bar);
        }
        tab.classList.remove('dragging');
        bar.classList.remove('tabs-reordering');
        clearTabTransforms();
        // The click that follows pointerup would navigate; swallow it.
        drag.suppressClick = true;
        setTimeout(() => { if (drag) drag = null; }, 0);
        return;
      }
      drag = null;
    }

    function onPointerDown(e) {
      if (drag || e.button !== 0) return;
      // Touch pans the (scrollable) tab bar; reordering is mouse/pen only.
      if (e.pointerType === 'touch') return;
      if (e.target.closest('.tab-close')) return;
      const tab = e.currentTarget;
      drag = {
        tab,
        pointerId: e.pointerId,
        startX: e.clientX,
        grabX: e.clientX - tab.getBoundingClientRect().left,
        dx: 0,
        active: false,
        originalNext: tab.nextElementSibling,
        suppressClick: false,
      };
    }

    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        if (Math.abs(e.clientX - drag.startX) < TAB_DRAG_THRESHOLD_PX) return;
        drag.active = true;
        try { drag.tab.setPointerCapture(drag.pointerId); } catch (_) {}
        drag.tab.classList.add('dragging');
        bar.classList.add('tabs-reordering');
      }
      e.preventDefault();
      syncTransform(e.clientX);
      reorderAround(e.clientX);
    }

    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      finish(false);
    }

    function onPointerCancel(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      finish(true);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape' && drag && drag.active) finish(true);
    }

    function onClickCapture(e) {
      if (drag && drag.suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        drag = null;
      }
    }

    bar.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('pointerdown', onPointerDown);
      tab.addEventListener('pointermove', onPointerMove);
      tab.addEventListener('pointerup', onPointerUp);
      tab.addEventListener('pointercancel', onPointerCancel);
      tab.addEventListener('click', onClickCapture, true);
      // Anchors are natively draggable; that ghost-image drag would fight ours.
      tab.addEventListener('dragstart', (e) => e.preventDefault());
    });
    document.addEventListener('keydown', onKeyDown);
  }

  // --- Keyboard shortcuts, Quick Open, command palette, notifications ---
  // Real VS Code bindings are registered first. Browsers reserve some of them
  // (⌘⇧T, ⌘W, ⌘⌥→ …) at the app level and never deliver the keydown, so each of
  // those also gets a non-reserved fallback, and a one-time notification says so.
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent || '');
  const BROWSER_NAME = (() => {
    const ua = navigator.userAgent || '';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\/|Chromium\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Your browser';
  })();
  const CHORD_TIMEOUT_MS = 1500;
  const HINTS_KEY = 'shortcutHints';
  const SIDEBAR_HIDDEN_KEY = 'sidebarHidden';
  const KEY_DISPLAY = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', pageup: 'PageUp', pagedown: 'PageDown', escape: 'Esc', enter: 'Enter' };
  const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];

  // Physical key, so ⌥⇧T is still "t" on macOS where e.key would be "ˇ".
  function keyFromEvent(e) {
    const code = e.code || '';
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1].toLowerCase();
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    return (e.key || '').toLowerCase();
  }

  function eventStroke(e) {
    return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key: keyFromEvent(e) };
  }

  // 'mod+shift+t' → stroke. 'mod' is ⌘ on macOS and Ctrl elsewhere.
  function parseStroke(str) {
    const parts = str.toLowerCase().split('+');
    const stroke = { ctrl: false, alt: false, shift: false, meta: false, key: parts.pop() };
    parts.forEach((p) => {
      if (p === 'mod') stroke[IS_MAC ? 'meta' : 'ctrl'] = true;
      else if (p in stroke) stroke[p] = true;
    });
    return stroke;
  }

  function sameStroke(a, b) {
    return a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta && a.key === b.key;
  }

  function strokeLabel(str) {
    const s = parseStroke(str);
    const keyName = KEY_DISPLAY[s.key] || s.key.toUpperCase();
    if (IS_MAC) {
      return (s.ctrl ? '⌃' : '') + (s.alt ? '⌥' : '') + (s.shift ? '⇧' : '') + (s.meta ? '⌘' : '') + keyName;
    }
    const parts = [];
    if (s.ctrl) parts.push('Ctrl');
    if (s.alt) parts.push('Alt');
    if (s.shift) parts.push('Shift');
    if (s.meta) parts.push('Win');
    parts.push(keyName);
    return parts.join('+');
  }

  function bindingLabel(binding) {
    return binding.split(' ').map(strokeLabel).join(' ');
  }

  function isEditableTarget(e) {
    const t = e.target;
    if (!t || t.nodeType !== 1) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  function isModifierKey(e) {
    return e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift';
  }

  function allTabs() {
    return Array.from(document.querySelectorAll('.tabs-bar .tab'));
  }

  function openTabs() {
    return allTabs().filter((t) => t.style.display !== 'none');
  }

  function currentOpenTab() {
    return openTabs().find((t) => t.getAttribute('href') === location.pathname) || null;
  }

  function tabLabel(tab) {
    return tab.textContent.replace(/×/g, '').trim().split(/\s+/).pop();
  }

  function navigateTo(href) {
    location.href = href;
  }

  function reopenLastClosed() {
    const closed = getClosedTabs();
    const known = allTabs().map((t) => t.getAttribute('href'));
    for (let i = closed.length - 1; i >= 0; i--) {
      if (known.includes(closed[i])) {
        const href = closed[i];
        reopenTab(href);
        navigateTo(href);
        return true;
      }
    }
    return false;
  }

  function closeCurrentTab() {
    const tab = currentOpenTab();
    if (!tab) return false;
    closeTab(tab);
    return true;
  }

  function closeAllTabs() {
    const closed = getClosedTabs();
    openTabs().forEach((tab) => {
      const href = tab.getAttribute('href');
      if (href && !closed.includes(href)) closed.push(href);
      tab.style.display = 'none';
    });
    saveClosedTabs(closed);
    saveOpenedTabs([]);
    updateEditorVisibility();
    maybeShowReopenHint();
  }

  function openTabAtIndex(n) {
    const tab = openTabs()[n - 1];
    if (tab) navigateTo(tab.getAttribute('href'));
  }

  function openAdjacentTab(delta) {
    const tabs = openTabs();
    const idx = tabs.findIndex((t) => t.getAttribute('href') === location.pathname);
    if (idx === -1 || tabs.length < 2) return;
    navigateTo(tabs[(idx + delta + tabs.length) % tabs.length].getAttribute('href'));
  }

  function applySidebarState() {
    if (getJSON(SIDEBAR_HIDDEN_KEY, false) === true) document.body.classList.add('sidebar-hidden');
  }

  function toggleSidebar() {
    const hidden = document.body.classList.toggle('sidebar-hidden');
    setJSON(SIDEBAR_HIDDEN_KEY, hidden);
  }

  function openDilloVersion() {
    const link = document.querySelector('.statusbar-link');
    if (link) navigateTo(link.getAttribute('href'));
  }

  // `browserOwned` marks bindings the browser reserves: keep them (some
  // browsers do pass them through) but treat the last key as the one that works.
  // `command` is the VS Code command id — what keybindings.json refers to.
  // `when` is a when-clause string from WHEN_CLAUSES (overridable from the
  // file); `guard` is an internal precondition the file can't remove.
  const COMMANDS = [
    { id: 'quickOpen', command: 'workbench.action.quickOpen', label: 'Go to File...', keys: ['mod+p'], run: () => openQuickInput('') },
    { id: 'palette', command: 'workbench.action.showCommands', label: 'Show All Commands', keys: ['mod+shift+p'], run: () => openQuickInput('>') },
    { id: 'reopen', command: 'workbench.action.reopenClosedEditor', label: 'View: Reopen Closed Editor', keys: ['mod+shift+t', 'alt+shift+t'], browserOwned: true, run: reopenLastClosed },
    { id: 'close', command: 'workbench.action.closeActiveEditor', label: 'View: Close Editor', keys: ['mod+w', 'alt+shift+w'], browserOwned: true, when: 'activeEditor', run: closeCurrentTab },
    { id: 'closeAll', command: 'workbench.action.closeAllEditors', label: 'View: Close All Editors', keys: ['mod+k w', 'mod+k mod+w'], run: closeAllTabs },
    { id: 'nextTab', command: 'workbench.action.nextEditor', label: 'View: Open Next Editor', keys: [IS_MAC ? 'mod+alt+arrowright' : 'ctrl+pagedown', 'alt+shift+arrowright'], browserOwned: true, run: () => openAdjacentTab(1) },
    { id: 'prevTab', command: 'workbench.action.previousEditor', label: 'View: Open Previous Editor', keys: [IS_MAC ? 'mod+alt+arrowleft' : 'ctrl+pageup', 'alt+shift+arrowleft'], browserOwned: true, run: () => openAdjacentTab(-1) },
    { id: 'sidebar', command: 'workbench.action.toggleSidebarVisibility', label: 'View: Toggle Primary Side Bar Visibility', keys: ['mod+b'], run: toggleSidebar },
    { id: 'edit', command: 'site.toggleEditing', label: 'Edit: Toggle Editing This Page', keys: [], guard: () => !!btnEl, run: () => onButtonClick() },
    { id: 'dillo', command: 'site.openDilloVersion', label: 'View: Open Plain HTML Version (Dillo)', keys: [], run: openDilloVersion },
    { id: 'shortcuts', command: 'workbench.action.openGlobalKeybindingsFile', label: 'Preferences: Open Keyboard Shortcuts (JSON)', keys: ['mod+k mod+s'], run: () => navigateTo('/keybindings') },
    { id: 'save', command: 'workbench.action.files.save', label: 'File: Save', keys: ['mod+s'], when: "resourceFilename == 'keybindings.json'", allowInEditable: true, run: () => saveKeybindings() },
    { id: 'resetKeybindings', command: 'site.resetKeybindings', label: 'Preferences: Reset Keyboard Shortcuts to Defaults', keys: [], run: () => resetKeybindings() },
  ];
  ORDINALS.forEach((ordinal, i) => {
    const n = i + 1;
    COMMANDS.push({
      id: 'openEditor' + n,
      command: 'workbench.action.openEditorAtIndex' + n,
      label: 'View: Open ' + ordinal + ' Editor in Group',
      keys: [(IS_MAC ? 'ctrl+' : 'alt+') + n],
      run: () => openTabAtIndex(n),
    });
  });

  const WHEN_CLAUSES = {
    'activeEditor': () => !!currentOpenTab(),
    "resourceFilename == 'keybindings.json'": () => isKeybindingsPage(),
  };

  function commandEnabled(cmd) {
    if (cmd.guard && !cmd.guard()) return false;
    if (cmd.when && !(cmd.when in WHEN_CLAUSES && WHEN_CLAUSES[cmd.when]())) return false;
    return true;
  }

  function workingKey(cmd) {
    if (!cmd.keys.length) return '';
    return bindingLabel(cmd.keys[cmd.keys.length - 1]);
  }

  // --- Chords (⌘K …) with the VS Code status-bar hint ---
  let pendingChord = null;
  let chordTimer = null;
  let chordStatusEl = null;

  function setChordStatus(text) {
    const left = document.querySelector('.statusbar-left');
    if (!left) return;
    if (!text) {
      if (chordStatusEl) chordStatusEl.remove();
      chordStatusEl = null;
      return;
    }
    if (!chordStatusEl) {
      chordStatusEl = document.createElement('span');
      chordStatusEl.className = 'statusbar-item statusbar-chord';
      left.appendChild(chordStatusEl);
    }
    chordStatusEl.textContent = text;
  }

  function clearChord() {
    pendingChord = null;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
    setChordStatus('');
  }

  function startChord(stroke, label) {
    pendingChord = stroke;
    chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
    setChordStatus('(' + label + ') was pressed. Waiting for second key of chord...');
  }

  function runCommand(cmd) {
    if (!commandEnabled(cmd)) return false;
    cmd.run();
    return true;
  }

  function onShortcutKeydown(e) {
    if (isModifierKey(e)) return;
    const stroke = eventStroke(e);
    const editable = isEditableTarget(e);

    // While typing, only commands that opt in (⌘S on keybindings.json) apply.
    if (editable) {
      for (const cmd of COMMANDS) {
        if (!cmd.allowInEditable || !commandEnabled(cmd)) continue;
        for (const binding of cmd.keys) {
          if (!binding.includes(' ') && sameStroke(parseStroke(binding), stroke)) {
            e.preventDefault();
            cmd.run();
            return;
          }
        }
      }
      return;
    }

    if (pendingChord) {
      const first = pendingChord;
      clearChord();
      e.preventDefault();
      for (const cmd of COMMANDS) {
        for (const binding of cmd.keys) {
          const [a, b] = binding.split(' ');
          if (b && sameStroke(parseStroke(a), first) && sameStroke(parseStroke(b), stroke)) {
            runCommand(cmd);
            return;
          }
        }
      }
      return;
    }

    for (const cmd of COMMANDS) {
      for (const binding of cmd.keys) {
        const [a, b] = binding.split(' ');
        if (!sameStroke(parseStroke(a), stroke)) continue;
        if (b) {
          e.preventDefault();
          startChord(stroke, strokeLabel(a));
          return;
        }
        // A command whose `when` fails leaves the key to the browser (e.g. ⌘W
        // with nothing open should still close the browser tab).
        if (!commandEnabled(cmd)) continue;
        e.preventDefault();
        cmd.run();
        return;
      }
    }
  }

  // --- Quick Open / command palette ---
  let quickInput = null;

  function fuzzyMatch(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (!q) return { indices: [], score: 0 };
    const at = t.indexOf(q);
    if (at >= 0) {
      return { indices: Array.from({ length: q.length }, (_, i) => at + i), score: at };
    }
    const indices = [];
    let from = 0;
    for (const ch of q) {
      const idx = t.indexOf(ch, from);
      if (idx === -1) return null;
      indices.push(idx);
      from = idx + 1;
    }
    // Subsequence matches rank after any substring match; tighter spread wins.
    return { indices, score: 1000 + (indices[indices.length - 1] - indices[0]) };
  }

  function highlighted(text, indices) {
    const frag = document.createDocumentFragment();
    const set = new Set(indices);
    let run = '';
    let runHl = false;
    const flush = () => {
      if (!run) return;
      if (runHl) {
        const b = document.createElement('span');
        b.className = 'quick-input-hl';
        b.textContent = run;
        frag.appendChild(b);
      } else {
        frag.appendChild(document.createTextNode(run));
      }
      run = '';
    };
    for (let i = 0; i < text.length; i++) {
      const hl = set.has(i);
      if (hl !== runHl) { flush(); runHl = hl; }
      run += text[i];
    }
    flush();
    return frag;
  }

  function fileEntries() {
    const icons = {};
    document.querySelectorAll('.sidebar .file-item').forEach((a) => {
      const icon = a.querySelector('.file-icon');
      if (icon) icons[a.getAttribute('href')] = icon.cloneNode(true);
    });
    const folderEl = document.querySelector('.sidebar .folder-name');
    const folder = folderEl ? folderEl.textContent.trim() : '';
    const entries = allTabs().map((tab) => {
      const href = tab.getAttribute('href');
      return {
        label: tabLabel(tab),
        description: folder,
        icon: icons[href] || null,
        open: !isTabClosed(href),
        run: () => { reopenTab(href); navigateTo(href); },
      };
    });
    // Like VS Code's "recently opened": open editors first, in tab order.
    return entries.filter((e) => e.open).concat(entries.filter((e) => !e.open));
  }

  function commandEntries() {
    return COMMANDS
      .filter((cmd) => cmd.id !== 'palette' && commandEnabled(cmd))
      .map((cmd) => ({ label: cmd.label, keys: workingKey(cmd), run: cmd.run }));
  }

  function buildQuickInput() {
    const root = document.createElement('div');
    root.className = 'quick-input';
    root.hidden = true;
    const widget = document.createElement('div');
    widget.className = 'quick-input-widget';
    widget.setAttribute('role', 'dialog');
    widget.setAttribute('aria-label', 'Quick Open');
    const input = document.createElement('input');
    input.className = 'quick-input-box';
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    const list = document.createElement('ul');
    list.className = 'quick-input-list';
    list.setAttribute('role', 'listbox');
    widget.appendChild(input);
    widget.appendChild(list);
    root.appendChild(widget);
    document.body.appendChild(root);

    quickInput = { root, input, list, items: [], focused: 0 };

    input.addEventListener('input', renderQuickInput);
    input.addEventListener('keydown', onQuickInputKeydown);
    input.addEventListener('blur', () => setTimeout(closeQuickInput, 0));
    root.addEventListener('mousedown', (e) => {
      if (e.target === root) closeQuickInput();
    });
  }

  function openQuickInput(prefill) {
    if (!quickInput) buildQuickInput();
    quickInput.root.hidden = false;
    quickInput.input.value = prefill;
    quickInput.input.focus();
    renderQuickInput();
  }

  function closeQuickInput() {
    if (!quickInput || quickInput.root.hidden) return;
    quickInput.root.hidden = true;
    quickInput.input.value = '';
    quickInput.items = [];
  }

  function focusQuickItem(index) {
    const { list, items } = quickInput;
    if (!items.length) return;
    quickInput.focused = (index + items.length) % items.length;
    Array.from(list.children).forEach((li, i) => li.classList.toggle('focused', i === quickInput.focused));
    const li = list.children[quickInput.focused];
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  function renderQuickInput() {
    const { input, list } = quickInput;
    const raw = input.value;
    const isCommandMode = raw.startsWith('>');
    const query = (isCommandMode ? raw.slice(1) : raw).trim();
    input.placeholder = isCommandMode ? 'Type the name of a command to run.' : 'Search files by name';

    const source = isCommandMode ? commandEntries() : fileEntries();
    const items = source
      .map((entry, order) => ({ entry, order, match: fuzzyMatch(query, entry.label) }))
      .filter((x) => x.match)
      .sort((a, b) => (a.match.score - b.match.score) || (a.order - b.order));

    list.innerHTML = '';
    quickInput.items = items;
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'quick-input-empty';
      li.textContent = isCommandMode ? 'No matching commands' : 'No matching results';
      list.appendChild(li);
      return;
    }
    items.forEach(({ entry, match }, i) => {
      const li = document.createElement('li');
      li.className = 'quick-input-item';
      li.setAttribute('role', 'option');
      if (entry.icon) li.appendChild(entry.icon.cloneNode(true));
      const label = document.createElement('span');
      label.className = 'quick-input-label';
      label.appendChild(highlighted(entry.label, match.indices));
      li.appendChild(label);
      if (entry.description) {
        const desc = document.createElement('span');
        desc.className = 'quick-input-desc';
        desc.textContent = entry.description;
        li.appendChild(desc);
      }
      if (entry.keys) {
        const keys = document.createElement('span');
        keys.className = 'quick-input-keys';
        const kbd = document.createElement('kbd');
        kbd.textContent = entry.keys;
        keys.appendChild(kbd);
        li.appendChild(keys);
      }
      // mousedown, not click: the input's blur (which closes us) fires in between.
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptQuickItem(i);
      });
      li.addEventListener('mousemove', () => {
        if (quickInput.focused !== i) focusQuickItem(i);
      });
      list.appendChild(li);
    });
    focusQuickItem(0);
  }

  function acceptQuickItem(index) {
    const item = quickInput.items[index];
    closeQuickInput();
    if (item) item.entry.run();
  }

  function onQuickInputKeydown(e) {
    const stroke = eventStroke(e);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickInput();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusQuickItem(quickInput.focused + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusQuickItem(quickInput.focused - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      acceptQuickItem(quickInput.focused);
    } else if (sameStroke(parseStroke('mod+shift+p'), stroke)) {
      e.preventDefault();
      quickInput.input.value = '>';
      renderQuickInput();
    } else if (sameStroke(parseStroke('mod+p'), stroke)) {
      e.preventDefault();
      closeQuickInput();
    }
  }

  // --- Notifications (bottom-right, like VS Code) ---
  const NOTIFICATION_ICONS = { info: 'ⓘ', warning: '⚠', error: 'ⓧ' };

  function showNotification({ message, actions, kind = 'info', timeoutMs = 0 }) {
    let host = document.querySelector('.vs-notifications');
    if (!host) {
      host = document.createElement('div');
      host.className = 'vs-notifications';
      document.body.appendChild(host);
    }
    const box = document.createElement('div');
    box.className = 'vs-notification vs-notification--' + kind;
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'vs-notification-icon';
    icon.textContent = NOTIFICATION_ICONS[kind] || NOTIFICATION_ICONS.info;
    const text = document.createElement('div');
    text.className = 'vs-notification-message';
    text.appendChild(message);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vs-notification-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    const dismiss = () => box.remove();
    close.addEventListener('click', dismiss);
    box.appendChild(icon);
    box.appendChild(text);
    box.appendChild(close);
    if (actions && actions.length) {
      const row = document.createElement('div');
      row.className = 'vs-notification-actions';
      actions.forEach((action, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = action.label;
        if (i > 0) btn.classList.add('secondary');
        btn.addEventListener('click', () => { dismiss(); if (action.run) action.run(); });
        row.appendChild(btn);
      });
      box.appendChild(row);
    }
    host.appendChild(box);
    if (timeoutMs > 0) setTimeout(dismiss, timeoutMs);
    return box;
  }

  function kbdText(binding) {
    const kbd = document.createElement('kbd');
    kbd.textContent = bindingLabel(binding);
    return kbd;
  }

  function maybeShowReopenHint() {
    if (getClosedTabs().length === 0) return;
    const hints = getJSON(HINTS_KEY, {});
    if (hints.reopen) return;
    hints.reopen = true;
    setJSON(HINTS_KEY, hints);

    const msg = document.createDocumentFragment();
    const add = (s) => msg.appendChild(document.createTextNode(s));
    add(BROWSER_NAME + ' keeps ');
    msg.appendChild(kbdText('mod+shift+t'));
    add(' and ');
    msg.appendChild(kbdText('mod+w'));
    add(' for its own tabs, so on this site it’s ');
    msg.appendChild(kbdText('alt+shift+t'));
    add(' to reopen a closed editor and ');
    msg.appendChild(kbdText('alt+shift+w'));
    add(' to close one. ');
    msg.appendChild(kbdText('mod+shift+p'));
    add(' lists every command; the full set is in ');
    const link = document.createElement('a');
    link.href = '/keybindings';
    link.textContent = 'keybindings.json';
    msg.appendChild(link);
    add('.');
    showNotification({
      message: msg,
      actions: [
        { label: 'Reopen', run: reopenLastClosed },
        { label: 'Got it' },
      ],
    });
  }

  // --- keybindings.json: edit on the page, validate, save to localStorage ---
  const KEYBINDING_OVERRIDES_KEY = 'keybindingOverrides';
  const KB_MODIFIERS = ['ctrl', 'shift', 'alt', 'cmd', 'meta', 'win'];
  const KB_NAMED_KEYS = ['left', 'right', 'up', 'down', 'pageup', 'pagedown', 'home', 'end', 'escape', 'enter', 'tab',
    'space', 'backspace', 'delete', 'insert', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];
  // Keys that are safe to bind without a modifier — anything else bare would hijack typing or scrolling.
  const KB_BARE_OK = /^(f\d{1,2}|escape|insert)$/;
  const KB_PUNCTUATION = '`-=[]\;\',./';
  const KB_ALLOWED_FIELDS = ['key', 'mac', 'win', 'linux', 'command', 'when'];
  const KB_RESERVED = IS_MAC
    ? ['cmd+w', 'cmd+shift+w', 'cmd+t', 'cmd+shift+t', 'cmd+n', 'cmd+shift+n', 'cmd+q', 'cmd+alt+left', 'cmd+alt+right', 'cmd+shift+[', 'cmd+shift+]', 'ctrl+tab', 'ctrl+shift+tab']
    : ['ctrl+w', 'ctrl+shift+w', 'ctrl+t', 'ctrl+shift+t', 'ctrl+n', 'ctrl+shift+n', 'ctrl+pageup', 'ctrl+pagedown', 'ctrl+tab', 'ctrl+shift+tab', 'alt+f4'];
  const KB_SAVED_TOAST_MS = 6000;

  let kbDirty = false;
  let kbSaveBtn = null;
  let problemsDefaultText = null;

  function isKeybindingsPage() {
    return !!document.querySelector('.kb-file');
  }

  function platformKeyOf(binding) {
    if (IS_MAC) return binding.mac || binding.key;
    return binding.win || binding.linux || binding.key;
  }

  // VS Code key syntax ('cmd+k cmd+s', 'ctrl+pagedown') → parseStroke() syntax.
  function vscodeKeyToInternal(keyStr) {
    const named = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown', space: ' ' };
    return keyStr.trim().toLowerCase().split(/\s+/).map((chord) => {
      const parts = chord.split('+');
      const key = parts.pop();
      const mods = parts.map((m) => (m === 'cmd' || m === 'win') ? 'meta' : m);
      return mods.concat(named[key] || key).join('+');
    }).join(' ');
  }

  // Returns a problem description, or null when the key string is well-formed.
  function validateKeyString(str) {
    if (typeof str !== 'string' || !str.trim()) return 'is empty';
    const chords = str.trim().toLowerCase().split(/\s+/);
    if (chords.length > 2) return 'has more than two chords';
    for (const chord of chords) {
      const parts = chord.split('+');
      const key = parts.pop();
      const seen = new Set();
      for (const m of parts) {
        if (!KB_MODIFIERS.includes(m)) return 'has an unknown modifier "' + m + '"';
        if (seen.has(m)) return 'repeats "' + m + '"';
        seen.add(m);
      }
      const isChar = /^[a-z0-9]$/.test(key) || (key.length === 1 && KB_PUNCTUATION.includes(key));
      if (!isChar && !KB_NAMED_KEYS.includes(key)) return 'has an unknown key "' + key + '"';
      if (!parts.length && !KB_BARE_OK.test(key)) return 'needs a modifier — a bare "' + key + '" would hijack typing';
    }
    return null;
  }

  function stripLineComment(line) {
    let inString = false;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i);
      }
    }
    return line;
  }

  // The file is one binding per line, so it is parsed line by line: every
  // problem gets a line number, and a broken line can't swallow the rest.
  function parseKeybindingsText(text) {
    const errors = [];
    const warnings = [];
    const bindings = [];
    const lines = text.split('\n');
    let sawOpen = false;
    let sawClose = false;

    lines.forEach((raw, i) => {
      const n = i + 1;
      const line = stripLineComment(raw).trim().replace(/,$/, '').trim();
      if (!line) return;
      if (line === '[') {
        if (sawOpen) errors.push({ line: n, message: 'a second "[" — the file is a single array' });
        sawOpen = true;
        return;
      }
      if (line === ']') { sawClose = true; return; }
      if (sawClose) { errors.push({ line: n, message: 'content after the closing "]"' }); return; }
      if (!sawOpen) { errors.push({ line: n, message: 'expected "[" before the first binding' }); return; }
      if (!line.startsWith('{')) {
        errors.push({ line: n, message: 'expected a binding like { "key": "ctrl+p", "command": "…" }' });
        return;
      }
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (err) {
        errors.push({ line: n, message: 'not valid JSON (' + String(err.message).replace(/ in JSON.*$/, '').replace(/,\s*".*$/, '') + ')' });
        return;
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        errors.push({ line: n, message: 'expected an object' });
        return;
      }
      const unknown = Object.keys(obj).filter((k) => !KB_ALLOWED_FIELDS.includes(k));
      if (unknown.length) {
        errors.push({ line: n, message: 'unknown field ' + unknown.map((k) => '"' + k + '"').join(', ') + ' — allowed: ' + KB_ALLOWED_FIELDS.join(', ') });
        return;
      }
      if (typeof obj.command !== 'string' || !COMMANDS.some((c) => c.command === obj.command)) {
        errors.push({ line: n, message: 'unknown command "' + obj.command + '"' });
        return;
      }
      if (obj.key === undefined) {
        errors.push({ line: n, message: '"key" is required' });
        return;
      }
      for (const field of ['key', 'mac', 'win', 'linux']) {
        if (obj[field] === undefined) continue;
        const problem = validateKeyString(obj[field]);
        if (problem) {
          errors.push({ line: n, message: '"' + field + '": "' + obj[field] + '" ' + problem });
          return;
        }
      }
      if (obj.when !== undefined && !(obj.when in WHEN_CLAUSES)) {
        errors.push({ line: n, message: 'unsupported "when" clause "' + obj.when + '" — supported: ' + Object.keys(WHEN_CLAUSES).map((w) => '"' + w + '"').join(', ') });
        return;
      }
      bindings.push(Object.assign({}, obj, { line: n }));
    });

    if (!errors.length && !sawOpen) errors.push({ line: 1, message: 'no "[" found — the file is a single JSON array' });
    if (!errors.length && !sawClose) errors.push({ line: lines.length, message: 'missing the closing "]"' });

    // Conflicts on this platform: the same key twice, or a chord whose first
    // stroke is already a complete binding (the chord could never fire).
    const byKey = new Map();
    bindings.forEach((b) => {
      const k = vscodeKeyToInternal(platformKeyOf(b));
      if (byKey.has(k)) {
        const other = byKey.get(k);
        errors.push({ line: b.line, message: '"' + platformKeyOf(b) + '" is already bound to ' + other.command + ' on line ' + other.line });
      } else {
        byKey.set(k, b);
      }
    });
    bindings.forEach((b) => {
      const k = vscodeKeyToInternal(platformKeyOf(b));
      const first = k.split(' ')[0];
      if (k !== first && byKey.has(first)) {
        const other = byKey.get(first);
        errors.push({ line: b.line, message: 'chord "' + platformKeyOf(b) + '" can never fire — its first stroke is bound to ' + other.command + ' on line ' + other.line });
      }
      const plain = platformKeyOf(b).trim().toLowerCase();
      if (KB_RESERVED.includes(plain)) {
        warnings.push({ line: b.line, message: '"' + plain + '" is reserved by the browser and may never reach this page' });
      }
    });

    return { bindings, errors, warnings };
  }

  function applyKeybindingOverrides() {
    const saved = getJSON(KEYBINDING_OVERRIDES_KEY, null);
    if (!Array.isArray(saved)) return false;
    COMMANDS.forEach((cmd) => {
      if (cmd.command) cmd.keys = [];
    });
    saved.forEach((b) => {
      if (!b || typeof b !== 'object') return;
      const cmd = COMMANDS.find((c) => c.command === b.command);
      const keyStr = platformKeyOf(b);
      if (!cmd || typeof keyStr !== 'string' || validateKeyString(keyStr)) return;
      cmd.keys.push(vscodeKeyToInternal(keyStr));
      cmd.when = (typeof b.when === 'string' && b.when in WHEN_CLAUSES) ? b.when : null;
    });
    return true;
  }

  function kbFileText() {
    return Array.from(document.querySelectorAll('.kb-file .kb-line')).map((l) => l.textContent).join('\n');
  }

  function kbStrip(bindings) {
    return bindings.map((b) => {
      const copy = Object.assign({}, b);
      delete copy.line;
      return copy;
    });
  }

  function kbComputeDirty() {
    if (Object.keys(getEdits()).length === 0) return false;
    const saved = getJSON(KEYBINDING_OVERRIDES_KEY, null);
    if (!Array.isArray(saved)) return true;
    const parsed = parseKeybindingsText(kbFileText());
    return parsed.errors.length > 0 || JSON.stringify(kbStrip(parsed.bindings)) !== JSON.stringify(saved);
  }

  function kbSetDirty(dirty) {
    kbDirty = dirty;
    const tab = allTabs().find((t) => t.getAttribute('href') === '/keybindings');
    const close = tab && tab.querySelector('.tab-close');
    if (tab) tab.classList.toggle('dirty', dirty);
    if (close) {
      close.textContent = dirty ? '●' : '×';
      close.title = dirty ? 'Unsaved changes — ' + bindingLabel('mod+s') + ' to save' : '';
    }
    refreshSaveButton();
  }

  function refreshSaveButton() {
    if (!kbSaveBtn) return;
    kbSaveBtn.hidden = !(editing || kbDirty);
    kbSaveBtn.disabled = !kbDirty;
    kbSaveBtn.textContent = (kbDirty ? '● ' : '✓ ') + 'save keybindings · ' + bindingLabel('mod+s');
    kbSaveBtn.title = kbDirty ? 'Validate and save this file to your browser' : 'No unsaved changes';
  }

  function setProblems(errorCount, warningCount) {
    const el = document.querySelector('.statusbar-problems');
    if (!el) return;
    if (problemsDefaultText == null) problemsDefaultText = el.textContent;
    if (errorCount || warningCount) {
      el.textContent = '⊗ ' + errorCount + ' ⚠ ' + warningCount;
    } else {
      el.textContent = problemsDefaultText;
    }
    el.classList.toggle('has-problems', errorCount > 0);
  }

  function problemList(items) {
    const ul = document.createElement('ul');
    ul.className = 'vs-notification-list';
    items.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = 'line ' + p.line + ': ' + p.message;
      ul.appendChild(li);
    });
    return ul;
  }

  function saveKeybindings() {
    if (!isKeybindingsPage()) return false;
    const { bindings, errors, warnings } = parseKeybindingsText(kbFileText());
    setProblems(errors.length, warnings.length);
    document.querySelectorAll('.vs-notification--kb').forEach((n) => n.remove());
    if (errors.length) {
      const msg = document.createDocumentFragment();
      msg.appendChild(document.createTextNode('keybindings.json was not saved — ' + errors.length + (errors.length === 1 ? ' problem' : ' problems') + ':'));
      msg.appendChild(problemList(errors));
      showNotification({ kind: 'error', message: msg, actions: [{ label: 'OK' }] }).classList.add('vs-notification--kb');
      return false;
    }
    setJSON(KEYBINDING_OVERRIDES_KEY, kbStrip(bindings));
    applyKeybindingOverrides();
    // Shortcuts are ignored while typing, so leave edit mode: the new keys
    // work the moment the toast appears, not after the visitor guesses to click away.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (editing) disableEditing();
    kbSetDirty(false);
    refreshButton();
    const msg = document.createDocumentFragment();
    msg.appendChild(document.createTextNode('Saved — ' + bindings.length + ' bindings live now, in this browser only. Click ✎ to change more, ↺ to go back to the defaults.'));
    if (warnings.length) msg.appendChild(problemList(warnings));
    showNotification({
      kind: warnings.length ? 'warning' : 'info',
      message: msg,
      actions: [{ label: 'OK' }],
      timeoutMs: warnings.length ? 0 : KB_SAVED_TOAST_MS,
    }).classList.add('vs-notification--kb');
    return true;
  }

  function resetKeybindings() {
    clearKey(KEYBINDING_OVERRIDES_KEY);
    clearKey('siteEdits:/keybindings');
    clearKey('siteHidden:/keybindings');
    if (isKeybindingsPage()) {
      location.reload();
      return;
    }
    showNotification({
      message: document.createTextNode('Keyboard shortcuts reset to defaults. They apply on the next page load.'),
      actions: [{ label: 'Reload', run: () => location.reload() }, { label: 'Later' }],
    });
  }

  let kbResetBtn = null;

  function refreshResetButton() {
    if (!kbResetBtn) return;
    const hasSaved = Array.isArray(getJSON(KEYBINDING_OVERRIDES_KEY, null));
    kbResetBtn.hidden = !(hasSaved || hasAnyChanges());
  }

  function confirmResetKeybindings() {
    document.querySelectorAll('.vs-notification--kb').forEach((n) => n.remove());
    showNotification({
      kind: 'warning',
      message: document.createTextNode('Reset keybindings.json to the defaults? Your saved bindings and edits in this browser will be discarded.'),
      actions: [{ label: 'Reset', run: resetKeybindings }, { label: 'Cancel' }],
    }).classList.add('vs-notification--kb');
  }

  // Dim the column that doesn't apply on this platform so a Mac visitor
  // doesn't edit "key" and wonder why nothing changed.
  function markOtherPlatformColumns() {
    document.querySelectorAll('.kb-file .kb-line').forEach((line) => {
      const keyTokens = Array.from(line.querySelectorAll('.tok-key'));
      const names = keyTokens.map((t) => t.textContent);
      const hasMac = names.includes('"mac"');
      if (!hasMac) return;
      const dimName = IS_MAC ? '"key"' : '"mac"';
      const title = IS_MAC ? 'Windows/Linux binding — not used on this Mac' : 'macOS binding — not used on this platform';
      keyTokens.forEach((t) => {
        if (t.textContent !== dimName) return;
        let el = t;
        const group = [t];
        for (let i = 0; i < 3 && el.nextElementSibling; i++) {
          el = el.nextElementSibling;
          group.push(el);
        }
        group.forEach((g) => {
          g.classList.add('kb-other-platform');
          g.title = title;
        });
      });
    });
  }

  function setupKeybindingsEditor() {
    if (!isKeybindingsPage()) return;
    const row = document.querySelector('.site-fab-row');
    if (row) {
      kbSaveBtn = document.createElement('button');
      kbSaveBtn.type = 'button';
      kbSaveBtn.className = 'site-edit-btn kb-save-btn';
      kbSaveBtn.addEventListener('click', () => saveKeybindings());
      row.appendChild(kbSaveBtn);

      kbResetBtn = document.createElement('button');
      kbResetBtn.type = 'button';
      kbResetBtn.className = 'site-edit-btn site-edit-btn--reset kb-reset-btn';
      kbResetBtn.textContent = '↺ reset';
      kbResetBtn.title = 'Back to the default keybindings';
      kbResetBtn.addEventListener('click', confirmResetKeybindings);
      row.appendChild(kbResetBtn);
    }
    document.addEventListener('input', (e) => {
      if (e.target.closest && e.target.closest('.kb-file')) {
        kbSetDirty(true);
        refreshResetButton();
      }
    });
    // Browsers turn ⌘B/⌘I/⌘U into <b>/<i>/<u> inside contenteditable; that
    // would corrupt the file text.
    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (!/^[biu]$/i.test(e.key)) return;
      if (e.target.closest && e.target.closest('.kb-file .editable-unit')) e.preventDefault();
    }, true);
    markOtherPlatformColumns();
    kbSetDirty(kbComputeDirty());
    refreshResetButton();
    refreshButton();
  }

  function setupKeyboard() {
    applySidebarState();
    applyKeybindingOverrides();
    document.addEventListener('keydown', onShortcutKeydown);
  }

  // --- Edit mode toggle & button ---
  let editing = false;
  let btnEl = null;

  function refreshButton() {
    if (!btnEl) return;
    if (isKeybindingsPage()) {
      // Here the edits are the bindings: never turn this button into "reset".
      btnEl.textContent = editing ? '✓ done editing' : '✎ edit this page';
      btnEl.classList.toggle('site-edit-btn--editing', editing);
      btnEl.classList.remove('site-edit-btn--reset');
      btnEl.title = editing ? 'Stop editing (unsaved changes stay in the file)' : 'Edit the keys and commands in this file';
      refreshSaveButton();
      return;
    }
    if (hasAnyChanges()) {
      btnEl.textContent = '↺ reset';
      btnEl.classList.remove('site-edit-btn--editing');
      btnEl.classList.add('site-edit-btn--reset');
      btnEl.title = 'Clear your edits and reload the page';
    } else if (editing) {
      btnEl.textContent = '✎ click any text to edit';
      btnEl.classList.add('site-edit-btn--editing');
      btnEl.classList.remove('site-edit-btn--reset');
      btnEl.title = 'Click again to stop editing';
    } else {
      btnEl.textContent = '✎ edit this page';
      btnEl.classList.remove('site-edit-btn--editing');
      btnEl.classList.remove('site-edit-btn--reset');
      btnEl.title = 'Make every word on this page editable, just for you';
    }
    refreshSaveButton();
  }

  function enableEditing() {
    editing = true;
    document.body.classList.add('site-editing');
    document.querySelectorAll('.editable-unit').forEach((el) => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
    });
  }

  function disableEditing() {
    editing = false;
    document.body.classList.remove('site-editing');
    document.querySelectorAll('.editable-unit').forEach((el) => {
      el.removeAttribute('contenteditable');
    });
  }

  function reset() {
    clearKey(EDITS_KEY);
    clearKey(HIDDEN_KEY);
    // On keybindings.json the edits ARE the bindings; resetting one resets both.
    if (isKeybindingsPage()) clearKey(KEYBINDING_OVERRIDES_KEY);
    disableEditing();
    location.reload();
  }

  function onButtonClick() {
    if (hasAnyChanges() && !isKeybindingsPage()) {
      reset();
      return;
    }
    if (editing) {
      disableEditing();
    } else {
      enableEditing();
    }
    refreshButton();
  }

  // Visitors' edits are theirs: they live in this browser's localStorage and go
  // nowhere. Flip EDIT_LOG_URL to an endpoint of your own if you genuinely want
  // to see what people type — and say so on the page if you do.
  const EDIT_LOG_URL = null;
  const logTimeouts = {};
  function logEditToServer(id, original, edited) {
    if (!EDIT_LOG_URL) return;
    if (logTimeouts[id]) clearTimeout(logTimeouts[id]);
    logTimeouts[id] = setTimeout(() => {
      try {
        fetch(EDIT_LOG_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page: location.pathname,
            id: id,
            original: original,
            edited: edited
          }),
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }, 800);
  }

  function onInput(e) {
    if (!editing) return;
    const unit = e.target.closest('.editable-unit');
    if (!unit) return;
    const edits = getEdits();
    const id = unit.dataset.editId;
    const current = unit.textContent;
    edits[id] = current;
    saveEdits(edits);
    refreshButton();
    const original = unit.dataset.editOriginal;
    if (original != null && original !== current) {
      logEditToServer(id, original, current);
    }
  }

  function onPaste(e) {
    if (!editing) return;
    if (!e.target.closest('.editable-unit')) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function onLinkClick(e) {
    if (!editing) return;
    if (e.target.closest('.site-edit-btn')) return;
    if (e.target.closest('.site-remove-btn')) return;
    const link = e.target.closest('.editor-content a');
    if (link) {
      e.preventDefault();
    }
  }

  function createButton() {
    const row = document.createElement('div');
    row.className = 'site-fab-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'site-edit-btn';
    btn.addEventListener('click', onButtonClick);
    row.appendChild(btn);
    document.body.appendChild(row);
    return btn;
  }

  // --- Explorer folders: collapse and expand like a real file tree ---
  function folderKeyOf(folder) {
    const name = folder.querySelector('.folder-name');
    return name ? name.textContent.trim() : '';
  }

  function setFolderOpen(folder, open) {
    const header = folder.querySelector('.folder-header');
    const icon = folder.querySelector('.folder-icon');
    folder.classList.toggle('collapsed', !open);
    if (icon) icon.textContent = open ? '\u25bc' : '\u25b6';
    if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggleFolder(folder) {
    const open = folder.classList.contains('collapsed');
    setFolderOpen(folder, open);
    const key = folderKeyOf(folder);
    if (!key) return;
    const closed = getClosedFolders().filter((k) => k !== key);
    if (!open) closed.push(key);
    saveClosedFolders(closed);
  }

  function setupFolderToggles() {
    const closed = getClosedFolders();
    document.querySelectorAll('.sidebar .folder').forEach((folder, i) => {
      const header = folder.querySelector('.folder-header');
      const list = folder.querySelector('.file-list');
      // node_modules and .git have no contents to show, so they stay inert.
      if (!header || !list) return;
      if (!list.id) list.id = 'folder-contents-' + i;
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-controls', list.id);
      setFolderOpen(folder, !closed.includes(folderKeyOf(folder)));
      header.addEventListener('click', () => toggleFolder(folder));
      header.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        toggleFolder(folder);
      });
    });
  }

  function init() {
    // Tabs feature is always on
    applyTabOrder();
    applyClosedTabs();
    setupTabHandlers();
    setupTabDrag();
    setupFolderToggles();
    updateEditorVisibility();
    setupKeyboard();
    // A close that navigated away shows its hint here, on the next page.
    maybeShowReopenHint();

    if (!document.querySelector('.editor-content')) return;

    wrapTextNodes();
    applyEdits();
    assignRemovableBoxes();
    applyHidden();
    btnEl = createButton();
    // On keybindings.json saved edits are just the file's current text; opening
    // in edit mode there would block the very shortcuts the visitor saved.
    if (hasAnyChanges() && !isKeybindingsPage()) {
      enableEditing();
    }
    refreshButton();
    document.addEventListener('input', onInput);
    document.addEventListener('paste', onPaste);
    document.addEventListener('click', onLinkClick, true);
    setupKeybindingsEditor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
