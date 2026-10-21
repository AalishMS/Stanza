/* Clicks and keys inside the mock. The mock's markup only carries data-act / data-arg / data-field / data-drag; this
   file decides what they do, so the templates stay free of inline handlers. */
(function (S) {
  'use strict';

  const state = S.model.state;
  const heroWindow = S.$('#hero-window');

  const toggle = (map, key) => { map[key] = !map[key]; };

  let copiedTimer = 0;

  /* Answers the permission prompt on the Needs input screen with option i (0-based). */
  function answerPrompt(i) {
    state.promptCursor = i;
    state.promptAnswer = i;
    S.hero.draw();
  }

  const ACTIONS = {
    noop: () => {},
    selectView: screen => S.hero.show(screen),
    openDoc: () => { state.rightSidebarOpen = true; S.hero.show('markdown'); },
    toggleDocEdit: () => { state.docEditing = !state.docEditing; S.hero.draw(); },
    toggleLeftSidebar: () => { state.leftSidebarOpen = !state.leftSidebarOpen; S.hero.draw(); },
    toggleRightSidebar: () => { state.rightSidebarOpen = !state.rightSidebarOpen; S.hero.draw(); },
    toggleFolder: key => { toggle(state.collapsedFolders, key); S.hero.draw(); },
    toggleRightSection: key => { toggle(state.collapsedRight, key); S.hero.draw(); },
    setSplitFocus: pane => { state.focusedSplitPane = Number(pane); S.hero.draw(); },
    cycleAutoMode: () => { S.model.cycleAutoMode(); S.redraw(); },
    toggleWorkingVariant: () => S.hero.toggleWorking(),
    answerPrompt: i => answerPrompt(Number(i)),
    dismissToast: () => { state.toastDismissed = true; S.hero.draw(); },
    openAgent: id => { state.dialog = { kind: 'agent', id }; S.hero.draw(); },
    openImage: id => { state.dialog = { kind: 'image', id }; S.hero.draw(); },
    closeDialog: () => { state.dialog = null; S.hero.draw(); },
    copyPort: () => {
      if (navigator.clipboard) navigator.clipboard.writeText('http://localhost:5173').catch(() => {});
      state.copiedPort = true;
      S.hero.draw();
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { state.copiedPort = false; S.hero.draw(); }, 1500);
    },
    setTheme: theme => S.look.setTheme(theme),
    toggleTheme: () => S.look.toggleTheme(),
    setStanzaAccent: key => S.look.setAccent(key),
    changeTermSize: delta => S.look.changeTermSize(Number(delta)),
    startShortcutRecord: name => {
      state.recordingShortcutId = state.recordingShortcutId === name ? null : name;
      S.redraw();
    },
  };

  /* Outside the hero only the settings controls of data-editable windows act; everything else there is a picture. */
  const IN_PLACE = new Set(['setTheme', 'toggleTheme', 'setStanzaAccent', 'changeTermSize', 'startShortcutRecord']);

  const REPLY = prompt => `This is a demo, so nothing ran. In Stanza, "${prompt}" goes to the real claude CLI.`;

  function onClick(event) {
    const control = event.target.closest('[data-act]');
    if (!control) return;
    const { act, arg } = control.dataset;
    if (!control.closest('#hero-window') && !IN_PLACE.has(act)) return;
    ACTIONS[act](arg);
  }

  /* Keys for the permission prompt, while focus is on the live window itself (clicking into it focuses it). */
  function promptKey(event) {
    if (event.target !== heroWindow || state.activeView !== 'needs-input' || state.promptAnswer !== null) return false;
    const count = S.mock.PROMPT_OPTIONS;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      state.promptCursor = (state.promptCursor + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
      S.hero.draw();
    } else if (event.key === 'Enter') {
      answerPrompt(state.promptCursor);
    } else if (event.key === 'Escape') {
      answerPrompt(count - 1);
    } else if (/^[1-9]$/.test(event.key) && Number(event.key) <= count) {
      answerPrompt(Number(event.key) - 1);
    } else {
      return false;
    }
    return true;
  }

  function onKeydown(event) {
    const { target } = event;
    if (!(target instanceof Element)) return;

    if (target.dataset.field === 'markdown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      state.docText = target.value;
    } else if (event.key === 'Escape' && state.dialog && target.closest('#hero-window')) {
      state.dialog = null;
      S.hero.draw();
    } else if (promptKey(event)) {
      event.preventDefault();
    } else if (target.dataset.field === 'prompt' && event.key === 'Enter') {
      const prompt = target.value.trim();
      if (!prompt) return;
      state.customPromptHistory.push({ prompt, reply: REPLY(prompt) });
      S.hero.draw();
    } else if (target.dataset.field === 'shell' && event.key === 'Enter') {
      const input = target.value;
      const entry = { prompt: S.mock.shell.prompt(), input, out: [] };
      const out = S.mock.shell.run(input);
      if (out) state.shellLog = [...state.shellLog, { ...entry, out }].slice(-30);
      S.hero.draw();
    } else if (event.key === 'Escape' && state.recordingShortcutId) {
      state.recordingShortcutId = null;
      S.redraw();
    }
  }

  function onInput(event) {
    if (event.target.dataset.field === 'markdown') {
      state.docText = event.target.value;
      return;
    }
    if (event.target.dataset.field !== 'search') return;
    state.searchQuery = event.target.value;
    S.hero.draw();
  }

  /* Dragging the split's divider. Only the grid and the handle move while dragging; the ratio is saved (and the
     mock redrawn) on release. getBoundingClientRect already includes the window's scale. */
  function onPointerDown(event) {
    const handle = event.target.closest('[data-drag="split"]');
    if (!handle || !handle.closest('#hero-window') || event.button !== 0) return;
    event.preventDefault();
    const main = handle.parentElement;
    const rect = main.getBoundingClientRect();
    let ratio = state.splitRatio;

    const move = ev => {
      ratio = Math.round(Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      main.style.gridTemplateColumns = `${ratio}% minmax(0, 1fr)`;
      handle.style.left = `${ratio}%`;
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      state.splitRatio = ratio;
      S.hero.draw();
    };

    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('input', onInput);
    document.addEventListener('pointerdown', onPointerDown);
  }

  S.actions = { init };
})(window.Stanza);
