'use strict';

/* global Terminal, FitAddon, WebLinksAddon, WebglAddon, api */
/* global contextWindow, normCombo, comboOf, matchShortcut, projectToFront, distinctParent, dialogOpen, lineCells, fileMatches, jumpPill, promptBox, lineShift, claudeBanner, wheelNotch, altThumbTop, matchSessions, eolOf, withEol, activityGrid, monthLabels, inlineMarks, linePairs -- lib/ui.js */
/* global parseMarkdown -- lib/md.js */

// ------------------------------------------------------------- helpers ----

const $ = (sel, root = document) => root.querySelector(sel);
/** Read a CSS custom property from :root (styles.css is loaded before this script). */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Theme: main sets nativeTheme.themeSource from ui.theme (dark | light | system) before the window opens, so
// prefers-color-scheme already resolves it here. ui.claude (the Claude colors switch) picks Claude desktop's palette for
// that scheme: claude-dark / claude-light; before init() loads ui, preload's initialClaude says whether it is on.
// data-theme picks the token set in styles.css; set it before first paint.
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
const schemeName = (claude) => (claude ? 'claude-' : '') + (darkScheme.matches ? 'dark' : 'light');
const themeName = () => schemeName(ui.claude);
document.documentElement.dataset.theme = schemeName(api.initialClaude);

/** Tiny DOM builder. Text is always added as text nodes; `html` is for static icons only. */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  spark: '<path d="M14.2 12.3L21.4 13.3M13.7 13.4L17.5 16.3M12.8 14.0L15.2 20.0M11.7 14.2L11.1 18.3M10.6 13.7L6.3 19.2M10.0 12.8L5.1 14.8M9.8 11.7L3.3 10.8M10.3 10.6L6.8 7.9M11.2 10.0L8.4 3.1M12.3 9.8L13.0 5.1M13.4 10.3L17.0 5.5M14.0 11.2L18.3 9.5"/>', // the Claude colors switch's thumb: twelve uneven rays
  redo: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  branch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  folderPlus: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  link: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  chevron: '<polyline points="9 18 15 12 9 6"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  panelRight: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>',
  rows: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/>',
  undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  fork: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  diff: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M9 10h6M12 13V7M9 17h6"/>',
  foldAll: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>',
  unfoldAll: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
};
const ico = (name) =>
  h('span', { class: 'ico', html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>` });

const LOGO_IMG = `<img src="../assets/icon.png" alt="" aria-hidden="true" draggable="false">`;

// The official VS Code logo in its own colors (the one exception to monochrome icons, see DESIGN.md).
// stroke="none" on the outer group cancels the `.ico svg` outline styling.
const VSCODE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="none">
<defs>
<mask id="vsc-mask" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M70.9119 99.3171C72.4869 99.9307 74.2828 99.8914 75.8725 99.1264L96.4608 89.2197C98.6242 88.1787 100 85.9892 100 83.5872V16.4133C100 14.0113 98.6243 11.8218 96.4609 10.7808L75.8725 0.873756C73.7862 -0.130129 71.3446 0.11576 69.5135 1.44695C69.252 1.63711 69.0028 1.84943 68.769 2.08341L29.3551 38.0415L12.1872 25.0096C10.589 23.7965 8.35363 23.8959 6.86933 25.2461L1.36303 30.2549C-0.452552 31.9064 -0.454633 34.7627 1.35853 36.417L16.2471 50.0001L1.35853 63.5832C-0.454633 65.2374 -0.452552 68.0938 1.36303 69.7453L6.86933 74.7541C8.35363 76.1043 10.589 76.2037 12.1872 74.9905L29.3551 61.9587L68.769 97.9167C69.3925 98.5406 70.1246 99.0104 70.9119 99.3171ZM75.0152 27.2989L45.1091 50.0001L75.0152 72.7012V27.2989Z"/></mask>
<filter id="vsc-shadow" x="-8.39" y="15.88" width="116.73" height="92.25" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="4.16667" flood-color="#000" flood-opacity="0.25"/></filter>
<filter id="vsc-shadow2" x="60.42" y="-8.08" width="47.92" height="116.15" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="4.16667" flood-color="#000" flood-opacity="0.25"/></filter>
<linearGradient id="vsc-sheen" x1="49.9392" y1="0.257812" x2="49.9392" y2="99.7423" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<g mask="url(#vsc-mask)">
<path fill="#0065A9" d="M96.4614 10.7962L75.8569 0.875542C73.4719 -0.272773 70.6217 0.211611 68.75 2.08333L1.29858 63.5832C-0.515693 65.2373 -0.513607 68.0937 1.30308 69.7452L6.81272 74.754C8.29793 76.1042 10.5347 76.2036 12.1338 74.9905L93.3609 13.3699C96.086 11.3026 100 13.2462 100 16.6667V16.4275C100 14.0265 98.6246 11.8378 96.4614 10.7962Z"/>
<path fill="#007ACC" filter="url(#vsc-shadow)" d="M96.4614 89.2038L75.8569 99.1245C73.4719 100.273 70.6217 99.7884 68.75 97.9167L1.29858 36.4169C-0.515693 34.7627 -0.513607 31.9063 1.30308 30.2548L6.81272 25.246C8.29793 23.8958 10.5347 23.7964 12.1338 25.0095L93.3609 86.6301C96.086 88.6974 100 86.7538 100 83.3334V83.5726C100 85.9735 98.6246 88.1622 96.4614 89.2038Z"/>
<path fill="#1F9CF0" filter="url(#vsc-shadow2)" d="M75.8578 99.1263C73.4721 100.274 70.6219 99.7885 68.75 97.9166C71.0564 100.223 75 98.5895 75 95.3278V4.67213C75 1.41039 71.0564 -0.223106 68.75 2.08329C70.6219 0.211402 73.4721 -0.273666 75.8578 0.873633L96.4587 10.7807C98.6234 11.8217 100 14.0112 100 16.4132V83.5871C100 85.9891 98.6234 88.1786 96.4586 89.2196L75.8578 99.1263Z"/>
<path fill="url(#vsc-sheen)" opacity="0.25" style="mix-blend-mode:overlay" fill-rule="evenodd" clip-rule="evenodd" d="M70.8511 99.3171C72.4261 99.9306 74.2221 99.8913 75.8117 99.1264L96.4 89.2197C98.5634 88.1787 99.9392 85.9892 99.9392 83.5871V16.4133C99.9392 14.0112 98.5635 11.8217 96.4001 10.7807L75.8117 0.873695C73.7255 -0.13019 71.2838 0.115699 69.4527 1.44688C69.1912 1.63705 68.942 1.84937 68.7082 2.08335L29.2943 38.0414L12.1264 25.0096C10.5283 23.7964 8.29285 23.8959 6.80855 25.246L1.30225 30.2548C-0.513334 31.9064 -0.515415 34.7627 1.29775 36.4169L16.1863 50L1.29775 63.5832C-0.515415 65.2374 -0.513334 68.0937 1.30225 69.7452L6.80855 74.754C8.29285 76.1042 10.5283 76.2036 12.1264 74.9905L29.2943 61.9586L68.7082 97.9167C69.3317 98.5405 70.0638 99.0104 70.8511 99.3171ZM74.9544 27.2989L45.0483 50L74.9544 72.7012V27.2989Z"/>
</g></g></svg>`;

// macOS: app shortcuts use Cmd so Ctrl stays Claude's (Ctrl+Tab stays, Cmd+Tab is the OS switcher; Alt+1..9 is Cmd+1..9).
const IS_MAC = api.platform === 'darwin';
const mod = (e) => (IS_MAC ? e.metaKey : e.ctrlKey);
/** Shortcut text for tooltips: "Ctrl+Shift+S" on Windows, "⌘⇧S" on macOS. */
const kbd = (s) => (IS_MAC
  ? s.replace(/Ctrl\+Alt\+/g, '⌘⌥').replace(/Alt\+/g, '⌘').replace(/Ctrl\+(?!Tab)/g, '⌘').replace(/Shift\+/g, '⇧')
  : s);
const SHELL_LABEL = IS_MAC ? 'Shell' : 'PowerShell';
const FILES_APP = IS_MAC ? 'Finder' : 'Explorer';

// ------------------------------------------------------------- shortcuts ----
// Every app shortcut is an action with a list of key combos, editable on the settings page (ui.keys stores only the
// actions that differ from these defaults). Combos name physical keys (KeyboardEvent.code), so Shift or Option never
// change the key: "Ctrl+Shift+KeyT". `Digits` stands for 1..9 and `Arrows` for the four arrow keys (the action gets
// the number or direction). An action that returns false didn't apply (pane keys without a split): the key then
// reaches the terminal as usual.

const M = IS_MAC ? 'Cmd' : 'Ctrl'; // macOS: Cmd, so Ctrl stays Claude's
const JUMP = IS_MAC ? 'Cmd' : 'Alt'; // Alt+1..9 / Alt+arrows are Cmd+1..9 / Cmd+arrows on macOS
// Zoom keys: with a terminal focused they change its text size, anywhere else the whole window's zoom.
const ZOOM_HINT = 'In a terminal: its text size. Elsewhere: the whole window';
const inTerminal = () => !!document.activeElement?.closest('.xterm');
const SHORTCUTS = [
  { id: 'newSession', group: 'Sessions', label: 'New Claude session', keys: [`${M}+KeyT`, `${M}+Shift+KeyT`], run: () => newSessionHere() },
  { id: 'closeSession', group: 'Sessions', label: 'Close session', keys: [`${M}+KeyW`, `${M}+Shift+KeyW`], run: () => { if (activeId) closeTab(activeId); } },
  { id: 'nextSession', group: 'Sessions', label: 'Next session', keys: ['Ctrl+Tab'], run: () => cycleTab(1) },
  { id: 'prevSession', group: 'Sessions', label: 'Previous session', keys: ['Ctrl+Shift+Tab'], run: () => cycleTab(-1) },
  { id: 'gotoSession', group: 'Sessions', label: 'Go to session 1–9', pattern: 'Digits', keys: [`${JUMP}+Digits`],
    run: (n) => { const id = [...tabs.keys()][n - 1]; if (id) activate(id); } },
  { id: 'splitRight', group: 'Split view', label: 'New session beside', keys: [`${M}+Shift+ArrowRight`], run: () => splitHere(false) },
  { id: 'splitDown', group: 'Split view', label: 'New session below', keys: [`${M}+Shift+ArrowDown`], run: () => splitHere(true) },
  { id: 'splitUp', group: 'Split view', label: 'New session above', keys: [`${M}+Shift+ArrowUp`], run: () => splitHere(true, true) },
  { id: 'minimizePane', group: 'Split view', label: 'Take session out of split', hint: 'Keeps it running; only while split',
    keys: [`${M}+Shift+Slash`], run: () => (curSplit() ? minimizePane(activeId) : false) },
  { id: 'unsplit', group: 'Split view', label: 'Back to one terminal', keys: [`${M}+Shift+Backslash`], run: () => unsplit() },
  { id: 'focusPane', group: 'Split view', label: 'Move focus to the pane in that direction', hint: 'Only while split, otherwise the keys reach the terminal',
    pattern: 'Arrows', keys: [`${JUMP}+Arrows`], run: (dir) => focusPane(dir) },
  { id: 'resizePane', group: 'Split view', label: 'Resize panes', hint: 'Moves the divider in that direction, only while split',
    pattern: 'Arrows', keys: [`${M}+Alt+Arrows`], run: (dir) => nudgeSplit(dir) },
  { id: 'toggleSidebar', group: 'Window', label: 'Toggle sidebar', keys: [`${M}+KeyS`, `${M}+Shift+KeyB`], run: () => setSidebar(!ui.sidebar) },
  { id: 'toggleRside', group: 'Window', label: 'Toggle right sidebar', keys: [`${M}+Shift+KeyS`], run: () => setServers(!rsideShown()) },
  { id: 'showChanges', group: 'Window', label: 'Show changes', hint: 'The project\'s uncommitted changes, in the right sidebar', keys: [`${M}+Shift+KeyG`], run: () => toggleDiff() },
  { id: 'search', group: 'Window', label: 'Search sessions', keys: [`${M}+KeyK`, `${M}+Shift+KeyF`],
    run: () => { setSidebar(true); $('#session-search').focus(); $('#session-search').select(); } },
  { id: 'settings', group: 'Window', label: 'Settings', keys: [`${M}+Comma`], run: () => toggleSettings() },
  { id: 'zoomIn', group: 'Zoom', label: 'Zoom in', hint: ZOOM_HINT, keys: [`${M}+Equal`, `${M}+NumpadAdd`],
    run: () => (inTerminal() ? setFontSize(ui.fontSize + 1) : stepZoom(1)) },
  { id: 'zoomOut', group: 'Zoom', label: 'Zoom out', hint: ZOOM_HINT, keys: [`${M}+Minus`, `${M}+NumpadSubtract`],
    run: () => (inTerminal() ? setFontSize(ui.fontSize - 1) : stepZoom(-1)) },
  { id: 'zoomReset', group: 'Zoom', label: 'Reset zoom', hint: ZOOM_HINT, keys: [`${M}+Digit0`, `${M}+Numpad0`],
    run: () => (inTerminal() ? setFontSize(FONT_SIZE.default) : setZoom(1)) },
];

const defaultKeys = (s) => s.keys.map(normCombo);

let keymap = {}; // action id -> [combo], the effective bindings

function loadKeys(saved) {
  keymap = {};
  for (const s of SHORTCUTS) {
    const own = saved && Array.isArray(saved[s.id]) ? saved[s.id].filter((c) => typeof c === 'string' && c) : null;
    keymap[s.id] = own ? [...new Set(own.map(normCombo))] : defaultKeys(s);
  }
}

const isCustom = (s) => keymap[s.id].join() !== defaultKeys(s).join();

function saveKeys() {
  const diff = {};
  for (const s of SHORTCUTS) if (isCustom(s)) diff[s.id] = keymap[s.id];
  api.setUi({ keys: diff });
}

/** Run the action bound to this key event. Exact combos win over Digits / Arrows patterns. Returns whether it was handled. */
function runShortcut(e) {
  const hit = matchShortcut(SHORTCUTS, keymap, e);
  return !!hit && hit.s.run(hit.arg) !== false;
}

const KEY_TEXT = {
  Backslash: '\\', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',',
  Period: '.', Slash: '/', Backquote: '`', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Digits: '1…9', Arrows: '←↑→↓', Escape: 'Esc', NumpadAdd: 'Num+', NumpadSubtract: 'Num-',
};
const MAC_MOD = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Cmd: '⌘' };

/** "Ctrl+Shift+KeyT" -> "Ctrl+Shift+T" on Windows, "⇧⌘T" on macOS. */
function comboText(c) {
  const p = c.split('+');
  const code = p.pop();
  const key = KEY_TEXT[code] || code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num');
  return IS_MAC ? p.map((m) => MAC_MOD[m]).join('') + key : [...p.map((m) => (m === 'Cmd' ? 'Win' : m)), key].join('+');
}
/** The first combo of an action as text ('' when unbound), and a tooltip with it: "Close session (Ctrl+W)". */
const keyText = (id) => (keymap[id]?.[0] ? comboText(keymap[id][0]) : '');
const tip = (label, id) => (keyText(id) ? `${label} (${keyText(id)})` : label);

// --------------------------------------------------------------- state ----

let projects = [];
let remotes = [];
let remoteStatuses = {};
const remoteName = (p) => remotes.find((d) => d.id === p?.remoteId)?.name || 'Remote';
const displayPath = (p) => p?.remoteId ? `${remoteName(p)} · ${p.remotePath}` : p?.path || '';
let ui = { sidebar: true, servers: true, fontSize: 14, zoom: 1, theme: 'dark', accent: 'blue', collapsed: [] }; // replaced by the saved state in init()
const tabs = new Map(); // id -> tab
let activeId = null;
// Split groups (runtime only): [{ ids: [tab id, 2-4 of them], cx, ry, v }], newest first; a tab is in at most one.
// The group holding activeId is on screen (activeId is its focused pane); v = stacked.
let splits = [];
const groupOf = (id) => splits.find((g) => g.ids.includes(id)) || null;
const curSplit = () => groupOf(activeId);
let tabSeq = 0; // creation counter: tabLabel numbers by it, so a new tab at the front doesn't renumber the others
let settingsOpen = false; // the settings page covers the terminal area
let rsideAuto = false; // the right sidebar was hidden by autoRside (ui.servers still holds the user's choice)
let rsideForced = false; // the user reopened it by hand in a cramped split: leave it alone until the split changes
let git = {}; // projectPath -> info | null
let ports = { ok: true, servers: [] };
let sessionsBy = {}; // projectPath -> [{ id, title, mtime, birth, model, ctx }], newest first
let usage = null; // { ok, limits: [{ kind, label, percent, resetsAt }] } plan limits from Anthropic
let stats; // Claude Code's /stats cache, summarized by main (summarizeStats), for the home screen; null = none, undefined = not read yet
let update = null; // { available, behind, packaged, subjects } new commits upstream of the app's own git checkout
let updating = false; // git pull / npm install running
let checking = false; // manual "check for updates" fetch running
let checkNote = null; // { text, error } shown in #update-pop after a manual check that found nothing to install
const expanded = new Set(); // project paths whose sessions are shown
const showMore = new Set(); // projects listing every session instead of the newest few
let query = '';
let lastActiveProject = null;
let detailKind = null; // which footer popover is open: 'usage' | 'context' | 'state'
let menuFor = null; // project path whose "…" menu is open
const infoBy = new Map(); // tab id -> { model, effort, agents } for the bar under the terminal
const imagesBy = new Map(); // tab id -> { session, items: [{ id, kind, label, file, exists }] }, newest first
const thumbsBy = new Map(); // tab id -> Map(image id -> data URL, or null when it can't be decoded)
const mcpBy = new Map(); // project path -> { ok, servers: [{ name, status, label }] } from `claude mcp list`
const definedBy = new Map(); // project path -> [{ name, model }] subagents defined in ~/.claude/agents and <project>/.claude/agents
const GLOBAL = ''; // key in both for the home screen (no project): user-level servers and agents

const SESSIONS_SHOWN = 6; // rows per project (open tabs included) before "Show N more"
const CHATS_SHOWN = 4; // the same for the Chats group
// contextWindow(model, used) is in lib/ui.js.
const WINDOW_NOTE = 'Approximate: the window size is assumed from the model (1M for Opus and Sonnet 4.6+, Haiku 5+, Fable, Mythos or a model chosen with [1m]; 200k for older models). Type /context in the tab for exact numbers.';

// Terminal typography. A light body weight with a clearly heavier bold, and generous line spacing, so
// headings, prose, code and dim "thinking"/tool lines stay distinguishable. Size is user-adjustable (Ctrl +/-/0).
// The light theme uses the regular weight: thin dark strokes on white break up.
const TERM_FONT = {
  fontFamily: '"Cascadia Mono", Consolas, Menlo, monospace', // Menlo: macOS
  fontWeightBold: '700',
  minimumContrastRatio: 3, // keeps brightBlack text (shell flags, hints) readable now that brightBlack is a bar color
  lineHeight: 1.4,
  letterSpacing: 0.2,
};
const termWeight = () => (themeName().endsWith('light') ? '400' : '300');
const FONT_SIZE = { min: 10, max: 24, default: 14 };
const ZOOM_STEPS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5]; // window zoom (ui.zoom), main clamps it too

// ANSI palettes per theme (DESIGN.md section 5). Claude Code's message bar is brightWhite on brightBlack, so
// brightBlack is a quiet bar one step off --background and brightWhite the strongest text: white in dark, black in light.
const XTERM_DARK = {
  foreground: '#dcdcdc',
  cursor: '#eaeaea',
  selectionBackground: 'rgba(255, 255, 255, 0.22)',
  black: '#2a2a2a', red: '#e5736f', green: '#86c06c', yellow: '#e2b657',
  blue: '#6fa8dc', magenta: '#c490d1', cyan: '#6ec5c0', white: '#b0b0b0',
  brightBlack: '#262626', // the user's message bar: one step above --background (#0a0a0a)
  brightRed: '#f0908c', brightGreen: '#a3d58b', brightYellow: '#efce7d',
  brightBlue: '#8cc2f0', brightMagenta: '#d8aee3', brightCyan: '#92d9d4', brightWhite: '#ffffff',
};
// Claude colors: Claude desktop's warm dark (ivory text, clay cursor). brightBlack sits one step above #262624.
const XTERM_CLAUDE_DARK = {
  foreground: '#e8e6dc',
  cursor: '#d97757',
  selectionBackground: 'rgba(217, 119, 87, 0.28)',
  black: '#3a3a37', red: '#e5776f', green: '#93b77a', yellow: '#dcb064',
  blue: '#7fa7d6', magenta: '#c49ac9', cyan: '#78bdb1', white: '#a8a69c',
  brightBlack: '#30302e', // the user's message bar: one step above --background (#262624)
  brightRed: '#f09a8c', brightGreen: '#aecd96', brightYellow: '#ecc883',
  brightBlue: '#9fc0e6', brightMagenta: '#d8b6dc', brightCyan: '#98d2c8', brightWhite: '#faf9f5',
};
// ... and its light: cream, warm near-black text. brightBlack sits one step below #faf9f5.
const XTERM_CLAUDE_LIGHT = {
  foreground: '#3d3d3a',
  cursor: '#c96442',
  selectionBackground: 'rgba(201, 100, 66, 0.2)',
  black: '#3d3d3a', red: '#b53b2f', green: '#3e7a2c', yellow: '#8c6100',
  blue: '#2f62a8', magenta: '#8e3f9e', cyan: '#1d7576', white: '#73726c',
  brightBlack: '#ede9de', // the user's message bar: one step below --background (#faf9f5)
  brightRed: '#a02e22', brightGreen: '#326b22', brightYellow: '#7a5300',
  brightBlue: '#2554a0', brightMagenta: '#7c318c', brightCyan: '#146668', brightWhite: '#141413',
};
const XTERM_LIGHT = {
  foreground: '#262626',
  cursor: '#1a1a1a',
  selectionBackground: 'rgba(0, 0, 0, 0.14)',
  black: '#3a3a3a', red: '#c4403b', green: '#3b8a2e', yellow: '#946200',
  blue: '#2a62b0', magenta: '#9440a8', cyan: '#1a7c84', white: '#707070',
  brightBlack: '#ebebeb', // the user's message bar: one step below --background (#ffffff)
  brightRed: '#b02a24', brightGreen: '#2c7a20', brightYellow: '#7d5200',
  brightBlue: '#1d58b0', brightMagenta: '#83309a', brightCyan: '#126c73', brightWhite: '#000000',
};
/** The terminal background is --background of the current theme. */
const xtermTheme = () => ({
  ...{ light: XTERM_LIGHT, 'claude-dark': XTERM_CLAUDE_DARK, 'claude-light': XTERM_CLAUDE_LIGHT }[themeName()] || XTERM_DARK,
  background: cssVar('--background'),
  cursorAccent: cssVar('--background'),
});

/** Theme (settings, or the OS while on System) or accent changed: restyle the page and every terminal. */
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = themeName();
  root.dataset.accent = ui.accent || 'blue';
  const theme = xtermTheme();
  for (const t of tabs.values()) {
    t.term.options.theme = theme;
    t.term.options.fontWeight = termWeight();
  }
  renderSettings();
}
darkScheme.addEventListener('change', applyTheme);

// -------------------------------------------------------------- dialogs ----

/**
 * In-app confirm dialog. `items` is an optional list of { name, sub } rows.
 * Destructive dialogs start with Cancel focused and ignore a bare Enter, so a stray keypress can't confirm.
 */
let cancelDialog = null; // the open confirmDialog's cancel: a new one first resolves the old one as cancelled
function confirmDialog({ title, message, items = [], okLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  cancelDialog?.();
  closeModal?.();
  return new Promise((resolve) => {
    const modal = $('#modal');
    const done = (result) => {
      if (cancelDialog !== cancel) return; // already settled
      cancelDialog = null;
      window.removeEventListener('keydown', onKey, true);
      modal.hidden = true;
      modal.replaceChildren();
      activeTab()?.term.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Enter' && !danger) done(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const cancelBtn = h('button', { class: 'btn outline', onclick: () => done(false) }, cancelLabel);
    modal.replaceChildren(
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h3', {}, title),
        message ? h('p', {}, message) : null,
        items.length
          ? h('ul', { class: 'items' }, items.map((it) =>
              h('li', {}, h('span', { class: 'it-name' }, it.name), h('span', { class: 'it-sub' }, it.sub))))
          : null,
        h('div', { class: 'row' },
          cancelBtn,
          h('button', { class: `btn ${danger ? 'destructive' : 'primary'}`, onclick: () => done(true) }, okLabel))));
    const cancel = () => done(false);
    cancelDialog = cancel;
    modal.hidden = false;
    window.addEventListener('keydown', onKey, true);
    cancelBtn.focus();
  });
}

/**
 * Read-only popup in #modal with a title row and a body: Esc, a click on the backdrop and × close it.
 * Returns `isOpen()` for "closed while loading" checks. A new popup closes the previous one, and settles an open
 * confirmDialog as cancelled. `keys(e)` sees other keys while it is open; returning true swallows the key.
 */
let closeModal = null;
function openModal(title, extra, body, keys) {
  closeModal?.();
  cancelDialog?.();
  const modal = $('#modal');
  let open = true;
  const done = () => {
    if (!open) return;
    open = false;
    closeModal = null;
    window.removeEventListener('keydown', onKey, true);
    modal.onclick = null;
    modal.hidden = true;
    modal.replaceChildren();
    activeTab()?.term.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && document.querySelector('.remote-device-menu:popover-open')) return; // Escape closes the device menu first
    if (e.key === 'Escape') done();
    else if (!keys?.(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  modal.replaceChildren(
    h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'ag-head' },
        h('h3', {}, title), extra,
        h('button', { class: 'btn ghost icon sm', title: 'Close (Esc)', onclick: done }, ico('x'))),
      body));
  modal.onclick = done; // click on the backdrop
  modal.hidden = false;
  window.addEventListener('keydown', onKey, true);
  closeModal = done;
  return { isOpen: () => open };
}

/** Read-only popup with a subagent's prompt: its definition's system prompt and/or what each run of it was given. */
async function agentDialog(a, tab) {
  const body = h('div', { class: 'ag-body' }, h('div', { class: 'rnote' }, 'Loading…'));
  const model = h('span', { class: 'ag-model mono' }, a.model ? prettyModel(a.model) : '');
  const dlg = openModal(a.name, model, body);

  const sec = (label, text) => h('section', { class: 'ag-sec' }, h('div', { class: 'ag-label' }, label), h('pre', { class: 'ag-prompt' }, text));
  let res = null;
  try { res = await api.agentPrompt(tab?.project.path, tab?.sessionId, a.name); } catch { /* shown as empty below */ }
  if (!dlg.isOpen()) return; // closed while loading
  const parts = [];
  if (res?.definition) parts.push(sec('Agent prompt', res.definition));
  // A running run's row is that one run; a type's row lists its runs, each under the model it ran on.
  const all = res?.runs || [];
  const runs = a.runId && all.some((r) => r.id === a.runId) ? all.filter((r) => r.id === a.runId) : all; // its run unreadable: all of them
  if (a.runId && runs[0]?.model) model.textContent = prettyModel(runs[0].model);
  const ctxLine = (r) => {
    if (!r.ctx || !r.model) return null;
    const win = contextWindow(r.model, r.ctx);
    const pct = Math.min(100, Math.round((r.ctx / win) * 100));
    return h('div', { class: 'ag-ctx' }, h('div', { class: 'ctx-line' }, h('span', { class: 'ctx-title' }, 'Context'),
      h('span', { class: 'ctx-val' }, `${fmtTok(r.ctx)} / ${fmtTok(win)} (${pct}%)`)),
      h('span', { class: `meter big ${levelOf(pct)}`.trim() }, h('i', { style: `width:${pct}%` })));
  };
  const runLabel = (r) => `Prompt given${r.description ? `: ${r.description}` : ''}${runs.length > 1 && r.model ? ` (${prettyModel(r.model)})` : ''}`;
  runs.slice(0, 5).forEach((r) => parts.push(h('div', {}, ctxLine(r), sec(runLabel(r), r.prompt || '(empty)'))));
  if (runs.length > 5) parts.push(h('div', { class: 'rnote' }, `${runs.length - 5} older runs not shown.`));
  body.replaceChildren(...(parts.length ? parts : [h('div', { class: 'rnote' }, 'No prompt found: this agent is not defined in a file and has not run in this session.')]));
}

/** Lightbox for an image from the session (Images section): full size is fetched only now. `session` is the transcript the
 * image came from, which stays right after /clear re-points the tab. `items` is the grid as it was when clicked (newest
 * first); the side buttons and ←/→ step through it in that order. */
function imageDialog(tab, session, items, at) {
  const title = document.createTextNode('');
  const path = h('span', { class: 'ag-model mono' });
  const reveal = h('button', { class: 'btn outline sm', onclick: () => api.revealImage(tab.project.path, session, items[at].id) }, `Show in ${FILES_APP}`);
  const stage = h('div', { class: 'img-stage' }, h('div', { class: 'rnote' }, 'Loading…'));
  const step = (d) => {
    if (at + d < 0 || at + d >= items.length) return false;
    show(at + d);
    return true;
  };
  const many = items.length > 1;
  const prev = many ? h('button', { class: 'btn ghost icon', title: 'Previous (←)', 'aria-label': 'Previous image', onclick: () => step(-1) }, ico('chevronLeft')) : null;
  const next = many ? h('button', { class: 'btn ghost icon', title: 'Next (→)', 'aria-label': 'Next image', onclick: () => step(1) }, ico('chevron')) : null;
  const plain = (e) => !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  const dlg = openModal(title, [path, reveal], h('div', { class: 'ag-body img-body' }, prev, stage, next),
    (e) => plain(e) && (e.key === 'ArrowLeft' ? step(-1) : e.key === 'ArrowRight' ? step(1) : false));
  let seq = 0; // a newer step wins over a slower load
  async function show(i) {
    at = i;
    const it = items[i];
    const mine = ++seq;
    title.textContent = it.label;
    path.textContent = it.file || 'Pasted image';
    path.title = it.file || '';
    reveal.style.display = it.exists ? '' : 'none';
    if (many) { prev.disabled = i === 0; next.disabled = i === items.length - 1; }
    stage.classList.add('loading'); // the previous image stays, dimmed, until this one arrives
    let url = null;
    try { url = await api.imageFull(tab.project.path, session, it.id); } catch { /* shown below */ }
    if (!dlg.isOpen() || mine !== seq) return;
    stage.classList.remove('loading');
    stage.replaceChildren(url ? h('img', { class: 'img-full', src: url, alt: it.label }) : h('div', { class: 'rnote' }, 'Could not read this image.'));
  }
  show(at);
}

// ----------------------------------------------------------------- tabs ----

const activeTab = () => tabs.get(activeId);
const tabsOf = (projectPath) => [...tabs.values()].filter((t) => t.project.path === projectPath);
/** Projects without the pinned Chats entry ("No project" sessions in the chat folder). */
const realProjects = () => projects.filter((p) => !p.chat);
/** Projects removed from the list whose tabs are still open: shown at the bottom until their last tab closes. */
function orphanProjects() {
  const listed = new Set(projects.map((p) => p.path));
  const out = new Map();
  for (const t of tabs.values()) if (!listed.has(t.project.path) && !out.has(t.project.path)) out.set(t.project.path, t.project);
  return [...out.values()];
}

/** The parent folders that tell a project apart from others of the same folder name ("clients" for C:\code\clients\app), else ''. */
const projParent = (p) => (p.remoteId ? remoteName(p) : p.chat ? '' : distinctParent(p, realProjects().filter((x) => !x.remoteId)));
/** A project's name for labels and notifications: "app (clients)" when another project is also called "app". */
const projName = (p) => { const up = projParent(p); return up ? `${p.name} (${up})` : p.name; };

/**
 * Is Claude actively working in this tab? Claude Code puts a spinner glyph in the terminal title while it
 * works and "✳" when idle, and it keeps redrawing while busy. Requiring both avoids flagging an idle
 * prompt where you are just typing, or a title that merely lingers.
 */
function isWorking(tab) {
  if (tab.kind !== 'claude' || tab.status !== 'running') return false;
  if (Date.now() - tab.lastOutput > 3000) return false;
  return !tab.title.startsWith('✳');
}

// ------------------------------------------------------- notifications ----
// "Needs input" and "Done" for Claude tabs in the background (or any tab while the window is unfocused).
// Claude Code's default notification channel sends nothing to a terminal it doesn't know (no bell, no OSC 9), and the
// transcript only records a tool call once it has run. What is reliable: the idle title ("✳", see isWorking) plus Claude's
// input dialogs (permission, AskUserQuestion, folder trust), which all end in an "Esc to cancel" footer at the bottom
// of the screen. A bell or OSC 9/777 (users who set Claude's notification channel) also counts as needs input.

const DONE_MIN_RUN = 10000; // a run shorter than this is not worth a "Done"
const DONE_IDLE = 4000; // idle this long before a run counts as finished, so a flicker between steps is one run

/** Is one of Claude's input dialogs open at the bottom of this tab's screen? */
const awaitingInput = (tab) => dialogOpen(tab.term.buffer.active);

function notifyTab(tab, what) {
  tab.notified = true;
  if (visibleIds().includes(tab.id) && document.hasFocus()) return; // the user is looking at it (any pane of the split)
  api.notify({ tabId: tab.id, title: `${projName(tab.project)}: ${what}`, body: paneTitle(tab) });
}

/** Called every 1.5 s per Claude tab: follows runs (working stretches) and dialogs, one notification per event. */
function trackTab(t) {
  if (t.kind !== 'claude' || t.status !== 'running') return;
  const now = Date.now();
  if (isWorking(t)) {
    if (!t.run) t.run = { start: now };
    t.run.last = now;
    t.notified = false;
    t.wasWorking = true;
    return;
  }
  if (t.wasWorking) { t.wasWorking = false; if (!t.sessionId) soonSessions(); } // a first reply gets the transcript listed
  // Re-read the screen only after xterm parsed new output (onWriteParsed); otherwise the last answer still holds.
  if (t.screenDirty !== false) { t.screenDirty = false; t.awaiting = awaitingInput(t); }
  if (t.title.startsWith('✳') && t.awaiting) {
    if (!t.prompted) { t.prompted = true; t.run = null; notifyTab(t, 'Needs input'); }
    return;
  }
  t.prompted = false; // dialog answered: the next one is a new event
  if (t.run && now - t.run.last > DONE_IDLE) {
    const long = t.run.last - t.run.start >= DONE_MIN_RUN;
    t.run = null;
    if (long) notifyTab(t, 'Done');
  }
}

/** A bell or OSC 9/777 from Claude: needs input, unless this idle stretch was already announced (Claude's 60 s idle ping). */
function onClaudeSignal(tab) {
  if (tab.kind !== 'claude' || tab.notified || tab.prompted) return;
  tab.run = null;
  notifyTab(tab, 'Needs input');
}

function tabLabel(tab) {
  const same = [...tabs.values()].filter((t) => t.project.path === tab.project.path && t.kind === tab.kind)
    .sort((a, b) => a.seq - b.seq);
  const n = same.indexOf(tab) + 1;
  return same.length > 1 ? `${projName(tab.project)} ${n}` : projName(tab.project);
}

async function openSession(project, { kind = 'claude', resumeId = null, runtimeId = null, fork = false, skipPerms = false, beside = false, below = false, at } = {}) {
  const tab = createTab(project, { kind, resumeId, runtimeId, fork });
  tab.skipPerms = skipPerms; // --dangerously-skip-permissions, kept for Restart/Resume (not saved: restored tabs ask again)
  if (beside) addToSplit(tab.id, at, below);
  activate(tab.id);
  fitTab(tab);
  await startPty(tab);
  return tab;
}

/** A tab with its terminal, not started and not shown yet. New tabs go first (newest on top); `append` keeps a restored order. */
function createTab(project, { kind = 'claude', resumeId = null, runtimeId = null, fork = false, append = false } = {}) {
  fork = !!(fork && resumeId); // --fork-session: resumes a copy under a new session id, matched later like a fresh tab
  const id = crypto.randomUUID();
  const head = h('div', { class: 'pane-head' });
  const host = h('div', { class: 'term-host' }, head);
  $('#terminals').append(host);
  hostObserver.observe(host);
  // Not on a pane header's − / ×: activating rebuilt the headers, and the button pressed was gone before the click.
  host.addEventListener('mousedown', (e) => {
    if (activeId !== id && visibleIds().includes(id) && !e.target.closest('.pane-head button')) activate(id);
  }, true);

  const term = new Terminal({
    ...TERM_FONT,
    fontWeight: termWeight(),
    fontSize: ui.fontSize,
    cursorBlink: true,
    scrollback: 20000,
    allowProposedApi: true,
    theme: xtermTheme(),
    // macOS (both are already the defaults on Windows): right-click must not select a word, or the contextmenu
    // handler copies it instead of pasting; Option acts as Meta so Claude's Option+P/T/B/F shortcuts work.
    rightClickSelectsWord: false,
    macOptionIsMeta: IS_MAC,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  // Links open on Ctrl+click (Cmd on macOS), so a plain click in Claude's screen never opens a browser or editor by accident.
  term.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => { if (mod(e)) api.openExternal(uri); }));
  term.open(host);

  const tab = {
    id, project, kind, term, fit, host, head, seq: ++tabSeq, runtimeId,
    resumeId, fork, sessionId: fork ? null : resumeId, startedAt: Date.now(), // sessionId of fresh/forked tabs is matched later (assignSessions)
    status: 'starting', exitCode: null, title: '',
    parked: !!resumeId && !fork && !append, // a reopened past session keeps its place until the first prompt (trackTab)
    lastActive: 0, lastOutput: 0, attention: false, busy: false, busyTimer: null,
    enters: [], // when an Enter was typed (the last 100): tells which tab a new transcript belongs to (assignSessions)
  };
  tabs.set(id, tab);
  if (!append && !tab.parked) toFront([id]);
  if (!project.remoteId) term.registerLinkProvider(fileLinks(tab));
  wireTerminal(tab);
  wireScrollbar(tab);
  return tab;
}

/**
 * Reopen the tabs of the last run (main already dropped entries whose project or transcript is gone), in their saved
 * order. Only the tabs that were on screen are saved (see saveTabs). The active one starts first; the others follow one
 * by one so several `claude --resume` don't boot at once.
 */
async function restoreTabs(saved) {
  const bySaved = []; // saved index -> tab (null if it couldn't be made), so split groups can name their members
  for (const r of saved?.tabs || []) {
    let tab = null;
    try {
      const project = projects.find((p) => p.path === r.project);
      if (project) tab = createTab(project, { kind: r.kind, runtimeId: r.runtimeId, resumeId: r.kind === 'claude' ? r.sessionId : null, append: true });
    } catch { /* skip this one */ }
    bySaved.push(tab);
  }
  const made = bySaved.filter(Boolean);
  restoring = false;
  if (!made.length) { syncHome(); return; }
  made.forEach((t, i) => { t.seq = tabSeq - i; }); // saved newest first: the oldest keeps the lowest number
  for (const g of saved.splits || []) {
    const ids = [...new Set(g.tabs.map((i) => bySaved[i]?.id).filter((id) => id && !groupOf(id)))].slice(0, SPLIT_MAX);
    if (ids.length >= 2) splits.push({ ids, cx: g.cx, ry: g.ry, v: g.v, color: splits.length % GROUP_COLORS });
  }
  const first = bySaved[saved.active] || made[0];
  activate(first.id, { touch: false });
  fitTab(first);
  const firstStart = startPty(first);
  if (!first.project.remoteId) await firstStart;
  // the panes on screen with it start next, then the rest
  const shown = visibleIds();
  for (const t of [...made.filter((x) => shown.includes(x.id)), ...made.filter((x) => !shown.includes(x.id))]) {
    if (t === first) continue;
    await new Promise((r) => setTimeout(r, 400));
    if (!tabs.has(t.id)) continue; // closed meanwhile
    // Hidden terminals can't measure themselves: start at the visible one's size, activate() refits later.
    if (t.host.offsetWidth) fitTab(t);
    else try { t.term.resize(first.term.cols, first.term.rows); } catch { /* keep 80x24 */ }
    if (t.project.remoteId) startPty(t).catch(() => {});
    else await startPty(t).catch(() => {});
  }
}

/**
 * Remember the tabs on screen (the active tab, or its split group) for the next launch: shells, and Claude tabs once their
 * transcript is known. The rest stay one click away in the sidebar's session lists. Diffed, so cheap to call.
 */
let savedTabsKey = '';
function saveTabs() {
  const seen = new Set();
  const shown = visibleIds();
  const list = [...tabs.values()].filter((t) => {
    if (!shown.includes(t.id)) return false;
    if (t.kind === 'shell') return true;
    if (t.project.remoteId) return !!t.runtimeId || !!t.sessionId;
    if (!t.sessionId || seen.has(t.sessionId)) return false; // a session shown twice (cloneBeside) is reopened once
    seen.add(t.sessionId);
    return true;
  });
  const payload = {
    tabs: list.map((t) => ({ project: t.project.path, kind: t.kind, sessionId: t.kind === 'claude' ? t.sessionId : null, ...(t.project.remoteId ? { runtimeId: t.runtimeId } : {}) })),
    active: list.indexOf(activeTab()),
    // split groups by index into `tabs`; members not saved (no transcript yet) drop out
    splits: splits.map((g) => ({
      tabs: g.ids.map((id) => list.findIndex((t) => t.id === id)).filter((i) => i >= 0),
      cx: Math.round(g.cx * 1000) / 1000, ry: Math.round(g.ry * 1000) / 1000, v: !!g.v,
    })).filter((g) => g.tabs.length >= 2),
  };
  const key = JSON.stringify(payload);
  if (key === savedTabsKey) return;
  savedTabsKey = key;
  api.saveTabs(payload);
}

async function startPty(tab) {
  if (!tabs.has(tab.id) || tab.startingPty) return;
  tab.startingPty = true;
  let res;
  try {
  if (tab.project.remoteId && tab.runtimeId) {
    const state = await api.remoteRuntime(tab.project.path, tab.runtimeId);
    if (!state.ok) throw Error(state.error);
    if (!state.runtime?.alive) {
      tab.remoteEnded = true; tab.status = 'exited';
      showOverlay(tab, 'Remote session ended. Resume to start a new process.');
      return;
    }
  }
  res = await api.ptyCreate({
    id: tab.id, cwd: tab.project.path, kind: tab.kind, resumeId: tab.resumeId, fork: tab.fork, skipPerms: !!tab.skipPerms,
    runtimeId: tab.runtimeId,
    cols: tab.term.cols, rows: tab.term.rows,
  });
  } catch (e) { res = { ok: false, error: e.message }; }
  finally { tab.startingPty = false; }
  if (!tabs.has(tab.id)) { if (res.ok) api.ptyKill(tab.id); return; } // closed while starting
  if (res.ok) {
    if (tab.project.remoteId) {
      tab.runtimeId = res.runtimeId; tab.remoteEnded = false; tab.reconnectAttempts = 0;
      tab.skipPerms = !!res.skipPerms;
      if (res.sessionId) tab.sessionId = res.sessionId;
      tab.host.querySelector('.overlay')?.remove();
      saveTabs();
    }
    tab.status = 'running';
    tab.exitCode = null;
  } else {
    if (tab.project.remoteId && tab.runtimeId) { remoteDisconnected(tab, res.error); return; }
    tab.status = 'exited';
    showOverlay(tab, `Could not start: ${res.error}`, true);
  }
  renderSidebar(true);
  renderStatus();
}

function remoteNotice(message) {
  return openModal('Remote project', null, h('div', { class: 'ag-body' }, h('p', { class: 'rnote' }, message)));
}

function remoteDisconnected(tab, message = 'Connection lost. Remote work may still be running.') {
  if (!tabs.has(tab.id) || tab.remoteEnded) return;
  const disabled = remotes.find((d) => d.id === tab.project.remoteId)?.enabled === false || remoteStatuses[tab.project.remoteId]?.status === 'disabled';
  if (disabled) message = 'Connection is off. Turn it on in Settings → Connections. Remote sessions keep running.';
  tab.status = 'disconnected'; tab.busy = false;
  tab.host.querySelector('.overlay')?.remove();
  tab.host.append(h('div', { class: 'overlay' },
    h('span', { class: 'msg' }, message),
    disabled ? h('button', { class: 'btn outline sm', onclick: () => { settingsTab = 'connections'; toggleSettings(true); renderSettings(); } }, 'Connections')
      : h('button', { class: 'btn outline sm', onclick: () => reconnectRemote(tab) }, 'Reconnect'),
    h('button', { class: 'btn ghost sm', onclick: () => closeTab(tab.id) }, 'Close tab (keep running)')));
  clearTimeout(tab.reconnectTimer);
  if (!disabled) tab.reconnectTimer = setTimeout(() => reconnectRemote(tab), Math.min(30000, 2000 * 2 ** Math.min(tab.reconnectAttempts || 0, 4)));
  renderSidebar(true); renderStatus();
}

async function reconnectRemote(tab) {
  if (!tabs.has(tab.id) || tab.status === 'running' || tab.startingPty) return;
  if (remotes.find((d) => d.id === tab.project.remoteId)?.enabled === false) return;
  clearTimeout(tab.reconnectTimer);
  tab.reconnectAttempts = (tab.reconnectAttempts || 0) + 1;
  await startPty(tab);
}

async function endRemote(tab) {
  tab.remoteGeneration = (tab.remoteGeneration || 0) + 1;
  delete liveBy[tab.id];
  tab.remoteEnding = true;
  const r = await api.remoteRuntime(tab.project.path, tab.runtimeId, 'end');
  tab.remoteEnding = false;
  if (!r.ok) { remoteNotice(r.error); return false; }
  tab.remoteEnded = true;
  clearTimeout(tab.reconnectTimer);
  return true;
}

/** A reopened past session stops keeping its place: it joins the open tabs at the front (`front` false: just clear the flag). */
function unpark(tab, front = true) {
  if (!tab.parked) return;
  tab.parked = false;
  if (front) { toFront([tab.id]); renderSidebar(true); }
}

function wireTerminal(tab) {
  const { term, host } = tab;

  term.onData((d) => {
    if (tab.project.remoteId && (tab.status !== 'running' || tab.remoteEnding)) return;
    if (d.includes('\r')) {
      tab.enters.push(Date.now());
      if (tab.enters.length > 100) tab.enters.shift();
      if (tab.parked) unpark(tab); // Enter = the first prompt: the row moves up
      if (tab.kind === 'claude') soonSessions(); // /new, /clear and /resume switch the session at once
    }
    api.ptyWrite(tab.id, d);
  });
  term.onResize(({ cols, rows }) => { api.ptyResize(tab.id, cols, rows); autoRside(); });
  term.onTitleChange((t) => { tab.title = t; });
  term.onWriteParsed(() => { tab.screenDirty = true; }); // trackTab re-reads the screen only after it changed
  // OSC 9 (iTerm2) and 777 (notify): what Claude sends when its notification channel is set to one of those.
  // OSC 9;4;... is a progress report (ConEmu), not a message.
  term.parser.registerOscHandler(9, (d) => { if (!/^\d+;/.test(d)) onClaudeSignal(tab); return true; });
  term.parser.registerOscHandler(777, (d) => { if (d.startsWith('notify;')) onClaudeSignal(tab); return true; });
  term.onBell(() => {
    onClaudeSignal(tab);
    if (visibleIds().includes(tab.id) && document.hasFocus()) return;
    tab.attention = true;
    renderSidebar();
    api.flash();
  });

  term.attachCustomKeyEventHandler((e) => {
    // xterm sends a plain \r for Ctrl/Shift+Enter; Claude Code reads \n (Ctrl+J) as "newline".
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey) && !e.altKey) {
      if (e.type === 'keydown') { e.preventDefault(); api.ptyWrite(tab.id, '\n'); }
      return false;
    }
    // macOS: Ctrl+C/V belong to Claude (interrupt, image paste); Cmd+C/V come through the Edit menu as native copy/paste.
    if (IS_MAC || e.type !== 'keydown' || !e.ctrlKey || e.altKey) return true;
    const k = e.key.toLowerCase();
    if (k === 'c' && (term.hasSelection() || e.shiftKey)) {
      e.preventDefault();
      copySelection(tab);
      return false;
    }
    if (k === 'v') {
      e.preventDefault();
      pasteInto(tab);
      return false;
    }
    return true;
  });

  host.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (term.hasSelection()) copySelection(tab);
    else pasteInto(tab);
  });
  host.addEventListener('paste', (e) => {
    if (tab.project.remoteId && [...(e.clipboardData?.items || [])].some((i) => i.kind === 'file')) {
      e.preventDefault(); e.stopPropagation(); remoteNotice('Clipboard image upload is not available for remote sessions yet.');
    }
  }, true);

  // Dropping files pastes their paths, which Claude Code understands (including images).
  host.addEventListener('dragover', (e) => e.preventDefault());
  host.addEventListener('drop', (e) => {
    e.preventDefault();
    if (tab.project.remoteId && e.dataTransfer.files.length) { remoteNotice('File upload is not available for remote sessions yet. Copy files to the server first.'); return; }
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) term.paste(paths.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ') + ' ');
    term.focus();
  });
}

// File links: paths Claude prints (src/main.js:123, C:\x\y.ts:4:2, ./README.md) open in VS Code at that line. A match
// (lib/ui.js: lineCells, fileMatches) becomes a link only if main finds that file (relative to the tab's project);
// answers are cached briefly per folder.
const FILE_TTL = 10000;
const fileCache = new Map(); // `${cwd}\n${path}` -> { abs | null, at }

function fileLinks(tab) {
  return {
    async provideLinks(y, callback) {
      const cells = lineCells(tab.term, y - 1);
      if (!cells || !/[\w]\.[A-Za-z]/.test(cells.text)) return callback(undefined);
      const found = fileMatches(cells.text);
      if (!found.length) return callback(undefined);
      const cwd = tab.project.path;
      const now = Date.now();
      const ask = [...new Set(found.map((f) => f.file).filter((f) => !(fileCache.get(`${cwd}\n${f}`)?.at > now - FILE_TTL)))];
      if (ask.length) {
        try {
          const res = await api.resolveFiles(cwd, ask);
          ask.forEach((f, i) => fileCache.set(`${cwd}\n${f}`, { abs: res[i] || null, at: now }));
        } catch { /* no links this time */ }
        if (fileCache.size > 2000) fileCache.clear();
      }
      const links = found.map(({ m, file }) => {
        const abs = fileCache.get(`${cwd}\n${file}`)?.abs;
        if (!abs) return null;
        const last = m.index + m[0].length - 1;
        return {
          range: { start: { x: cells.col[m.index] + 1, y }, end: { x: cells.col[last] + 1, y } },
          text: m[0],
          decorations: { underline: true, pointerCursor: true },
          activate: (e) => {
            if (!mod(e)) return;
            if (!DOC_RE.test(abs)) { api.openFile(abs, Number(m[1]) || null, Number(m[2]) || null); return; }
            if (activeId !== tab.id) activate(tab.id); // the file tab belongs to this terminal's project
            openDoc(tab.project, abs);
          },
        };
      }).filter(Boolean);
      callback(links.length ? links : undefined);
    },
  };
}

// A thin scrollbar of our own (xterm's is hidden). On the normal buffer (shells) it shows the real position.
// Claude Code's fullscreen UI runs on the alternate screen, which has no scrollback: Claude scrolls its own view and
// never reports where it is, so there the strip forwards wheel input to it and measures the position itself.
// `alt.off` = lines above the bottom, moved by how far the transcript rows shifted between two repaints (`lineShift`;
// counting wheel steps doesn't work, Claude merges steps that arrive together); 0 once Claude's "Jump to bottom" pill
// is gone; its start banner on screen = the top, which gives the extent (`alt.max`). Dragging and track clicks set a
// goal line and steer to it with wheel steps, measuring as Claude moves.
const ALT_THUMB = 40; // thumb height on the alternate screen until the top has been seen
const STEER_GAP = 40; // ms between steering steps
const STEER_RUNS = 4; // steering runs per goal (the first one and corrections)
const STEER_WAIT = 150; // ms without a wheel step before Claude counts as done moving

/** Forward wheel notches to xterm, which turns them into mouse reports (Claude) or viewport scrolling (shells). */
function wheelInto(tab, notches) {
  const screen = tab.term.element?.querySelector('.xterm-screen');
  if (!screen) return;
  const r = screen.getBoundingClientRect();
  for (let i = 0; i < Math.abs(notches); i++) {
    screen.dispatchEvent(new WheelEvent('wheel', {
      deltaY: Math.sign(notches), deltaMode: WheelEvent.DOM_DELTA_LINE,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
    }));
  }
}

function wireScrollbar(tab) {
  const { term, host } = tab;
  const thumb = h('div', { class: 'vthumb' });
  const bar = h('div', { class: 'vbar' }, thumb);
  host.append(bar);
  let drag = null; // { y, top, dy }
  let queued = false;
  // Alternate screen. off/max in lines; snap = transcript rows at the last measure; sent = wheel steps since (the
  // estimate when a move can't be measured), lpn = lines per step (learned), exact = no estimate since the last end;
  // seen = the pill has shown in this tab, top = the banner is on screen; wheelAt = time of the last step; goal = line
  // to steer to, dir = direction of the current steering run (0 = none), runs = runs for this goal.
  const alt = {
    off: 0, max: 0, snap: null, sent: 0, lpn: 3, partial: 0, seen: false, top: false, exact: true, wheelAt: 0,
    goal: null, dir: 0, runs: 0, timer: 0,
  };

  const screenRows = () => {
    const buf = term.buffer.active;
    const out = [];
    // trimEnd: Claude's redraws leave written spaces at some line ends, which translateToString keeps.
    for (let i = 0; i < term.rows; i++) out.push(buf.getLine(buf.viewportY + i)?.translateToString(true).trimEnd() ?? '');
    return out;
  };
  // The transcript part: above the prompt box, minus the 2 rows Claude's pill may cover.
  const transcript = (rows) => {
    const box = promptBox(rows);
    return rows.slice(0, Math.max(1, (box > 0 ? box : rows.length - 8) - 2));
  };
  const later = (ms) => { clearTimeout(alt.timer); alt.timer = setTimeout(queue, ms); };

  // Every wheel report Claude gets (from the strip or straight on the terminal). The snapshot is taken before
  // Claude moves, so the first measure after it sees the whole move.
  host.addEventListener('wheel', (e) => {
    if (!term.element?.contains(e.target) || term.buffer.active.type !== 'alternate') return;
    if (term.modes.mouseTrackingMode === 'none') return;
    const dir = wheelNotch(alt, e, term._core?._renderService?.dimensions?.css?.cell?.height);
    if (!dir) return;
    if (e.isTrusted) alt.goal = null; // the user's own wheel wins over steering
    if (!alt.snap) alt.snap = transcript(screenRows());
    alt.sent += dir;
    alt.wheelAt = performance.now();
    later(STEER_WAIT + 10);
  }, { capture: true });

  const measure = () => {
    const rows = screenRows();
    const cur = transcript(rows);
    const pill = jumpPill(rows);
    const settled = performance.now() - alt.wheelAt > STEER_WAIT;
    let k = 0;
    if (alt.snap) {
      k = cur.join('\n') === alt.snap.join('\n') ? 0 : lineShift(alt.snap, cur);
      if (k === null) { // moved more than a screen (or redrawn): estimate from the steps
        // No overlap means at least a screen (less the 3 rows lineShift needs), mostly more when spun fast.
        alt.off -= Math.sign(alt.sent) * Math.max(Math.abs(alt.sent) * alt.lpn, cur.length - 2);
        alt.exact = false;
      }
      else if (k && alt.sent) alt.lpn = Math.min(term.rows, Math.max(1, alt.lpn * 0.7 + 0.3 * Math.abs(k / alt.sent)));
      if (k) alt.off += k;
    }
    alt.snap = cur;
    if (k !== 0 || settled) alt.sent = 0; // steps not drawn yet stay counted
    alt.off = Math.max(0, alt.off);
    if (pill) alt.seen = true;
    alt.top = pill && claudeBanner(rows.slice(0, 5));
    // At the top: a measured `off` is the extent; an estimated one doesn't replace a measured extent.
    if (alt.top) alt.max = alt.off = Math.max(1, alt.exact ? alt.off : Math.max(alt.off, alt.max));
    else if (pill && alt.off < 1) alt.off = 1;
    else if (!pill && alt.seen && settled) alt.off = 0; // mid-scroll a half-drawn frame may lack the pill
    if (!alt.off || alt.top) alt.exact = true; // a known end: measuring from here is exact again
    if (alt.max && alt.off > alt.max) alt.max = alt.off; // more content since the top was seen
  };

  // Steering toward alt.goal (drag, track click): a run of single wheel steps STEER_GAP ms apart (Claude merges steps
  // sent at once and speeds up for steps in a row), counting the steps not drawn yet; once Claude has settled, check
  // and start a correcting run if needed (at most STEER_RUNS).
  const steer = () => {
    if (alt.goal === null) return;
    const since = performance.now() - alt.wheelAt;
    if (since < STEER_GAP) return later(STEER_GAP - since + 5);
    const err = alt.goal - (alt.off - alt.sent * alt.lpn); // still to go once the steps sent are drawn
    // Stop a run within half a step: the learned (sped-up) step for the first run, one plain step (~3 lines) for
    // corrections, and none toward the bottom, which goes on until the pill is gone.
    const tol = alt.goal === 0 ? 0.5 : alt.runs > 1 ? 1.5 : Math.max(1, alt.lpn / 2);
    if (alt.dir && Math.sign(err) === alt.dir && Math.abs(err) >= tol) {
      wheelInto(tab, alt.dir > 0 ? -1 : 1);
      return later(STEER_GAP + 5);
    }
    if (since <= STEER_WAIT) return later(STEER_WAIT - since + 10); // let Claude finish before checking
    const left = alt.goal - alt.off;
    // The bottom is only reached when Claude's pill is gone; elsewhere within a step (~3 lines) is close enough.
    const done = alt.goal === 0 ? !alt.off : Math.abs(left) <= 2 || (left > 0 && alt.top);
    if (done || alt.runs >= STEER_RUNS) {
      Object.assign(alt, { goal: null, dir: 0, runs: 0 });
      return;
    }
    alt.dir = Math.sign(left);
    alt.runs++;
    steer();
  };

  const altExtent = () => alt.max || term.rows * 8; // assumed until the top has been seen
  const geometry = () => {
    const buf = term.buffer.active;
    const track = bar.clientHeight;
    if (buf.type === 'alternate') {
      const size = alt.max ? Math.max(24, Math.round((track * term.rows) / (term.rows + alt.max))) : ALT_THUMB;
      return { alt: true, track, size, top: altThumbTop(alt.off, alt.max, track - size, altExtent()) };
    }
    const max = buf.baseY;
    if (max <= 0) return null;
    const size = Math.max(24, Math.round((track * term.rows) / buf.length));
    return { alt: false, track, size, max, top: ((track - size) * buf.viewportY) / max };
  };

  const sync = () => {
    queued = false;
    // Off screen (a hidden tab) the bar has no height: skip, the next sync on screen measures from scratch.
    if (term.buffer.active.type === 'alternate' && bar.clientHeight) {
      measure();
      steer();
    } else alt.snap = null;
    const g = geometry();
    bar.classList.toggle('alt', !!g?.alt);
    bar.classList.toggle('empty', !g);
    if (!g) return;
    // While dragging on the alternate screen the thumb follows the pointer; Claude catches up behind it.
    const top = drag && g.alt ? Math.min(g.track - g.size, Math.max(0, drag.top + drag.dy)) : g.top;
    thumb.style.height = `${g.size}px`;
    thumb.style.transform = `translateY(${Math.round(top)}px)`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
  tab.syncScrollbar = queue;
  term.onScroll(queue);
  term.onWriteParsed(() => {
    // While the wheel moves Claude, measure every frame it writes: a fast spin moves more than a screen per animation
    // frame, which can't be matched.
    if (term.buffer.active.type === 'alternate' && performance.now() - alt.wheelAt < 500 && bar.clientHeight) measure();
    queue();
  });
  term.onResize(() => {
    Object.assign(alt, { max: 0, snap: null }); // rows rewrap: the measured extent no longer holds
    queue();
  });
  term.buffer.onBufferChange(() => {
    Object.assign(alt, {
      off: 0, max: 0, snap: null, sent: 0, seen: false, top: false, exact: true, goal: null, dir: 0, runs: 0,
    });
    queue();
  });

  bar.addEventListener('wheel', (e) => {
    e.preventDefault();
    alt.goal = null;
    wheelInto(tab, Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 100)));
  });

  // Clicking the track pages up/down; dragging the thumb scrolls.
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // keep focus in the terminal
    const g = geometry();
    if (!g) return;
    const y = e.clientY - bar.getBoundingClientRect().top;
    if (e.target !== thumb) {
      const dir = y < g.top ? -1 : 1;
      if (g.alt) {
        alt.goal = Math.max(0, (alt.goal ?? alt.off) - dir * Math.max(1, term.rows - 3));
        alt.runs = 0;
        queue();
      } else term.scrollPages(dir);
      return;
    }
    drag = { y: e.clientY, top: g.top, dy: 0 };
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dy = e.clientY - drag.y;
    const g = geometry();
    if (!g) return;
    const room = g.track - g.size;
    if (room <= 0) return; // a very short pane: nowhere to drag
    const ratio = Math.min(1, Math.max(0, (drag.top + drag.dy) / room));
    if (g.alt) {
      alt.goal = Math.round((1 - ratio) * altExtent());
      alt.runs = 0;
    }
    else term.scrollToLine(Math.round(ratio * g.max));
    queue();
  });
  const end = () => {
    if (!drag) return;
    drag = null; // steering goes on until Claude reaches the goal
    bar.classList.remove('dragging');
    queue();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  queue();
}

function copySelection(tab) {
  const text = tab.term.getSelection();
  if (text) api.writeClipboard(text); // Ctrl+Shift+C with nothing selected must not wipe the clipboard
  tab.term.clearSelection();
}

async function pasteInto(tab) {
  const text = await api.readClipboard();
  if (text) tab.term.paste(text);
  else if (tab.project.remoteId) remoteNotice('Clipboard image upload is not available for remote sessions yet.');
  else if (tab.kind === 'claude') api.ptyWrite(tab.id, '\x1bv'); // Alt+V: Claude Code's image paste on Windows
}

/**
 * Exit (or failed start) overlay. A Claude tab that ended with a transcript offers Resume (that session again) and
 * New session; otherwise Restart runs the same command again.
 */
function showOverlay(tab, message, isError = false) {
  tab.host.querySelector('.overlay')?.remove();
  const resumable = !isError && tab.kind === 'claude' && !!tab.sessionId;
  tab.host.append(
    h('div', { class: `overlay${isError ? ' error' : ''}` },
      h('span', { class: 'msg' }, message),
      resumable
        ? [h('button', { class: 'btn outline sm', onclick: () => restartTab(tab, 'resume') }, ico('redo'), 'Resume'),
          h('button', { class: 'btn outline sm', onclick: () => restartTab(tab, 'fresh') }, ico('plus'), 'New session')]
        : h('button', { class: 'btn outline sm', onclick: () => restartTab(tab) }, ico('redo'), 'Restart'),
      h('button', { class: 'btn outline sm', onclick: () => closeTab(tab.id) }, 'Close tab')));
}

/** `mode`: 'resume' = the tab's current session (`--resume`), 'fresh' = a new session, else the same command as before. */
async function restartTab(tab, mode, { touch = true } = {}) {
  if (tab.project.remoteId && tab.remoteOperation) return;
  if (touch && touchProject(tab.project.path)) renderSidebar(true);
  if (tab.project.remoteId) tab.remoteOperation = true;
  try {
  if (tab.project.remoteId) {
    if (tab.runtimeId && !(await endRemote(tab))) return;
    const detached = await api.detachPty(tab.id);
    if (!detached.ok) { remoteNotice(detached.error); return; }
    if (!tabs.has(tab.id)) return;
    tab.runtimeId = null; tab.remoteEnded = false;
  }
  tab.host.querySelector('.overlay')?.remove();
  unpark(tab, false);
  if (mode === 'resume') { tab.resumeId = tab.sessionId; tab.fork = false; }
  if (mode === 'fresh') { tab.resumeId = null; tab.fork = false; }
  tab.term.write(`\r\n\x1b[2m— ${mode === 'resume' ? 'resuming' : 'restarting'}${tab.skipPerms ? ', skipping permissions' : ''} —\x1b[0m\r\n`);
  tab.status = 'starting';
  const old = tab.sessionId;
  tab.sessionId = tab.fork ? null : tab.resumeId; // a restarted fresh (or forked) tab is a new Claude session
  if (!tab.project.remoteId && old && old !== tab.sessionId) retired.add(old);
  tab.startedAt = Date.now();
  await startPty(tab);
  if (tabs.has(tab.id)) tab.term.focus();
  } finally { if (tab.project.remoteId) tab.remoteOperation = false; }
}

/**
 * Restarts a Claude tab on its own transcript with or without --dangerously-skip-permissions. Asks only when Claude
 * is mid-task; the old process must exit before the new one can take the tab's id.
 */
async function relaunchTab(tab, skipPerms) {
  if (tab.project.remoteId && tab.remoteOperation) return;
  if (tab.project.remoteId) tab.remoteOperation = true;
  try {
  if (tab.relaunch) return;
  if (isWorking(tab) && !(await confirmDialog({
    title: 'Relaunch this session?', message: 'Claude is working in it; relaunching stops the current task.', okLabel: 'Relaunch',
  }))) return;
  if (!tabs.has(tab.id)) return;
  if (touchProject(tab.project.path)) renderSidebar(true);
  tab.skipPerms = skipPerms;
  if (tab.project.remoteId) {
    if (tab.runtimeId && !(await endRemote(tab))) return;
    const detached = await api.detachPty(tab.id);
    if (!detached.ok) { remoteNotice(detached.error); return; }
    if (!tabs.has(tab.id)) return;
    tab.runtimeId = null; tab.status = 'exited';
    tab.remoteOperation = false;
    return await restartTab(tab, 'resume', { touch: false });
  }
  if (tab.status === 'running') {
    await new Promise((resolve) => { tab.relaunch = resolve; api.ptyKill(tab.id); });
    delete tab.relaunch;
    if (!tabs.has(tab.id)) return;
  }
  restartTab(tab, 'resume', { touch: false });
  } finally { if (tab.project.remoteId) tab.remoteOperation = false; }
}

/** Only asks if closing interrupts something: Claude mid-task or a dev server this tab started. */
async function confirmClose(tab) {
  if (tab.project.remoteId) return true; // closing only detaches; ending is an explicit menu action
  if (tab.status !== 'running') return true;
  let scan = ports;
  if (Date.now() - portsAt > 10000) scan = await api.listPorts();
  const servers = scan.ok ? scan.servers.filter((s) => s.owner?.type === 'session' && s.owner.sessionId === tab.id) : [];
  const working = isWorking(tab);
  if (!working && !servers.length) return true;
  return confirmDialog({
    title: 'End this session?',
    message: `Closing "${tabLabel(tab)}" will stop:`,
    items: [
      ...(working ? [{ name: 'Claude', sub: 'is working in this session' }] : []),
      ...servers.map((s) => ({ name: `:${s.port}`, sub: s.name })),
    ],
    okLabel: 'End session',
    danger: true,
  });
}

const closing = new Set(); // tab ids whose close is in progress (asking or scanning), so a second close is a no-op
async function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab || closing.has(id)) return;
  closing.add(id);
  try {
    if (!(await confirmClose(tab)) || !tabs.has(id)) return;
  } finally {
    closing.delete(id);
  }
  api.ptyKill(id);
  clearTimeout(tab.reconnectTimer);
  if (!tab.project.remoteId && tab.sessionId) retired.add(tab.sessionId); // no other local tab may take its transcript over
  clearTimeout(tab.busyTimer);
  tab.term.dispose();
  tab.host.remove();
  infoBy.delete(id);
  imagesBy.delete(id);
  thumbsBy.delete(id);
  hostObserver.unobserve(tab.host);
  const order = [...tabs.keys()];
  const idx = order.indexOf(id);
  const slot = groupOf(id)?.ids.indexOf(id) ?? -1;
  tabs.delete(id);
  tab.relaunch?.(); // a relaunch waiting for this pty's exit would wait forever (onPtyExit ignores closed tabs); it sees the tab is gone
  const mates = removeFromSplit(id);
  if (activeId === id) {
    activeId = null;
    // closing a focused pane hands focus to its neighbour in the split, else to the nearest tab
    const next = slot >= 0 && mates.length ? mates[Math.min(slot, mates.length - 1)] : [...tabs.keys()][Math.min(idx, tabs.size - 1)];
    if (next) activate(next, { touch: false });
  } else syncVisible();
  renderAll();
  saveTabs();
  if (!activeId) { pollMcp(); pollDefinedAgents(); } // home screen: the user-level lists
}

function activate(id, { touch = true } = {}) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (touch) touchProject(tab.project.path);
  if (settingsOpen) toggleSettings(false);
  activeId = id;
  tab.lastActive = Date.now();
  tab.attention = false;
  syncVisible();
  requestAnimationFrame(() => tab.term.focus());
  syncHome();
  if (tab.project.path !== lastActiveProject) { // entering a project reveals its sessions
    lastActiveProject = tab.project.path;
    if (!expanded.has(lastActiveProject)) { expanded.add(lastActiveProject); saveExpanded(); }
  }
  renderSidebar(true);
  renderStatus();
  renderFoot();
  renderInfo();
  renderRside();
  pollGit(false);
  pollInfo();
  pollMcp();
  pollDefinedAgents();
  saveTabs();
}

/** Logo / app name: back to the home screen. Open tabs keep running and stay in the sidebar. */
function goHome() {
  if (settingsOpen) toggleSettings(false);
  if (!activeId) return;
  activeId = null;
  document.activeElement?.blur(); // keys must not reach the hidden terminal
  syncVisible();
  renderAll();
  saveTabs();
  pollMcp(); // the user-level lists, as in closeTab
  pollDefinedAgents();
}

/**
 * Fit the terminal to its box, one row short if the renderer's rounded cell height would make the screen taller than
 * the box (it would cover the status bar). Resizes once, straight to the final size, and only when it changed: every
 * resize makes the pty redraw (Claude repaints its whole screen), so fitting to N rows and then dropping to N-1 on each
 * tab switch made the terminal jitter.
 */
function fitTab(tab) {
  try {
    const dims = tab.fit.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
    let { cols, rows } = dims;
    const box = tab.host.querySelector('.xterm');
    // Row height = xterm's measured cell height (the value the fit addon divides by, private API). Not the screen
    // element's height / rows: right after a tab is shown that height can still be the old row count's (the WebGL
    // renderer, loaded in the same frame, updates it on its next render), so a second fit in that frame got a tiny row
    // height, skipped the check below and kept a row too many, which ran under the status bar.
    const rowH = tab.term._core?._renderService?.dimensions?.css?.cell?.height || 0;
    // the fit addon reads the host's border-box height (padding included, 30px more in a split pane), so its row
    // count can be several too many: count the rows that fit the .xterm box
    if (box && rowH && rows * rowH > box.clientHeight) rows = Math.max(1, Math.floor(box.clientHeight / rowH));
    if (cols !== tab.term.cols || rows !== tab.term.rows) tab.term.resize(cols, rows);
  } catch { /* not measurable yet */ }
}

/** Fit every visible pane (just the active tab when not split). Held while the right sidebar slides (slideRside fits after). */
function fitActive() {
  if (slideTimer) return;
  for (const id of visibleIds()) {
    const tab = tabs.get(id);
    if (tab?.host.offsetWidth) fitTab(tab);
  }
}

// ---------------------------------------------------------------- split ----
// Up to 4 tabs side by side. 2 = A|B, 3 = A|(B over C), 4 = (A B)/(C D). cx / ry are the column and row ratios.
// A stacked split (v, started with "New session below") is the same layout transposed: 2 = A over B, 3 = A over (B|C).
// There can be several split groups; focusing a member shows its group, a tab in none shows alone.

const SPLIT_MAX = 4;
const GROUP_COLORS = 5; // .split-group.g0..g4 in styles.css; one group alone is always g0 (--primary)
const SPLIT_MIN_W = 240; // px a pane keeps when a divider is dragged
const SPLIT_MIN_H = 120;
const RSIDE_MIN_COLS = 100; // below this a pane is hard to read: the right sidebar steps aside
const RSIDE_BACK_COLS = RSIDE_MIN_COLS + 6; // ...and returns only with this much room, so it can't flap

const visibleIds = () => curSplit()?.ids || (activeId ? [activeId] : []);

/**
 * Put a tab that is not on screen yet into the visible split at position `at` (default: last), or start a new group with
 * the active tab. A tab leaves its old group first. `below` stacks a new group; one already on screen keeps its orientation.
 * The group moves to the front of the tab order, so it is the newest thing in the sidebar and stays put when unsplit.
 */
function addToSplit(id, at, below = false) {
  if (!activeId || !tabs.has(id)) return;
  const cur = curSplit();
  const base = cur ? cur.ids : [activeId];
  if (base.includes(id) || base.length >= SPLIT_MAX) return;
  removeFromSplit(id);
  const ids = [...base];
  ids.splice(at ?? ids.length, 0, id);
  if (cur) cur.ids = ids;
  else {
    const used = new Set(splits.map((g) => g.color));
    let color = 0;
    while (used.has(color) && color < GROUP_COLORS) color++;
    if (color === GROUP_COLORS) color = splits.length % GROUP_COLORS; // more groups than colors: reuse
    splits.unshift({ ids, cx: 0.5, ry: 0.5, v: below, color });
  }
  rsideForced = false;
  for (const x of ids) { const t = tabs.get(x); if (t) unpark(t, false); }
  toFront(ids);
}

/** Drops a tab from its group (the tab itself stays open); a group of one is no group. Returns the remaining members. */
function removeFromSplit(id) {
  const g = groupOf(id);
  if (!g) return [];
  g.ids = g.ids.filter((x) => x !== id);
  rsideForced = false;
  if (g.ids.length < 2) splits = splits.filter((x) => x !== g);
  return g.ids;
}

/** End a split group (default: the one on screen); its tabs stay open where they are. */
function unsplit(g = curSplit()) {
  if (!g) return;
  splits = splits.filter((x) => x !== g);
  rsideForced = false;
  syncVisible();
  renderSidebar(true); // drops the split group
  saveTabs();
}

/** Take one pane out of its split; the tab keeps running and stays in the sidebar. */
function minimizePane(id) {
  const g = groupOf(id);
  if (!g) return;
  const slot = g.ids.indexOf(id);
  const mates = removeFromSplit(id); // a group left with one tab is dropped
  if (activeId === id) activate(mates[Math.min(slot, mates.length - 1)], { touch: false }); // focus moves to its neighbour
  else syncVisible();
  renderSidebar(true); // the split box loses the row
  saveTabs();
}

/** Move tabs to the front of the tab order (sidebar, Alt+1..9, Ctrl+Tab, saved order), keeping their given order. */
function toFront(ids) {
  const order = [...ids, ...[...tabs.keys()].filter((x) => !ids.includes(x))];
  if (order.join() === [...tabs.keys()].join()) return;
  const entries = order.map((x) => [x, tabs.get(x)]);
  tabs.clear();
  for (const [k, v] of entries) tabs.set(k, v);
  saveTabs();
}

/**
 * WebGL renderer for panes on screen only: Chromium keeps 16 live WebGL contexts per page and drops the oldest past
 * that, so with many tabs the hidden ones use xterm's DOM renderer (free while hidden) and get WebGL back when shown.
 */
function setWebgl(t, on) {
  if (!on) {
    if (!t.gl) return;
    // The addon's dispose leaves the context to GC, and Chromium counts it until then: release it now.
    const ctx = t.host.querySelector('.xterm-screen canvas:not(.xterm-link-layer)')?.getContext('webgl2');
    t.gl.dispose();
    t.gl = null;
    try { ctx?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
    return;
  }
  if (t.gl) return;
  try {
    const gl = new WebglAddon.WebglAddon();
    gl.onContextLoss(() => { gl.dispose(); if (t.gl === gl) t.gl = null; });
    t.term.loadAddon(gl);
    t.gl = gl;
  } catch {
    /* falls back to the DOM renderer */
  }
}

/** Show exactly the visible tabs (all split members, or just the active one), then refit them. */
function syncVisible() {
  const shown = visibleIds();
  for (const t of tabs.values()) {
    t.host.classList.toggle('active', shown.includes(t.id));
    if (!shown.includes(t.id)) setWebgl(t, false);
  }
  renderSplit();
  requestAnimationFrame(() => {
    for (const id of visibleIds()) { const t = tabs.get(id); if (t) setWebgl(t, true); }
    fitActive();
    for (const id of shown) {
      const t = tabs.get(id);
      if (!t) continue;
      t.term.refresh(0, t.term.rows - 1);
      t.syncScrollbar();
    }
  });
}

/** A new session of the active tab's project beside it (`below`: under it, for a new split; `above`: stacked, placed first). */
function splitHere(below = false, above = false) {
  const tab = activeTab();
  if (!tab) return newSessionHere();
  if (visibleIds().length >= SPLIT_MAX) return;
  openSession(tab.project, { beside: true, below, at: above ? 0 : undefined });
}

/**
 * Another copy of what a tab runs, opened beside: a fork of the Claude session (once it has a transcript; resuming the same
 * one would have two processes appending to one transcript), else a new session, or a fresh shell.
 */
function cloneBeside(tab, at) {
  if (tab.kind === 'shell') return openSession(tab.project, { kind: 'shell', beside: true, at });
  return openSession(tab.project, { resumeId: tab.sessionId || null, fork: !!tab.sessionId, beside: true, at });
}

/** Shift+click on a session row: show it beside the focused pane instead of replacing it. A session already on screen is opened a second time. */
function besideRow(open, openNew) {
  if (open && visibleIds().includes(open.id) && visibleIds().length >= SPLIT_MAX) return activate(open.id);
  if (visibleIds().length >= SPLIT_MAX) return; // the split is full, like splitHere
  if (!open) openNew();
  else if (visibleIds().includes(open.id)) cloneBeside(open);
  else { addToSplit(open.id); activate(open.id); }
}

// ------------------------------------------------------- drag and drop ----
// Drag a session row from the sidebar onto the terminal area (or the home screen): a preview shows the pane it would
// become in the resulting layout. The drop slot is the one (among all positions) whose pane centre is nearest the pointer.
// A session that is already on screen is opened again beside it (the same Claude session resumed in a second pane).

let dragSrc = null; // { id: tab id | null, project, resumeId } while a session row is being dragged
let dropAt = null; // the slot under the pointer, or null when nothing can be dropped

/** Pixel rect of pane `i` in an `n`-pane layout inside a W x H area (`v`: stacked, the 2/3 layouts transposed). */
function cellRect(n, i, cx, ry, W, H, v = false) {
  if (n === 1) return { x: 0, y: 0, w: W, h: H };
  if (v && n < 4) { const c = cellRect(n, i, ry, cx, H, W); return { x: c.y, y: c.x, w: c.h, h: c.w }; }
  const col = n === 2 ? i : n === 3 ? (i === 0 ? 0 : 1) : i % 2;
  const row = n === 2 || (n === 3 && i === 0) ? -1 : n === 3 ? i - 1 : i >> 1;
  return {
    x: col ? cx * W : 0, w: col ? (1 - cx) * W : cx * W,
    y: row === 1 ? ry * H : 0, h: row < 0 ? H : row === 1 ? (1 - ry) * H : ry * H,
  };
}

function rowDrag(src) {
  return {
    draggable: 'true',
    ondragstart: (e) => {
      dragSrc = src;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', src.resumeId || src.id || '');
      setTimeout(() => { // after the drag image is taken
        document.body.classList.toggle('dragging-session', !!dragSrc);
        if (dragSrc) { leftPeek.set(false); rightPeek.set(false); } // a peeking sidebar would cover the drop targets
      });
    },
    ondragend: endDrag,
  };
}

function endDrag() {
  const was = dragSrc;
  dragSrc = dropAt = null;
  document.body.classList.remove('dragging-session');
  $('#drop-preview').hidden = true;
  if (was) renderSidebar(true); // renders were held back while dragging
}

function wireDropZone() {
  const zone = $('#dropzone');
  const preview = $('#drop-preview');
  const box = $('#terminals');

  zone.addEventListener('dragover', (e) => {
    if (!dragSrc) return;
    const base = visibleIds(); // empty on the home screen: the whole area is the target
    if (base.length >= SPLIT_MAX) { dropAt = null; preview.hidden = true; e.dataTransfer.dropEffect = 'none'; return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = box.getBoundingClientRect();
    const n = base.length + 1;
    const cur = curSplit();
    const cx = cur?.cx ?? 0.5, ry = cur?.ry ?? 0.5, v = !!cur?.v;
    let best = null;
    for (let k = 0; k < n; k++) {
      const c = cellRect(n, k, cx, ry, r.width, r.height, v);
      const d = Math.hypot(e.clientX - r.left - (c.x + c.w / 2), e.clientY - r.top - (c.y + c.h / 2));
      if (!best || d < best.d) best = { k, c, d };
    }
    dropAt = best.k;
    preview.hidden = false;
    const { x, y, w, h } = best.c; // inset 4px so the outline sits inside the pane
    Object.assign(preview.style, { left: `${x + 4}px`, top: `${y + 4}px`, width: `${w - 8}px`, height: `${h - 8}px` });
  });
  zone.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
    dropAt = null;
    preview.hidden = true;
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const src = dragSrc, at = dropAt;
    endDrag();
    if (!src || at == null) return;
    const tab = src.id && tabs.get(src.id);
    if (!activeId) { // home screen: just open it
      if (tab) activate(tab.id);
      else openSession(src.project, { kind: src.kind, runtimeId: src.runtimeId, resumeId: src.resumeId });
    } else if (!tab) openSession(src.project, { kind: src.kind, runtimeId: src.runtimeId, resumeId: src.resumeId, beside: true, at });
    else if (visibleIds().includes(tab.id)) cloneBeside(tab, at);
    else { addToSplit(tab.id, at); activate(tab.id); }
  });
}

/**
 * Focus the pane next to the focused one in a direction ('left' | 'right' | 'up' | 'down'): the nearest pane whose
 * centre lies that way, preferring one in line. Returns false without a split, so the keys reach the terminal.
 */
function focusPane(dir) {
  const ids = visibleIds();
  if (ids.length < 2) return false;
  const centre = (id) => { const r = tabs.get(id).host.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const [ax, ay] = centre(activeId);
  let best = null;
  for (const id of ids) {
    if (id === activeId) continue;
    const [x, y] = centre(id);
    const horiz = dir === 'left' || dir === 'right';
    const along = horiz ? (dir === 'right' ? x - ax : ax - x) : (dir === 'down' ? y - ay : ay - y);
    if (along <= 1) continue;
    const score = along + 2 * Math.abs(horiz ? y - ay : x - ax);
    if (!best || score < best.score) best = { id, score };
  }
  if (best) activate(best.id);
  return true;
}

const RESIZE_STEP = 0.05; // of the terminal area per key press

/** Keyboard resize: move the divider that runs across `dir` (Left/Right the vertical one, Up/Down the horizontal one). */
function nudgeSplit(dir) {
  if (visibleIds().length < 2) return false;
  const axis = dir === 'left' || dir === 'right' ? 'x' : 'y';
  if ($(axis === 'x' ? '#pz-v' : '#pz-h').hidden) return true; // this layout has no divider that way
  const step = dir === 'left' || dir === 'up' ? -RESIZE_STEP : RESIZE_STEP;
  const g = curSplit();
  setSplitRatio(axis, (axis === 'x' ? g.cx : g.ry) + step);
  saveTabs();
  return true;
}

/** [grid-column, grid-row] of pane `i` in an `n`-pane split (`v`: stacked, the 2/3 layouts transposed). */
function paneCell(n, i, v = false) {
  if (v && n < 4) { const [c, r] = paneCell(n, i); return [r, c]; }
  if (n === 2) return [String(i + 1), '1'];
  if (n === 3) return i === 0 ? ['1', '1 / span 2'] : ['2', String(i)];
  return [String((i % 2) + 1), String(Math.floor(i / 2) + 1)];
}

/** Grid placement, dividers and pane headers for the current split (or back to the plain single-terminal layout). */
function renderSplit() {
  const box = $('#terminals');
  const split = curSplit();
  const ids = split ? split.ids : [];
  const n = ids.length;
  const v = n > 1 && split.v;
  box.classList.toggle('split', n > 1);
  $('#split-tab').classList.toggle('on', !!split);
  $('#split-tab').title = split ? tip('Back to one terminal', 'unsplit') : tip('New session beside this one', 'splitRight');

  for (const t of tabs.values()) {
    const i = ids.indexOf(t.id);
    t.host.classList.toggle('pane', i >= 0);
    t.host.classList.toggle('focus', i >= 0 && t.id === activeId);
    const [col, row] = i < 0 ? ['', ''] : paneCell(n, i, v);
    t.host.style.gridColumn = col;
    t.host.style.gridRow = row;
  }

  // The vertical divider (at cx) and the horizontal one (at ry); a 3-pane layout's second divider spans only its half.
  const vz = $('#pz-v'), hz = $('#pz-h');
  vz.hidden = n < (v ? 3 : 2);
  hz.hidden = n < (v ? 2 : 3);
  if (n > 1) {
    const { cx, ry } = split;
    const cols = `${cx}fr ${1 - cx}fr`, rows = `${ry}fr ${1 - ry}fr`;
    box.style.gridTemplateColumns = v && n === 2 ? '1fr' : cols;
    box.style.gridTemplateRows = !v && n === 2 ? '1fr' : rows;
    vz.style.left = `calc(${cx * 100}% - 2px)`;
    vz.style.top = v && n === 3 ? `${ry * 100}%` : '0';
    hz.style.top = `calc(${ry * 100}% - 2px)`;
    hz.style.left = !v && n === 3 ? `${cx * 100}%` : '0';
  } else {
    box.style.gridTemplateColumns = box.style.gridTemplateRows = '';
  }
  renderPanes();
  autoRside();
}

/** Pane headers: status dot, title, − (take the pane out of the split, still running) and × (close it). Key-diffed. */
let lastPanesKey = '';
function renderPanes() {
  const ids = curSplit()?.ids || [];
  // No activeId: the focused pane is styled on its host (renderSplit), and a rebuild on focus swallowed clicks.
  const key = JSON.stringify([ids.map((id) => { const t = tabs.get(id); return [id, tabDot(t), paneTitle(t)]; }), sessionsVer]);
  if (key === lastPanesKey) return;
  lastPanesKey = key;
  for (const id of ids) {
    const t = tabs.get(id);
    t.head.replaceChildren(
      h('span', { class: 's-mark' }, tabDot(t) ? h('i', { class: `dot ${tabDot(t)}` }) : null),
      h('span', { class: 'ph-title' }, paneTitle(t)),
      h('button', {
        class: 'btn ghost icon sm', title: tip('Take out of split', 'minimizePane'),
        onclick: (e) => { e.stopPropagation(); minimizePane(id); },
      }, ico('minus')),
      h('button', {
        class: 'btn ghost icon sm', title: tip('Close session', 'closeSession'),
        onclick: (e) => { e.stopPropagation(); closeTab(id); },
      }, ico('x')));
  }
}

/** A tab's name in the sidebar and pane headers: its transcript title once known, else a placeholder. */
function paneTitle(t) {
  const known = t.sessionId && (sessionsBy[t.project.path] || []).find((s) => s.id === t.sessionId);
  if (known) return known.title;
  if (t.kind === 'shell') {
    const shells = tabsOf(t.project.path).filter((x) => x.kind === 'shell').sort((a, b) => a.seq - b.seq);
    return `${t.project.remoteId ? 'Shell' : SHELL_LABEL}${shells.length > 1 ? ' ' + (shells.indexOf(t) + 1) : ''}`;
  }
  return t.fork ? 'Forked session' : t.resumeId ? 'Resumed session' : 'New session';
}

/**
 * Hide the right sidebar when a split would leave a pane under RSIDE_MIN_COLS columns, bring it back when
 * there is room again (or the split ends). It never touches ui.servers, so the saved choice survives.
 */
let autoQueued = false;
function autoRside() {
  if (autoQueued) return;
  autoQueued = true;
  requestAnimationFrame(() => {
    autoQueued = false;
    const open = document.body.classList.contains('rside-open');
    const panes = visibleIds().map((id) => tabs.get(id)).filter((t) => t?.host.offsetWidth);
    const cramped = panes.length >= 2;
    // A markdown tab on show counts as asked for: never hidden for room. One shown while it is hidden doesn't bring it
    // back (that would squeeze the panes): it peeks over them instead (openDoc).
    const doc = !!activeDoc() || diffActive();
    if (!cramped && rsideAuto) { rsideAuto = false; applyRside(ui.servers); return; }
    if (!cramped || rsideForced || doc) return;
    const cols = Math.min(...panes.map((t) => t.term.cols));
    if (open && ui.servers && cols < RSIDE_MIN_COLS) {
      rsideAuto = true;
      applyRside(false);
    } else if (!open && rsideAuto) {
      const main = $('#terminals').offsetWidth;
      if ((cols * (main - ui.rsideW)) / main >= RSIDE_BACK_COLS) { rsideAuto = false; applyRside(ui.servers); }
    }
  });
}

/** Set the column (x) or row (y) ratio of the split, keeping every pane at least SPLIT_MIN_W x SPLIT_MIN_H. */
function setSplitRatio(axis, v) {
  const split = curSplit();
  if (!split) return;
  const r = $('#terminals').getBoundingClientRect();
  if (axis === 'x') split.cx = Math.min(1 - SPLIT_MIN_W / r.width, Math.max(SPLIT_MIN_W / r.width, v));
  else split.ry = Math.min(1 - SPLIT_MIN_H / r.height, Math.max(SPLIT_MIN_H / r.height, v));
  renderSplit();
}

/** Dividers: drag to resize (ratio of the grid), double-click to reset. */
function wireDivider(el, axis) {
  const box = $('#terminals');
  const apply = (v) => setSplitRatio(axis, v);
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    document.body.classList.add('resizing');
  });
  el.addEventListener('pointermove', (e) => {
    if (!curSplit() || !el.hasPointerCapture(e.pointerId)) return;
    const r = box.getBoundingClientRect();
    apply(axis === 'x' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height);
  });
  const end = (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    el.classList.remove('drag');
    document.body.classList.remove('resizing');
    saveTabs(); // the ratio is saved with the split, once per drag
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => { if (curSplit()) { apply(0.5); saveTabs(); } });
}

const hostObserver = new ResizeObserver(() => requestAnimationFrame(fitActive));

function cycleTab(dir) {
  const ids = [...tabs.keys()];
  if (ids.length < 2) return;
  activate(ids[(ids.indexOf(activeId) + dir + ids.length) % ids.length]);
}

function focusProject(project) {
  const existing = tabsOf(project.path).sort((a, b) => b.lastActive - a.lastActive)[0];
  if (existing) activate(existing.id);
  else openSession(project);
}

// ------------------------------------------------------------- rendering ----

/** A tab's status dot: blue = needs attention (bell, or exited in the background), yellow = working, green = running. */
function tabDot(t) {
  if (t.attention) return 'attention';
  if (t.status !== 'running') return '';
  return isWorking(t) || (t.busy && t.id !== activeId) ? 'working' : 'running';
}

function gitPills(info) {
  if (info === undefined) return [h('span', { class: 'g muted' }, 'checking…')];
  if (info === null) return [h('span', { class: 'g muted' }, 'not a git repository')];

  const parts = [
    h('span', { class: 'g branch', title: info.upstream ? `Tracking ${info.upstream}` : 'No upstream branch' },
      ico('branch'), h('span', {}, info.detached ? `@${info.branch}` : info.branch)),
  ];
  if (info.conflicts) parts.push(h('span', { class: 'g conflict', title: 'Merge conflicts' }, `${info.conflicts} conflicts`));
  if (info.dirty === 0) {
    parts.push(h('span', { class: 'g clean' }, 'clean'));
  } else {
    parts.push(h('span', {
      class: 'g dirty',
      title: `${info.staged} staged, ${info.modified} modified, ${info.untracked} untracked`,
    }, `${info.dirty} changed`));
  }
  if (info.ahead) parts.push(h('span', { class: 'g sync', title: `${info.ahead} to push` }, `↑${info.ahead}`));
  if (info.behind) parts.push(h('span', { class: 'g sync', title: `${info.behind} to pull` }, `↓${info.behind}`));
  return parts;
}

function rowButton(icon, title, onClick, extraClass = '') {
  return h('button', {
    class: `btn ghost icon sm ${extraClass}`.trim(), title,
    onclick: (e) => { e.stopPropagation(); onClick(); },
  }, ico(icon));
}

const fmtAgo = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
};

const saveExpanded = () => api.setUi({ expanded: [...expanded] });

function toggleExpand(p) {
  if (expanded.delete(p.path)) showMore.delete(p.path); // collapsing folds the list again: reopening shows the first few
  else expanded.add(p.path);
  saveExpanded();
  renderSidebar(true);
}

const tabOfSession = (id, projectPath) => [...tabs.values()].find((t) => t.sessionId === id && (!projectPath || t.project.path === projectPath));


/**
 * Session ids a tab let go of (closed, restarted as a new session, left by /clear). Never matched to another tab: a
 * closed split pane's transcript used to be taken over by an idle tab of the same project, which then showed its title.
 */
const retired = new Set();

/** Tab id -> the session its Claude says it is on (main's `sessions:live`, from ~/.claude/sessions), refreshed by pollSessions. */
let liveBy = {};

/**
 * Tabs we started fresh (or forked) don't know their transcript yet, and /clear or /resume inside a tab switches it
 * (/resume keeps writing to the old session's file): follow it, or the row, pane header and right sidebar keep showing
 * the old session. Claude's own record (`liveBy`) decides when there is one; otherwise matchSessions (lib/ui.js)
 * guesses from file births and Enters, where a Claude run in an outside terminal in the same folder could be mistaken
 * for ours.
 */
function assignSessions() {
  const claude = [...tabs.values()].filter((t) => t.kind === 'claude' && !t.project.remoteId);
  const changes = matchSessions(claude.map((t) => ({
    id: t.id, project: t.project.path, sessionId: t.sessionId, fork: t.fork, running: t.status === 'running',
    working: isWorking(t), startedAt: t.startedAt, enters: t.enters, live: liveBy[t.id] || null,
  })), sessionsBy, retired);
  for (const c of changes) {
    const t = tabs.get(c.id);
    if (c.followed) { retired.add(t.sessionId); infoBy.delete(t.id); }
    if (!c.sessionId) { t.resumeId = null; t.fork = false; } // /new: a "New session" placeholder, not "Resumed session"
    t.sessionId = c.sessionId;
  }
  for (const t of tabs.values()) {
    if (!t.project.remoteId || t.kind !== 'claude') continue;
    const live = liveBy[t.id];
    if (live && live !== t.sessionId) { t.sessionId = live; t.resumeId = live; t.fork = false; infoBy.delete(t.id); }
  }
  saveTabs(); // diffed: only writes when a tab just got its transcript
}

function openSessionRow(project, s) {
  const open = tabsOf(project.path).find((t) => (s.runtimeId && t.runtimeId === s.runtimeId) || t.sessionId === s.id);
  if (open) activate(open.id);
  else openSession(project, sessionOptions(s));
}
const sessionOptions = (s) => ({ kind: s.kind || 'claude', runtimeId: s.runtimeId, resumeId: s.runtimeId ? s.transcriptId || null : s.id });

/**
 * "Continue last conversation" = the project's newest transcript (by last message, the sidebar's order), resumed by id
 * or focused when a tab already shows it. Never `claude --continue`: that picks a transcript on its own, even one
 * running in another tab (two processes appending to one file), and the tab could only guess which one it got.
 */
async function continueLast(project) {
  const res = await api.listSessions([project.path]); // fresh, not the last poll
  const next = { ...sessionsBy, ...res };
  if (JSON.stringify(next) !== JSON.stringify(sessionsBy)) { sessionsBy = next; sessionsVer++; }
  assignSessions(); // a tab started moments ago may own the newest transcript: focus it, never resume it twice
  const list = sessionsBy[project.path] || [];
  if (list[0]) openSessionRow(project, list[0]);
  else openSession(project);
}

/** The dot slot of a session row (under the project's badge): empty unless the row's tab is live. */
const dotMark = (state) => h('span', { class: 's-mark' }, state ? h('i', { class: `dot ${state}` }) : null);

/** Rows backed by an open tab show × in place of their time on hover; middle-click closes too, as on the old tabs. */
function closeButton(t) {
  return h('button', {
    class: 'btn ghost icon sm s-close', title: tip(t.project.remoteId ? 'Close tab (keep remote session running)' : 'Close', 'closeSession'),
    onclick: (e) => { e.stopPropagation(); closeTab(t.id); },
  }, ico('x'));
}
const auxClose = (t) => (e) => { if (t && e.button === 1) closeTab(t.id); };

/** Project name on rows of a split group that mixes projects, in place of the time. */
const projTag = (t, show) => (show ? h('span', { class: 's-proj' }, projName(t.project)) : null);

/** A transcript row; `t` is the open tab showing it (a session opened twice gets one row per tab). */
function sessionRow(p, s, t = null, showProject = false) {
  return h('div', {
    class: `session${t ? (t.id === activeId ? ' active' : '') + ' has-tab' : ''}${menuFor === `s:${s.id}` ? ' menu-open' : ''}`,
    'data-tab': t?.id,
    ...rowDrag({ id: t?.id || null, project: p, ...sessionOptions(s) }),
    title: `${s.title}\n${new Date(s.last).toLocaleString()}\nDrag onto the terminal (or ${kbd('Shift+click')}) to open beside the current session\nRight-click (or …) for more`,
    onclick: (e) => (e.shiftKey && activeId
      ? besideRow(t, () => openSession(p, { ...sessionOptions(s), beside: true }))
      : openSessionRow(p, s)),
    oncontextmenu: (e) => { e.preventDefault(); sessionMenu(p, s, t, e); },
    onauxclick: auxClose(t),
  },
    dotMark(t ? tabDot(t) : ''),
    h('span', { class: 's-title' }, s.title),
    showProject ? projTag(t, true) : h('span', { class: 's-time' }, fmtAgo(s.last)),
    h('button', {
      class: 'btn ghost icon sm s-menu', title: 'More actions',
      onclick: (e) => { e.stopPropagation(); sessionMenu(p, s, t, e, e.currentTarget.closest('.session')); },
    }, ico('more')),
    t ? closeButton(t) : null);
}

/** An open tab's row: its transcript row once known, else a placeholder. Exited tabs stay listed so they can be closed. */
function tabRow(t, showProject = false) {
  const s = t.kind === 'claude' && t.sessionId && (sessionsBy[t.project.path] || []).find((x) => x.id === t.sessionId);
  return s ? sessionRow(t.project, s, t, showProject) : pendingRow(t, showProject);
}

/**
 * A split group's member rows, threaded by a rail in the group's color: inside their project's list, or at the top of
 * the sidebar when they come from different projects (each row then names its project). Clicking a row shows its group;
 * the rows' menu takes one out or unsplits. With several groups each has its own color.
 */
function splitGroup(g, showProject) {
  const members = g.ids.map((id) => tabs.get(id)).filter(Boolean);
  const live = members.some((t) => t.id === activeId);
  const color = splits.length > 1 ? g.color : 0;
  return h('div', { class: `split-group g${color}${live ? '' : ' idle'}` },
    members.map((t) => tabRow(t, showProject)));
}

/** Claude tabs before their first reply (placeholder title) and shell tabs. */
function pendingRow(t, showProject = false) {
  return h('div', {
    class: `session has-tab${t.kind === 'claude' ? ' pending' : ''}${t.id === activeId ? ' active' : ''}`,
    'data-tab': t.id,
    ...rowDrag({ id: t.id, project: t.project, resumeId: null }),
    title: t.kind === 'shell' ? `${SHELL_LABEL} in ${t.project.path}` : 'Its title appears after the first reply',
    onclick: (e) => { if (e.shiftKey && activeId) besideRow(t, null); else activate(t.id); },
    onauxclick: auxClose(t),
  },
    dotMark(tabDot(t)),
    h('span', { class: 's-title' }, paneTitle(t)),
    showProject ? projTag(t, true) : h('span', { class: 's-time' }, fmtAgo(t.startedAt)),
    closeButton(t));
}

/** ["main", "3 changed · ↑1"] for the project tooltip and the active project's sub-line. */
function gitParts(info) {
  if (info === undefined) return null;
  if (info === null) return ['not a git repository', ''];
  return [
    info.detached ? `@${info.branch}` : info.branch,
    [
      info.conflicts ? `${info.conflicts} conflicts` : null,
      info.dirty ? `${info.dirty} changed` : 'clean',
      info.ahead ? `↑${info.ahead}` : null,
      info.behind ? `↓${info.behind}` : null,
    ].filter(Boolean).join(' · '),
  ];
}
const gitSummary = (info) => gitParts(info)?.filter(Boolean).join(' · ') || null;

/** The active project's one muted line: a long branch name truncates, the counts never do. */
function gitSubLine(info) {
  const [branch, rest] = gitParts(info);
  return h('div', { class: 'p-sub' }, h('span', { class: 'p-branch' }, branch), rest ? h('span', {}, ` · ${rest}`) : null);
}

let lastSidebarKey = '';
let sessionsVer = 0; // bumped when sessionsBy changes, so the render key stays cheap
function renderSidebar(force = false) {
  if (dragSrc || projDrag) return; // rebuilding rows mid-drag would drop the dragged element; the drag's end re-renders
  syncHome();
  const tab = activeTab();
  const activeProject = tab?.project.path;
  const key = JSON.stringify([projects, git, activeId, tab?.sessionId, sessionsVer, [...expanded], [...showMore], query,
    Math.floor(Date.now() / 60000), splits.map((g) => [g.ids, g.v, g.color]),
    [...tabs.values()].map((t) => [t.id, t.project.path, t.kind, t.sessionId, tabDot(t), t.parked])]);
  if (!force && key === lastSidebarKey) return;
  lastSidebarKey = key;
  renderPanes();

  const root = $('#projects');
  const emptyNote = () => h('div', { class: 'empty-note' }, 'No projects yet.', h('br'), 'Add a folder to start a Claude session in it.');
  const orphans = orphanProjects(); // every open tab needs a row (there is no tab strip)
  if (!projects.length && !orphans.length) {
    root.replaceChildren(emptyNote());
    return;
  }
  const q = query.trim().toLowerCase();
  // Split groups sit in their project's list where their first member is in tab order, or (mixed projects) at the top.
  const homeOf = new Map(q ? [] : splits.map((g) => {
    const paths = new Set(g.ids.map((id) => tabs.get(id)?.project.path));
    return [g, paths.size === 1 ? [...paths][0] : null];
  }));
  const openRows = (open, p) => {
    const done = new Set();
    return open.map((t) => {
      const g = homeOf.size ? groupOf(t.id) : null;
      if (!g) return tabRow(t);
      if (homeOf.get(g) !== p.path || done.has(g)) return null;
      done.add(g);
      return splitGroup(g, false);
    });
  };
  const groups = [...projects, ...orphans].map((p) => {
    const orphan = orphans.includes(p);
    const loaded = sessionsBy[p.path];
    const matches = q ? (loaded || []).filter((s) => s.title.toLowerCase().includes(q)) : loaded || [];
    if (q && !matches.length) return null;
    const isOpen = q || orphan ? true : expanded.has(p.path);
    // Open tabs first, in tab order (newest first), then the project's other sessions, newest first.
    // A reopened past session (parked, not in a split) stays among them at its own place until its first prompt.
    // Only while its transcript is listed (a restarted-as-new tab has no sessionId, so it needs its open row).
    const mine = tabsOf(p.path);
    const listed = loaded && mine.some((t) => t.parked) ? new Set(loaded.map((s) => s.id)) : null;
    const inPlace = new Set(); // session ids of parked tabs whose row stays in the list below
    if (!orphan) for (const t of mine) if (t.parked && listed?.has(t.sessionId) && !groupOf(t.id)) inPlace.add(t.sessionId);
    const open = q ? [] : mine.filter((t) => !inPlace.has(t.sessionId));
    const openIds = new Set(open.map((t) => t.sessionId));
    const rest = orphan && !q ? [] : matches.filter((s) => !openIds.has(s.id) && !open.some((t) => s.runtimeId && s.runtimeId === t.runtimeId)); // detached remote runtimes stay discoverable
    const isActive = p.path === activeProject;

    let list = null;
    if (isOpen && (loaded || open.length)) {
      const all = q || showMore.has(p.path);
      const room = Math.max(0, (p.chat ? CHATS_SHOWN : SESSIONS_SHOWN) - open.length); // open tabs count toward the limit but are never folded
      const shown = all ? rest : rest.filter((s, i) => i < room || inPlace.has(s.id)); // a parked tab's row is never folded away
      const hidden = rest.length - shown.length;
      list = h('div', { class: 'sessions' },
        openRows(open, p),
        rest.length
          ? shown.map((s) => sessionRow(p, s, tabOfSession(s.id, p.path)))
          : open.length ? null : h('div', { class: 's-note' }, 'No sessions yet'),
        hidden ? h('div', { class: 's-more', onclick: () => { showMore.add(p.path); renderSidebar(true); } }, `Show ${hidden} more`) : null,
        !q && showMore.has(p.path) && rest.length > room
          ? h('div', { class: 's-more', onclick: () => { showMore.delete(p.path); renderSidebar(true); } }, 'Show less')
          : null);
    }
    return h('div', { class: 'group' },
      projectRow(p, isActive, isOpen, orphan),
      isActive && git[p.path] ? gitSubLine(git[p.path]) : null,
      list);
  }).filter(Boolean);
  const mixed = splits.filter((g) => homeOf.has(g) && !homeOf.get(g));
  groups.unshift(...mixed.map((g) => h('div', { class: 'group' }, splitGroup(g, true))));
  if (!q && !realProjects().length) groups.push(emptyNote()); // only Chats so far
  root.replaceChildren(...(groups.length ? groups
    : [h('div', { class: 'empty-note' }, `No sessions match "${query.trim()}"`)]));
}

/** One line: chevron, folder icon, name, and a running dot (swapped for + and … on hover). */
/** `orphan`: removed from the list but still has open tabs, so it stays open and has no actions. */
function projectRow(p, isActive, isOpen, orphan = false) {
  const dots = tabsOf(p.path).map(tabDot);
  const run = ['attention', 'working', 'running'].find((d) => dots.includes(d));
  const connection = remotes.find((d) => d.id === p.remoteId)?.enabled === false ? { status: 'disabled' } : remoteStatuses[p.remoteId];
  const connectionLabel = connection?.status === 'disabled' ? 'Connection off' : `Server ${connection?.status || 'not connected'}`;
  return h('div', {
    class: `project${p.remoteId ? ' remote-project' : ''}${isActive && !isOpen ? ' current' : ''}${menuFor === p.path ? ' menu-open' : ''}${orphan ? ' orphan' : ''}`,
    title: [displayPath(p), gitSummary(git[p.path]), orphan ? 'Removed from the list: shown while its sessions are open'
      : p.chat ? null : 'Drag to reorder'].filter(Boolean).join('\n'),
    onclick: () => { if (!orphan) toggleExpand(p); }, // only collapses/expands; new sessions come from + or the shortcut
    ...(p.chat || orphan ? {} : projDragProps(p)), // Chats stays pinned first
  },
    h('button', {
      class: `chev${isOpen ? ' open' : ''}`, title: orphan ? null : isOpen ? 'Hide sessions' : 'Show sessions',
      onclick: (e) => { e.stopPropagation(); if (!orphan) toggleExpand(p); },
    }, ico('chevron')),
    h('span', { class: 'p-icon' }, ico(p.remoteId ? 'server' : p.chat ? 'chat' : 'folder')),
    h('span', { class: 'p-name' }, p.name, !p.remoteId && projParent(p) ? h('span', { class: 'p-parent' }, projParent(p)) : null),
    p.remoteId ? h('span', { class: 'p-device', title: remoteName(p) }, remoteName(p)) : null,
    p.remoteId ? h('span', { class: `remote-dot ${connection?.status || 'offline'}`, title: connection?.error || connectionLabel, 'aria-label': connectionLabel }) : null,
    h('span', { class: 'p-run', title: run ? 'Something is running' : null }, !p.remoteId && run ? h('i', { class: `dot ${run}` }) : null),
    orphan ? null : h('div', { class: 'p-acts' },
      rowButton('plus', 'New Claude session', () => openSession(p)),
      h('button', {
        class: 'btn ghost icon sm p-more', title: 'More actions',
        onclick: (e) => { e.stopPropagation(); toggleMenu(p, e.currentTarget); },
      }, ico('more'))));
}

// ------------------------------------------------------------ "…" menu ----

const menuItem = (icon, label, run, danger = false) => h('button', {
  class: `menu-item${danger ? ' danger' : ''}`, role: 'menuitem',
  onclick: () => { closeMenu(); run(); },
}, ico(icon), label);

/** Show #menu with these items at (x, y), or ending at `flipY` when it would run off the bottom. */
function openMenu(key, items, x, y, flipY = y) {
  const el = $('#menu');
  el.replaceChildren(...items.filter(Boolean));
  el.hidden = false;
  el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8))}px`;
  el.style.top = `${y + el.offsetHeight > window.innerHeight - 8 ? Math.max(8, flipY - el.offsetHeight) : y}px`;
  menuFor = key;
}

async function toggleMenu(p, anchor) {
  if (menuFor === p.path) { closeMenu(); return; }
  // CLAUDE.md / README.md open as file tabs, which belong to the project's tabs: offered while one is open (its most
  // recently used one is focused). A quick readdir in main.
  const own = tabsOf(p.path).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0];
  const root = own && !p.remoteId ? (await api.docsList(p.path, null).catch(() => null))?.project || [] : [];
  if (!anchor.isConnected) return; // the sidebar was redrawn meanwhile
  const readDoc = (name) => {
    const f = root.find((x) => docName(x).toLowerCase() === name.toLowerCase());
    return f ? menuItem('fileText', `Open ${docName(f)}`, () => { if (tabs.has(own.id)) { activate(own.id); openDoc(p, f); } }) : null;
  };
  const r = anchor.getBoundingClientRect();
  const top = realProjects()[0]; // Chats is pinned above it
  openMenu(p.path, [
    menuItem('redo', 'Continue last conversation', () => continueLast(p)),
    menuItem('terminal', `Open ${p.remoteId ? 'Shell' : SHELL_LABEL} here`, () => openSession(p, { kind: 'shell' })),
    menuItem('folder', p.remoteId ? 'Copy remote path' : `Show in ${FILES_APP}`, () => p.remoteId ? api.writeClipboard(p.remotePath) : api.openFolder(p.path)),
    p.remoteId ? menuItem('redo', `Reconnect ${remoteName(p)}`, async () => { const r = await api.reconnectRemoteDevice(p.remoteId); if (!r.ok) remoteNotice(r.error); else { pollGit(); pollSessions(); } }) : null,
    readDoc('CLAUDE.md'),
    readDoc('README.md'),
    !p.chat && top && top.path !== p.path ? menuItem('arrowUp', 'Move to top', () => moveProject(p.path, top.path, false)) : null,
    h('div', { class: 'menu-sep' }),
    menuItem('trash', 'Remove from list', () => removeProject(p), true),
  ], r.left, r.bottom + 4, r.top - 4);
  anchor.closest('.project').classList.add('menu-open'); // keeps + and … visible; projectRow re-applies it on renders
}

/** The sidebar's + (top bar while collapsed): a chat outside any project, or a new session in one of them. */
function newSessionMenu(anchor) {
  if (menuFor === 'new') { closeMenu(); return; }
  closeMenu(); // a project's "…" menu may be open: drops its row's menu-open too
  const r = anchor.getBoundingClientRect();
  const list = realProjects();
  openMenu('new', [
    menuItem('chat', 'No project', openChat),
    h('div', { class: 'menu-sep' }),
    ...list.map((p) => menuItem('folder', projName(p), () => openSession(p))),
    list.length ? null : menuItem('folderPlus', 'Add project…', addProjects),
  ], r.left, r.bottom + 4, r.top - 4);
  $('#menu .menu-item').focus(); // so Ctrl+T can pick with the arrows and Enter
}

/** Up/Down move between the open menu's items (Enter clicks the focused one). */
function menuArrow(e) {
  const items = [...$('#menu').querySelectorAll('.menu-item')];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length : i) - 1;
  items[n].focus();
}

/** A new Claude session in the chat folder, listed under the pinned "Chats" group (or that folder's project, if it is one). */
async function openChat() {
  const r = await api.chatProject();
  if (r.error) {
    const fix = await confirmDialog({ title: 'Chat folder not available', message: r.error, okLabel: 'Open settings', cancelLabel: 'Close' });
    if (fix) { settingsTab = 'chats'; toggleSettings(true); }
    return;
  }
  projects = r.projects;
  const chat = projects.find((p) => p.path === r.path);
  if (!chat) return;
  if (!expanded.has(chat.path)) { expanded.add(chat.path); saveExpanded(); }
  await openSession(chat); // its activate renders the sidebar with the new group
  pollSessions();
}

/** Right-click on a transcript row: open it (beside), or fork it, i.e. resume a copy under a new session id to try another way. */
function sessionMenu(p, s, t, e, row = null) {
  const key = `s:${s.id}`;
  if (row && menuFor === key) { closeMenu(); return; } // the … button toggles
  closeMenu();
  let x = e.clientX, y = e.clientY, flipY = y;
  if (row) { const r = e.currentTarget.getBoundingClientRect(); x = r.left; y = r.bottom + 4; flipY = r.top - 4; }
  const room = activeId && visibleIds().length < SPLIT_MAX;
  const g = t && groupOf(t.id);
  openMenu(key, [
    menuItem('arrowRight', t ? 'Show' : 'Open', () => openSessionRow(p, s)),
    p.remoteId && (t?.runtimeId || s.runtimeId) ? menuItem('power', 'End remote session…', async () => {
      if (!(await confirmDialog({ title: 'End remote session?', message: 'This stops the remote process. Closing a tab instead keeps it running.', okLabel: 'End session', danger: true }))) return;
      if (t) { if (await endRemote(t)) await closeTab(t.id); }
      else { const r = await api.remoteRuntime(p.path, s.runtimeId, 'end'); if (!r.ok) remoteNotice(r.error); }
      pollSessions();
    }, true) : null,
    room ? menuItem('columns', 'Open beside', () => besideRow(t, () => openSession(p, { ...sessionOptions(s), beside: true }))) : null,
    h('div', { class: 'menu-sep' }),
    s.kind !== 'shell' && (!s.runtimeId || s.transcriptId) ? menuItem('fork', 'Fork session', () => openSession(p, { resumeId: s.id, fork: true })) : null,
    room && s.kind !== 'shell' && (!s.runtimeId || s.transcriptId) ? menuItem('fork', 'Fork beside', () => openSession(p, { resumeId: s.id, fork: true, beside: true })) : null,
    g ? h('div', { class: 'menu-sep' }) : null,
    g ? menuItem('minus', 'Take out of split', () => minimizePane(t.id)) : null,
    g ? menuItem('x', 'Unsplit', () => unsplit(g)) : null,
    h('div', { class: 'menu-sep' }),
    s.kind === 'shell' || (s.runtimeId && !s.transcriptId) ? null : t?.skipPerms
      ? menuItem('redo', 'Relaunch with permissions', () => relaunchTab(t, false))
      : menuItem('zap', 'Relaunch, skip permissions', async () => {
        if (t) return relaunchTab(t, true);
        if (p.remoteId && s.runtimeId) { const opened = await openSession(p, sessionOptions(s)); if (opened.status === 'running') return relaunchTab(opened, true); }
        else return openSession(p, { resumeId: s.id, skipPerms: true });
      }),
  ], x, y, flipY);
  row?.classList.add('menu-open'); // keeps its … visible while the menu is open
}

// Recently used projects go first; dragging or "Move to top" can adjust the order until the next use.
let projDrag = null; // path of the project row being dragged

/** Save the current order without letting a late IPC reply overwrite a more recent local move. */
function saveProjectOrder() {
  api.reorderProjects(projects.map((p) => p.path)).catch((e) => console.error('Could not save project order:', e));
}

function touchProject(projectPath) {
  const next = projectToFront(projects, projectPath);
  if (next === projects) return false;
  projects = next;
  saveProjectOrder();
  return true;
}

function projDragProps(p) {
  const clear = (el) => el.classList.remove('drop-before', 'drop-after');
  const after = (e) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  return {
    draggable: 'true',
    ondragstart: (e) => {
      projDrag = p.path;
      closeMenu();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.path);
    },
    ondragover: (e) => {
      if (!projDrag || projDrag === p.path) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.toggle('drop-after', after(e));
      e.currentTarget.classList.toggle('drop-before', !after(e));
    },
    ondragleave: (e) => clear(e.currentTarget),
    ondrop: (e) => {
      e.preventDefault();
      clear(e.currentTarget);
      const from = projDrag;
      projDrag = null;
      if (from && from !== p.path) moveProject(from, p.path, after(e));
    },
    ondragend: () => { if (projDrag) { projDrag = null; renderSidebar(true); } },
  };
}

/** Put project `from` just before (or `after`) project `to`; main saves the order. */
function moveProject(from, to, after) {
  const order = projects.map((x) => x.path).filter((x) => x !== from);
  const i = order.indexOf(to);
  if (i < 0) return;
  order.splice(i + (after ? 1 : 0), 0, from);
  const byPath = new Map(projects.map((p) => [p.path, p]));
  projects = order.map((p) => byPath.get(p));
  saveProjectOrder();
  renderAll();
}

// No re-render here: closing happens on mousedown, and rebuilding the rows then would swallow the click.
function closeMenu() {
  document.querySelector('.remote-device-menu:popover-open')?.hidePopover();
  if (!menuFor) return;
  menuFor = null;
  $('#menu').hidden = true;
  $('.project.menu-open, .session.menu-open')?.classList.remove('menu-open');
}

// ---------------------------------------------------------------- footer ----
// One slim row under the project list: settings, the update button and compact plan usage grouped on the
// left, what is running on the right. Each stat opens a details popover (`#detail`) above it.

const fmtTok = (n) => (n < 1000 ? String(n)
  : n < 1e4 ? `${(n / 1e3).toFixed(1)}k`
  : n < 1e6 ? `${Math.round(n / 1e3)}k`
  : `${+(n / 1e6).toFixed(1)}M`);
/** A limit whose window already reset counts as 0% until the next window starts. */
const limitPct = (l) => (l.resetsAt && l.resetsAt < Date.now() ? 0 : l.percent);
function fmtReset(l) {
  if (!l.resetsAt || l.resetsAt < Date.now()) return 'no active window';
  const mins = Math.max(1, Math.round((l.resetsAt - Date.now()) / 60000));
  if (mins < 60) return `resets in ${mins}m`;
  if (mins < 24 * 60) return `resets in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `resets ${new Date(l.resetsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}
const levelOf = (pct) => (pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : '');

function contextInfo() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'claude') return null;
  const session = (sessionsBy[tab.project.path] || []).find((s) => s.id === tab.sessionId) || null;
  if (!session?.ctx) return { tab, session, pct: null };
  const model = infoBy.get(tab.id)?.model || session.model;
  const win = contextWindow(model, session.ctx);
  return { tab, session, win, pct: Math.min(100, Math.round((session.ctx / win) * 100)) };
}

const liveTabs = () => [...tabs.values()].filter((t) => t.status === 'running');

function tabState(t) {
  if (t.status === 'exited') return 'exited';
  if (t.status === 'starting') return 'starting';
  return isWorking(t) ? 'working' : 'idle';
}

function fstat(kind, title, ...value) {
  return h('button', {
    class: `fstat${detailKind === kind ? ' on' : ''}`, 'data-kind': kind, title,
    onclick: () => setDetail(detailKind === kind ? null : kind),
  }, value);
}
const pctText = (pct) => h('span', { class: levelOf(pct) || null }, `${pct}%`);
/** Ring gauge (CSS conic-gradient): `pct` null = empty track. */
const gauge = (pct) => h('span', { class: `gauge ${pct == null ? '' : levelOf(pct)}`.trim(), style: `--p:${pct ?? 0}` });

let lastFootKey = '';
function renderFoot(force = false) {
  const live = liveTabs();
  const working = live.filter(isWorking).length;
  const lim = (kind) => usage?.ok && usage.limits.find((l) => l.kind === kind);
  const sess = lim('session');
  const week = lim('weekly_all');

  const key = JSON.stringify([usage, Math.floor(Date.now() / 60000), detailKind, update, updating, checking,
    [...tabs.values()].map((t) => [t.id, tabLabel(t), tabState(t)]), sessionsVer, settingsOpen, keyText('settings')]);
  if (!force && key === lastFootKey) return;
  lastFootKey = key;

  // Each stat is icon + value. The plan's current session limit gets the ring; weekly lives in the tooltip/popover.
  const sessPct = sess ? limitPct(sess) : null;
  const usageTip = sess
    ? [`Local account · session usage ${sessPct}% (${fmtReset(sess)})`, week && `Weekly ${limitPct(week)}%`,
      usage.stale && `Last updated ${Math.round((Date.now() - usage.fetchedAt) / 60000)} min ago`].filter(Boolean).join('\n')
    : usage && !usage.ok ? `Local account usage unavailable: ${usage.error}` : 'Local account usage';
  $('#side-foot').replaceChildren(
    h('button', {
      class: `btn ghost icon sm${settingsOpen ? ' on' : ''}`, title: tip('Settings', 'settings'), onclick: () => toggleSettings(),
    }, ico('settings')),
    h('span', { id: 'update-slot' }, updateBtn()),
    fstat('usage', usageTip, gauge(sessPct), sess ? pctText(sessPct) : '—'),
    h('div', { class: 'fstats' },
      fstat('state', working ? `Open sessions: ${working} working` : `Open sessions: ${live.length} running`,
        h('i', { class: `dot${working ? ' working' : live.length ? ' running' : ''}` }),
        h('span', { class: 'f-txt' }, String(working || live.length), h('span', { class: 'f-word' }, working ? ' working' : ' running')))));
  if (detailKind) renderDetail();
}

const dNote = (text, cls = '') => h('p', { class: `d-note ${cls}`.trim() }, text);

const DETAILS = {
  usage() {
    if (!usage) return h('div', {}, h('h4', {}, 'Plan usage'), dNote('Loading…'));
    if (!usage.ok) return h('div', {}, h('h4', {}, 'Plan usage'), dNote(usage.error, 'err'));
    return h('div', {},
      h('h4', {}, 'Plan usage'),
      usage.limits.map((l) => {
        const pct = limitPct(l);
        return h('div', { class: 'lim' },
          h('div', { class: 'd-row' }, h('span', { class: 'd-k' }, l.label), h('span', { class: 'd-v' }, `${pct}%`)),
          h('span', { class: `meter big ${levelOf(pct)}` }, h('i', { style: `width:${pct}%` })),
          h('div', { class: 'd-reset' }, fmtReset(l)));
      }));
  },

  state() {
    const all = [...tabs.values()];
    if (!all.length) return h('div', {}, h('h4', {}, 'Sessions'), dNote('No sessions open.'));
    return h('div', {},
      h('h4', {}, 'Sessions'),
      all.map((t) => {
        const st = tabState(t);
        return h('div', {
          class: `d-tab${t.id === activeId ? ' active' : ''}`, title: t.project.path,
          onclick: () => { setDetail(null); activate(t.id); },
        },
          h('i', { class: `dot ${st === 'working' ? 'working' : st === 'idle' ? 'running' : ''}` }),
          h('span', { class: 'd-k' }, tabLabel(t)),
          h('span', { class: 'd-v' }, st));
      }));
  },
};

function renderDetail() {
  const el = $('#detail');
  const anchor = detailKind && $(`#side-foot .fstat[data-kind="${detailKind}"]`);
  if (!anchor) { el.hidden = true; return; }
  el.replaceChildren(DETAILS[detailKind]());
  el.hidden = false;
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))}px`;
  el.style.bottom = `${window.innerHeight - r.top + 6}px`;
}

function setDetail(kind) {
  detailKind = kind;
  if (kind === 'usage') pollUsage();
  if (!kind) $('#detail').hidden = true;
  renderFoot(true);
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayText = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(`${iso}T12:00:00`).toLocaleDateString([], opts);
const hourText = (hr) => new Date(2000, 0, 1, hr).toLocaleTimeString([], { hour: 'numeric' });
const HOME_WEEKS = 18;
const HOME_ROWS = 6; // projects listed before "Show N more projects"
const relTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
/** "12 minutes ago", "yesterday": the last conversation card's time. */
function agoText(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return relTime.format(-m, 'minute');
  if (m < 24 * 60) return relTime.format(-Math.round(m / 60), 'hour');
  return relTime.format(-Math.round(m / 1440), 'day');
}
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let userName = ''; // the OS account name (main's state:get), for the greeting
let homeQuery = ''; // "Find a project" text, runtime only
let homeAll = false; // "Show N more projects" is open, runtime only

/** Plan limits (the footer's usage, from Anthropic): a meter per limit, its reset time under it. */
function homeUsage() {
  if (!usage?.ok || !usage.limits.length) return null;
  return h('section', { class: 'home-sec' },
    h('div', { class: 'home-head' }, h('h2', {}, 'Plan usage'),
      usage.stale ? h('span', { class: 'home-meta' }, `${Math.round((Date.now() - usage.fetchedAt) / 60000)} min ago`) : null),
    usage.limits.map((l) => {
      const pct = limitPct(l);
      return h('div', { class: 'home-lim' },
        h('div', { class: 'home-lim-row' },
          h('span', {}, l.label), h('span', { class: `home-pct ${levelOf(pct)}` }, String(pct), h('small', {}, '%'))),
        h('span', { class: `meter big ${levelOf(pct)}` }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'home-reset' }, capFirst(fmtReset(l))));
    }));
}

/** Totals, streak and a messages-per-day map from Claude Code's /stats cache. */
function homeActivity() {
  const head = (meta) => h('div', { class: 'home-head' }, h('h2', {}, 'Your activity'), meta);
  if (!stats) {
    return h('section', { class: 'home-sec' }, head(null), h('p', { class: 'home-empty' },
      stats === undefined ? 'Loading…' : 'Run /stats in a Claude session once to see your activity here.'));
  }
  const tile = (value, unit, label, sub) => h('div', { class: 'home-tile' },
    h('div', { class: 'home-val' }, value, unit ? h('small', {}, unit) : null),
    h('div', { class: 'home-k' }, label), sub ? h('div', { class: 'home-sub' }, sub) : null);
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const today = localDay();
  const grid = activityGrid(stats.days, today, HOME_WEEKS);
  const top = stats.models[0];
  const old = stats.asOf && stats.asOf < localDay(new Date(Date.now() - 86400000));
  const since = stats.since && dayText(stats.since, stats.since.slice(0, 4) === today.slice(0, 4)
    ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  return h('section', { class: 'home-sec' },
    head(since ? h('span', { class: 'home-meta' }, `Since ${since}`) : null),
    h('div', { class: 'home-tiles' },
      tile(compact.format(stats.sessions), null, 'Sessions', `${stats.activeDays} active days`),
      tile(compact.format(stats.messages), null, 'Messages', stats.tools ? `${compact.format(stats.tools)} tool calls` : null),
      tile(compact.format(stats.tokens), null, 'Tokens', top ? `Mostly ${top.name}` : null),
      tile(String(stats.streak), stats.streak === 1 ? 'day' : 'days', 'Current streak', `Best streak: ${days(stats.longest)}`)),
    h('div', { class: 'heat-wrap' },
      h('div', { class: 'heat-months', style: `--weeks:${HOME_WEEKS}` },
        monthLabels(grid).map(({ col, month }) => h('span', { style: `grid-column:${col + 1}` }, dayText(`${month}-01`, { month: 'short' })))),
      h('div', { class: 'heat', style: `--weeks:${HOME_WEEKS}` },
        grid.flat().map((c) => (c
          ? h('i', {
              class: `l${c.level}${c.date === today ? ' today' : ''}`,
              title: `${c.n ? c.n.toLocaleString() : 'No'} messages, ${dayText(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}`,
            })
          : h('i', { class: 'none' })))),
      h('div', { class: 'heat-legend' }, 'Less', [0, 1, 2, 3, 4].map((l) => h('i', { class: `l${l}` })), 'More'),
      h('div', { class: 'heat-foot' },
        h('span', {}, stats.peakHour != null ? `Busiest around ${hourText(stats.peakHour)}` : 'Messages per day'),
        stats.asOf ? h('span', { title: 'Claude Code updates these numbers when /stats runs' },
          `Updated ${dayText(stats.asOf)}${old ? ' · run /stats to refresh' : ''}`) : null)));
}

/** The newest conversation of any project (by last message), for the "Last conversation" card. */
function lastConversation() {
  let best = null;
  for (const p of projects) {
    const s = (sessionsBy[p.path] || []).find((s) => s.kind !== 'shell');
    if (s && (!best || s.last > best.s.last)) best = { p, s };
  }
  return best;
}

function homeResume(last) {
  if (!last) return null;
  const { p, s } = last;
  const branch = !p.chat && git[p.path]?.branch;
  return h('section', { class: 'home-resume' },
    h('span', { class: 'hr-ico' }, ico('terminal')),
    h('div', { class: 'hr-main' },
      h('div', { class: 'hr-eye' }, 'Last conversation', h('span', {}, ` · ${agoText(s.last)}`)),
      h('div', { class: 'hr-title', title: s.title }, s.title),
      h('div', { class: 'hr-sub' }, projName(p), branch ? h('span', {}, ` · ${branch}`) : null)),
    h('button', { class: 'btn outline', 'data-hk': 'resume', onclick: () => openSessionRow(p, s) },
      tabOfSession(s.id, p.path) ? 'Open' : 'Continue', ico('arrowRight')));
}

/** Branch on the first line, changes (or clean) and ahead/behind on the second; one line without a repo. */
function homeGit(info) {
  const [branch, ...rest] = gitPills(info);
  if (!rest.length) return branch;
  return [h('span', { class: 'hg-line' }, branch), h('span', { class: 'hg-line' }, rest)];
}

/** Home rows: the user's projects in sidebar order, then Chats (a "No project" row before its first use). */
function homeProjectList() {
  const none = { path: '', none: true };
  const all = [...realProjects(), projects.find((p) => p.chat) || none];
  const q = homeQuery.trim().toLowerCase();
  const hits = q
    ? all.filter((p) => (p.none ? 'no project chats' : `${projName(p)} ${p.path} ${git[p.path]?.branch || ''}`).toLowerCase().includes(q))
    : all;
  const shown = q || homeAll ? hits : hits.slice(0, HOME_ROWS);
  const openRow = (p) => { homeQuery = ''; if (p.none) openChat(); else focusProject(p); };
  const row = (p) => {
    const open = !p.none && tabsOf(p.path).length > 0;
    return h('button', {
      class: 'proj', 'data-hk': `p:${p.path}`, onclick: () => openRow(p),
      title: p.none ? 'Chat outside your projects' : open ? `Go to its open session (${p.path})` : `Start a Claude session in ${p.path}`,
    },
      h('span', { class: 'proj-ico' }, ico(p.chat || p.none ? 'chat' : open ? 'terminal' : 'folder')),
      h('span', { class: 'proj-main' },
        h('span', { class: 'p-name' }, p.none ? 'No project' : projName(p)),
        h('span', { class: 'p-path' }, p.none ? 'Chat outside your projects' : h('bdi', {}, displayPath(p)))),
      h('span', { class: 'proj-git' }, p.chat || p.none ? h('span', { class: 'g muted' }, 'No project needed') : homeGit(git[p.path])),
      h('span', { class: 'proj-go' }, ico('arrowRight')));
  };
  return h('section', { class: 'home-projects' },
    h('div', { class: 'home-head' },
      h('h2', {}, 'Projects', h('span', { class: 'home-count' }, String(all.length))),
      h('button', { class: 'btn ghost sm', 'data-hk': 'add', onclick: addProjects }, ico('plus'), 'Add project')),
    h('label', { class: 'home-find' }, ico('search'),
      h('input', {
        type: 'text', 'data-hk': 'find', value: homeQuery, placeholder: 'Find a project…', 'aria-label': 'Find a project',
        spellcheck: 'false', autocomplete: 'off',
        oninput: (e) => { homeQuery = e.target.value; renderWelcome(); },
        onkeydown: (e) => {
          if (e.key === 'Escape' && homeQuery) { e.preventDefault(); homeQuery = ''; renderWelcome(); }
          else if (e.key === 'Enter' && q && shown[0]) { e.preventDefault(); openRow(shown[0]); }
        },
      }),
      h('span', { class: 'home-find-n' }, q ? `${hits.length} of ${all.length}` : `${all.length} projects`)),
    h('div', { class: 'home-list' }, shown.length ? shown.map(row)
      : h('div', { class: 'home-none' }, 'No matching projects',
          h('button', { class: 'btn outline sm', 'data-hk': 'clear', onclick: () => { homeQuery = ''; renderWelcome(); } }, 'Clear search'))),
    !q && all.length > HOME_ROWS
      ? h('button', {
          class: `btn ghost sm home-more${homeAll ? ' open' : ''}`, 'data-hk': 'more', 'aria-expanded': String(homeAll),
          onclick: () => { homeAll = !homeAll; renderWelcome(); },
        }, homeAll ? 'Show fewer projects' : `Show ${all.length - HOME_ROWS} more projects`, ico('chevron'))
      : null,
    h('p', { class: 'home-caption' }, 'Choose a project to start a new Claude session.'));
}

let lastWelcomeKey = '';
function renderWelcome() {
  const root = $('#welcome');
  const hasProjects = realProjects().length > 0;
  const hints = [['newSession', 'New session'], ['nextSession', 'Switch session'], ['toggleSidebar', 'Sidebar'], ['toggleRside', 'Side panel'], ['settings', 'Settings']];
  const last = lastConversation();
  const open = [...new Set([...tabs.values()].map((t) => t.project.path))];
  // Rebuilt only when what it shows changed (git and session polls call it every few seconds)
  const key = JSON.stringify([projects, git, stats, usage, open, homeQuery, homeAll, userName, Math.floor(Date.now() / 60000),
    last && [last.p.path, last.s.id, last.s.title, last.s.last, !!tabOfSession(last.s.id, last.p.path)], hints.map(([id]) => keyText(id))]);
  if (key === lastWelcomeKey) return;
  lastWelcomeKey = key;
  // Keyboard focus (and the search caret) survive the rebuild
  const had = document.activeElement?.closest?.('#welcome [data-hk]');
  const sel = had?.tagName === 'INPUT' ? [had.selectionStart, had.selectionEnd] : null;
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  root.replaceChildren(
    h('div', { class: 'welcome-inner' },
      h('header', { class: 'welcome-hero' },
        h('div', {},
          h('div', { class: 'hello' }, userName ? `${hello}, ${userName}` : hello),
          h('h1', {}, hasProjects ? 'Back to your work.' : 'What should we build?'),
          h('p', {}, hasProjects ? 'Pick up a conversation or start something new.' : 'Add a project folder to get started.')),
        h('span', { class: 'home-today' }, now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))),
      h('div', { class: 'welcome-main' },
        homeResume(last),
        hasProjects // Chats alone doesn't count: keep the Add project button until there is a real one
          ? homeProjectList()
          : h('div', { class: 'welcome-acts' },
              h('button', { class: 'btn primary', onclick: addProjects }, ico('folderPlus'), 'Add project'),
              h('button', { class: 'btn outline', onclick: openChat }, ico('chat'), 'Chat without a project'))),
      h('aside', { class: 'welcome-side' }, homeActivity(), homeUsage())),
    h('div', { class: 'hint' },
      hints.map(([id, label]) => (keyText(id) ? h('span', {}, h('kbd', {}, keyText(id)), ` ${label}`) : null))));
  if (had) {
    const el = [...root.querySelectorAll('[data-hk]')].find((e) => e.dataset.hk === had.dataset.hk); // paths would need escaping in a selector
    el?.focus();
    if (el && sel) el.setSelectionRange(...sel);
  }
}

// -------------------------------------------------------------- settings ----
// A page over the terminal area (gear in the sidebar footer): a section nav on the left, the open section on the
// right. Appearance (theme, accent, text size) and Shortcuts (each editable; recording a combo another action uses
// takes it from that action).

let settingsTab = 'appearance'; // section shown on the settings page (runtime only)
let recording = null; // { id, index } while waiting for keys: index of the combo to replace, or -1 to add one
let keysNote = null; // { text, err } under the section header after the last change

const SETTINGS_TABS = [['appearance', 'Appearance', 'palette'], ['connections', 'Connections', 'server'], ['chats', 'Chats', 'chat'], ['shortcuts', 'Shortcuts', 'keyboard']];
const connectionBusy = new Set();
const connectionNotes = new Map();
let chatInfo = null; // { dir, isDefault, isHome } of the "No project" chat folder (main)
let chatNote = null; // { text, err } after the last change on the Chats page
const THEMES = [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']];
const ACCENTS = [['blue', 'Blue'], ['violet', 'Violet'], ['teal', 'Teal'], ['rose', 'Rose']];

function toggleSettings(open = !settingsOpen) {
  if (open === settingsOpen) return;
  settingsOpen = open;
  recording = keysNote = null;
  document.body.classList.toggle('settings-open', open);
  if (open) {
    setDetail(null);
    closeMenu();
    renderSettings();
    $('#settings').scrollTop = 0;
    $('#settings').focus();
  } else {
    $('#settings').replaceChildren();
    activeTab()?.term.focus();
  }
  renderFoot(true);
}

/** Redraws the page; the control that had focus (data-fk) gets it back, so keyboard use survives a re-render. */
function renderSettings() {
  if (!settingsOpen) return;
  const fk = document.activeElement?.closest?.('#settings [data-fk]')?.dataset.fk;
  $('#settings').replaceChildren(h('div', { class: 'set-inner' },
    h('div', { class: 'set-head' },
      h('h1', {}, 'Settings'),
      h('button', { class: 'btn ghost icon', title: 'Close (Esc)', onclick: () => toggleSettings(false) }, ico('x'))),
    h('div', { class: 'set-layout' },
      h('nav', { class: 'set-nav' }, SETTINGS_TABS.map(([id, label, icon]) =>
        h('button', {
          class: `set-nav-item${settingsTab === id ? ' on' : ''}`, 'data-fk': `nav-${id}`,
          'aria-current': settingsTab === id ? 'page' : null,
          onclick: () => { settingsTab = id; recording = keysNote = chatNote = null; renderSettings(); },
        }, ico(icon), label))),
      settingsTab === 'shortcuts' ? shortcutsSection() : settingsTab === 'chats' ? chatsSection() : settingsTab === 'connections' ? connectionsSection() : appearanceSection())));
  if (fk) $(`#settings [data-fk="${fk}"]`)?.focus();
}

const secHead = (title, desc, action = null) => h('div', { class: 'set-sec-head' },
  h('div', {}, h('h2', {}, title), h('p', {}, desc)), action);

const setField = (name, desc, control) => h('div', { class: 'set-field' },
  h('div', { class: 'set-field-name' }, name), h('div', { class: 'set-field-desc' }, desc), control);

function connectionsSection() {
  return h('section', {},
    secHead('Connections', 'Manage the devices you connect to over SSH.',
      h('button', { class: 'btn outline sm', 'data-fk': 'connection-add', onclick: () => showRemoteSetup(true) }, ico('plus'), 'Add connection')),
    h('p', { class: 'set-note' }, 'Connect to an Ubuntu device using your SSH keys and config. Turning a connection off detaches its tabs and pauses reconnecting. Remote sessions keep running.'),
    !remotes.length ? setField('No connections yet', 'Add a device, then choose a folder on it to start a remote session.', null) : null,
    remotes.map((d) => {
      const enabled = d.enabled !== false;
      const busy = connectionBusy.has(d.id);
      const status = enabled ? remoteStatuses[d.id]?.status || 'offline' : 'disabled';
      const label = { connected: 'Connected', connecting: 'Connecting…', offline: 'Offline', disabled: 'Off' }[status] || 'Offline';
      const note = connectionNotes.get(d.id);
      const error = enabled && remoteStatuses[d.id]?.error;
      return h('div', { class: 'set-field connection', 'data-device': d.id },
        h('div', { class: 'connection-head' }, ico('server'), h('div', { class: 'set-text' },
          h('div', { class: 'set-field-name' }, d.name),
          h('div', { class: 'connection-target' }, d.target, d.port ? ` · Port ${d.port}` : '')),
        h('span', { class: 'set-hint' }, enabled ? 'On' : 'Off'),
        h('button', { class: 'connection-switch', role: 'switch', 'aria-checked': String(enabled), 'aria-label': `Connection to ${d.name}`,
          'data-fk': `connection-toggle-${d.id}`, disabled: busy, onclick: () => connectionAction(d, { enabled: !enabled }) }, h('span'))),
        h('div', { class: 'connection-status', role: 'status' }, h('span', { class: `remote-dot ${status}` }), label),
        note || error ? h('p', { class: `set-note${error || note?.err ? ' err' : ''}`, role: 'status' }, error || note?.text) : null,
        h('div', { class: 'set-acts' },
          h('button', { class: 'btn outline sm', 'data-fk': `connection-test-${d.id}`, disabled: busy || !enabled,
            onclick: () => connectionAction(d) }, busy ? 'Working…' : 'Test connection'),
          h('button', { class: 'btn ghost sm', 'data-fk': `connection-rename-${d.id}`, disabled: busy, onclick: () => renameConnection(d) }, 'Rename'),
          h('button', { class: 'btn ghost sm', 'data-fk': `connection-project-${d.id}`, disabled: busy || !enabled, onclick: () => showProjectPicker(d.id) }, ico('folderPlus'), 'Add project')));
    }));
}

async function connectionAction(device, change) {
  if (connectionBusy.has(device.id)) return;
  connectionBusy.add(device.id);
  connectionNotes.delete(device.id);
  renderSettings();
  try {
    const r = change ? await api.updateRemoteDevice(device.id, change) : await api.reconnectRemoteDevice(device.id);
    if (r.remotes) remotes = r.remotes;
    if (r.remoteStatuses) remoteStatuses = r.remoteStatuses;
    connectionNotes.set(device.id, r.ok
      ? { text: change ? (change.enabled ? 'Connection turned on.' : 'Connection turned off. Remote sessions keep running.')
        : `Connection successful. Connected to ${r.info.user}@${r.info.hostname}.${r.info.claude ? '' : ' Claude Code is not installed; shell sessions are available.'}` }
      : { text: r.error, err: true });
    if (change?.enabled === false && r.ok) {
      for (const t of tabs.values()) if (t.project.remoteId === device.id && !t.remoteEnded) remoteDisconnected(t);
    } else if (r.ok) {
      for (const t of tabs.values()) if (t.project.remoteId === device.id && t.status === 'disconnected') reconnectRemote(t);
      pollGit(true); pollSessions(true);
    }
    if (change?.enabled === true && !r.ok) {
      for (const t of tabs.values()) if (t.project.remoteId === device.id && t.status === 'disconnected') remoteDisconnected(t);
    }
  } catch (e) { connectionNotes.set(device.id, { text: e.message, err: true }); }
  finally { connectionBusy.delete(device.id); renderAll(); renderSettings(); }
}

function renameConnection(device) {
  const name = h('input', { id: 'connection-name', value: device.name, maxlength: '80', required: true, 'aria-label': 'Device name', autocomplete: 'off' });
  const note = h('p', { class: 'set-note err', role: 'status' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Save name');
  const form = h('form', { class: 'ag-body remote-form' }, h('label', { for: 'connection-name' }, 'Device name'), name, note,
    h('div', { class: 'remote-actions' }, h('button', { class: 'btn outline', type: 'button', onclick: () => closeModal?.() }, 'Cancel'), save));
  const dlg = openModal('Rename device', null, form);
  form.onsubmit = async (e) => {
    e.preventDefault(); save.disabled = true;
    try {
      const r = await api.updateRemoteDevice(device.id, { name: name.value.trim() });
      if (r.remotes) { remotes = r.remotes; renderAll(); renderSettings(); }
      if (!dlg.isOpen()) return;
      if (!r.ok) { note.textContent = r.error; return; }
      closeModal?.();
      $(`#settings [data-fk="connection-rename-${device.id}"]`)?.focus();
    } catch (e) { if (dlg.isOpen()) note.textContent = e.message; }
    finally { save.disabled = false; }
  };
  name.focus(); name.select();
}

/** Where "No project" sessions run. Changing it waits until no chat is open (their tabs belong to the old folder). */
function chatsSection() {
  const info = chatInfo || { dir: '', isDefault: true, isHome: false };
  const busy = [...tabs.values()].some((t) => t.project.chat);
  return h('section', {},
    secHead('Chats', 'Sessions started with + > No project, for questions and small chores outside your projects.'),
    setField('Chat folder', `Chats run here, and your home folder is added to each one, so they can work on your Desktop or Downloads. Claude Code asks once to trust a new folder.`,
      h('div', {},
        h('div', { class: 'set-path' }, h('bdi', {}, info.dir)),
        h('div', { class: 'set-acts' },
          h('button', { class: 'btn outline sm', 'data-fk': 'chat-pick', disabled: busy, onclick: () => changeChatDir(api.pickChatDir) }, ico('folder'), 'Change…'),
          h('button', { class: 'btn ghost sm', 'data-fk': 'chat-show', onclick: () => api.openFolder(info.dir) }, `Show in ${FILES_APP}`),
          info.isDefault ? null
            : h('button', { class: 'btn ghost sm', 'data-fk': 'chat-reset', disabled: busy, onclick: () => changeChatDir(api.resetChatDir) }, 'Reset to default')))),
    busy ? h('div', { class: 'set-note' }, 'Close the open chats to change the folder.') : null,
    info.isHome ? h('div', { class: 'set-note err' }, 'Claude Code never remembers trust for the home folder, so every chat here asks again.') : null,
    chatNote ? h('div', { class: `set-note${chatNote.err ? ' err' : ''}` }, chatNote.text) : null);
}

async function changeChatDir(call) {
  const old = chatInfo?.dir;
  const oldEntry = projects.find((p) => p.chat)?.path; // may differ from `old` in form
  const r = await call();
  if (!r) return; // dialog cancelled
  if (r.error) chatNote = { text: r.error, err: true };
  else {
    projects = r.projects;
    chatInfo = r.chat;
    const chat = projects.find((p) => p.chat);
    if (chat && oldEntry && expanded.delete(oldEntry)) { expanded.add(chat.path); saveExpanded(); }
    chatNote = old && old.toLowerCase() !== chatInfo.dir.toLowerCase()
      ? { text: 'New chats start here. Chats from the old folder stay on disk but no longer show under Chats.' } : null;
    renderAll();
    pollSessions(true);
  }
  renderSettings();
}

function appearanceSection() {
  const field = setField;
  const line = (cls, width) => h('i', { class: `pv-line${cls ? ' ' + cls : ''}`, style: width ? `width: ${width}%` : null });
  // a mini window in that theme's own tokens (styles.css applies [data-theme] to any element), in Claude colors when on
  const mini = (theme) => h('div', { class: 'pv', 'data-theme': (ui.claude ? 'claude-' : '') + theme },
    h('div', { class: 'pv-side' }, line('sel'), line(null, 80), line(null, 65)),
    h('div', { class: 'pv-main' }, line('fg', 80), line(null, 60), line(null, 70), line('acc')));
  const def = FONT_SIZE.default;
  const zoom = ui.zoom || 1;
  return h('section', {},
    secHead('Appearance', 'How Stanza looks. Changes apply at once.'),
    h('div', { class: 'set-field claude-field' },
      h('div', { class: 'set-text' },
        h('div', { class: 'set-field-name' }, 'Claude colors'),
        h('div', { class: 'set-field-desc' }, 'The Claude desktop app’s warm palette and clay accent, in the dark or light theme below.')),
      h('button', {
        class: `claude-switch${ui.claude ? ' on' : ''}`, role: 'switch', 'aria-checked': String(!!ui.claude),
        'aria-label': 'Claude colors', 'data-fk': 'claude', onclick: (e) => setClaude(!ui.claude, e.currentTarget),
      }, h('span', { class: 'cs-thumb' }, ico('spark')))),
    field('Theme', `System follows ${IS_MAC ? 'macOS' : 'Windows'}. Claude Code picks some colors itself: run /theme in a session to match.`,
      h('div', { class: 'theme-opts', role: 'radiogroup', 'aria-label': 'Theme' }, THEMES.map(([id, label]) =>
        h('button', {
          class: `theme-opt${ui.theme === id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(ui.theme === id), 'data-fk': `theme-${id}`,
          onclick: () => setTheme(id),
        }, h('span', { class: 'pv-frame' }, id === 'system' ? [mini('dark'), mini('light')] : mini(id)), label)))),
    field('Accent color', ui.claude
      ? 'Claude colors use Claude’s clay. Your choice comes back when you turn them off.'
      : 'Primary buttons, focus rings, meters, attention dots and the split view.',
      h('div', { class: 'accent-opts', role: 'radiogroup', 'aria-label': 'Accent color' }, ACCENTS.map(([id, label]) =>
        h('button', {
          class: `accent-opt${ui.accent === id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(ui.accent === id), 'data-fk': `accent-${id}`,
          disabled: !!ui.claude,
          onclick: () => setAccent(id),
        }, h('span', { class: 'swatch', 'data-accent': id }), label)))),
    field('Terminal text size', 'For every session.',
      h('div', { class: 'size-ctl' },
        h('button', { class: 'btn outline icon sm', title: tip('Smaller text', 'zoomOut'), 'data-fk': 'size-down', disabled: ui.fontSize <= FONT_SIZE.min, onclick: () => setFontSize(ui.fontSize - 1) }, ico('minus')),
        h('span', { class: 'size-val' }, `${ui.fontSize} px`),
        h('button', { class: 'btn outline icon sm', title: tip('Larger text', 'zoomIn'), 'data-fk': 'size-up', disabled: ui.fontSize >= FONT_SIZE.max, onclick: () => setFontSize(ui.fontSize + 1) }, ico('plus')),
        ui.fontSize !== def
          ? h('button', { class: 'btn ghost sm', title: tip('Default text size', 'zoomReset'), 'data-fk': 'size-reset', onclick: () => setFontSize(def) }, `Reset to ${def}`)
          : null)),
    field('Interface zoom', `The whole window.${keyText('zoomIn') ? ` ${keyText('zoomIn')} / ${keyText('zoomOut')} while no terminal has focus.` : ''}`,
      h('div', { class: 'size-ctl' },
        h('button', { class: 'btn outline icon sm', title: 'Zoom out', 'data-fk': 'zoom-down', disabled: zoom <= ZOOM_STEPS[0], onclick: () => stepZoom(-1) }, ico('minus')),
        h('span', { class: 'size-val' }, `${Math.round(zoom * 100)} %`),
        h('button', { class: 'btn outline icon sm', title: 'Zoom in', 'data-fk': 'zoom-up', disabled: zoom >= ZOOM_STEPS.at(-1), onclick: () => stepZoom(1) }, ico('plus')),
        zoom !== 1
          ? h('button', { class: 'btn ghost sm', 'data-fk': 'zoom-reset', onclick: () => setZoom(1) }, 'Reset to 100 %')
          : null)));
}

function setTheme(theme) {
  ui.theme = theme;
  api.setUi({ theme }); // main sets nativeTheme.themeSource; the prefers-color-scheme change then calls applyTheme
  renderSettings();
}

/**
 * The Claude colors switch. The thumb slides and its spark turns first (CSS, on this button), then the new palette
 * spreads over the window in a circle from the switch: a view transition whose new snapshot is revealed by a growing
 * clip-path. Reduced motion (or no view transitions) just swaps. Clicks during the animation are ignored.
 */
let claudeSwitching = false;
function setClaude(on, btn) {
  if (claudeSwitching) return;
  ui.claude = on;
  api.setUi({ claude: on });
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-checked', String(on));
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return applyTheme();
  claudeSwitching = true;
  setTimeout(() => {
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => {
      applyTheme(); // re-renders the page: the new switch is born in its end state
      if (on) $('#settings .claude-switch')?.classList.add('pop'); // one ring burst, not on every re-render
    });
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(0.22, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    )).catch(() => {});
    vt.finished.finally(() => { claudeSwitching = false; });
  }, 260);
}

function setAccent(accent) {
  ui.accent = accent;
  api.setUi({ accent });
  applyTheme();
}

function shortcutsSection() {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return h('section', {},
    secHead('Shortcuts', 'Click a shortcut to change it, or + to add another. Esc cancels.',
      SHORTCUTS.some(isCustom) ? h('button', { class: 'btn outline sm', onclick: resetAllKeys }, 'Reset all') : null),
    keysNote ? h('div', { class: `set-note${keysNote.err ? ' err' : ''}` }, keysNote.text) : null,
    groups.map((g) => h('div', { class: 'set-group' },
      h('div', { class: 'set-label' }, g),
      h('div', { class: 'set-card' }, SHORTCUTS.filter((s) => s.group === g).map(shortcutRow)))));
}

function shortcutRow(s) {
  const rec = recording?.id === s.id ? recording : null;
  const recChip = () => h('span', { class: 'chip rec' }, 'Press keys…');
  const chip = (c, i) => (rec?.index === i ? recChip() : h('span', { class: 'chip' },
    h('button', { class: 'chip-key', title: 'Click, then press the new keys', onclick: () => startRecording(s.id, i) }, comboText(c)),
    h('button', { class: 'chip-x', title: 'Remove', onclick: () => setKeys(s.id, keymap[s.id].filter((_, j) => j !== i)) }, ico('x'))));
  return h('div', { class: `set-row${rec ? ' recording' : ''}` },
    h('div', { class: 'set-text' },
      h('div', { class: 'set-name' }, s.label),
      s.hint ? h('div', { class: 'set-hint' }, s.hint) : null),
    h('div', { class: 'set-keys' },
      keymap[s.id].map(chip),
      rec?.index === -1 ? recChip() : null,
      !keymap[s.id].length && !rec ? h('span', { class: 'set-none' }, 'Not set') : null,
      h('button', { class: 'btn ghost icon sm', title: 'Add a shortcut', onclick: () => startRecording(s.id, -1) }, ico('plus')),
      isCustom(s)
        ? h('button', { class: 'btn ghost icon sm', title: 'Reset to default', onclick: () => setKeys(s.id, defaultKeys(s)) }, ico('undo'))
        : h('span', { class: 'set-pad' })));
}

function startRecording(id, index) {
  recording = { id, index };
  keysNote = null;
  renderSettings();
}

function setKeys(id, list, note = null) {
  keymap[id] = list;
  keysNote = note;
  saveKeys();
  keysChanged();
}

function resetAllKeys() {
  loadKeys(null);
  keysNote = null;
  saveKeys();
  keysChanged();
}

/** Tooltips, hints and the settings page show the bindings: redraw them all. */
function keysChanged() {
  applyKeyTitles();
  renderWelcome();
  renderSplit();
  lastPanesKey = '';
  renderPanes();
  renderSidebar(true);
  renderFoot(true);
  renderSettings();
}

function applyKeyTitles() {
  $('#toggle-sidebar').title = tip('Toggle sidebar', 'toggleSidebar');
  $('.search').title = tip('Search sessions', 'search');
  $('#search-key').textContent = keyText('search');
  $('#new-tab').title = tip('New session or chat', 'newSession');
  $('#close-tab').title = tip('Close session', 'closeSession');
  $('#toggle-rside').title = tip('Context, MCPs, subagents and running servers', 'toggleRside');
  renderDiffBtn(true);
}

/** While recording, every keydown comes here first. Needs a real key with Ctrl, Alt or Cmd/Win (or an F key). */
function recordKey(e) {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return; // wait for the key itself
  const s = SHORTCUTS.find((x) => x.id === recording.id);
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  if (e.key === 'Escape' && plain) { recording = null; keysNote = null; renderSettings(); return; }
  const fail = (text) => { keysNote = { text, err: true }; renderSettings(); };
  let key = e.code;
  if (s.pattern === 'Digits') {
    if (!/^Digit[1-9]$/.test(e.code)) return fail('This one needs a number key, e.g. ' + comboText(`${JUMP}+Digit1`) + '.');
    key = 'Digits';
  } else if (s.pattern === 'Arrows') {
    if (!e.code.startsWith('Arrow')) return fail('This one needs an arrow key, e.g. ' + comboText(`${JUMP}+ArrowLeft`) + '.');
    key = 'Arrows';
  }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d+$/.test(e.code)) {
    return fail(`Hold ${IS_MAC ? '⌘, ⌥ or ⌃' : 'Ctrl or Alt'} with the key, so typing in the terminal still works.`);
  }
  const c = comboOf(e, key);
  const from = SHORTCUTS.filter((x) => x.id !== s.id && keymap[x.id].includes(c));
  for (const x of from) keymap[x.id] = keymap[x.id].filter((k) => k !== c);
  const list = [...keymap[s.id]];
  if (recording.index >= 0) list[recording.index] = c;
  else list.push(c);
  recording = null;
  setKeys(s.id, [...new Set(list)],
    from.length ? { text: `${comboText(c)} now runs "${s.label}" instead of "${from.map((x) => x.label).join('", "')}".` } : null);
}

function renderStatus() {
  const tab = activeTab();
  const left = $('#status-left');
  left.replaceChildren();
  if (tab) {
    const info = git[tab.project.path];
    if (info) {
      left.append(h('span', { class: 'stat' }, ico('branch'), info.detached ? `@${info.branch}` : info.branch));
      left.append(info.dirty
        ? h('button', { class: 'stat warn stat-btn', title: tip('Show changes', 'showChanges'), onclick: toggleDiff }, `● ${info.dirty} change${info.dirty === 1 ? '' : 's'}`)
        : h('span', { class: 'stat ok' }, '✓ clean'));
      if (info.ahead) left.append(h('span', { class: 'stat info' }, `↑${info.ahead}`));
      if (info.behind) left.append(h('span', { class: 'stat info' }, `↓${info.behind}`));
    }
    left.append(h('span', { class: 'path' }, displayPath(tab.project)));
  }
  renderDiffBtn();
  const running = [...tabs.values()].filter((t) => t.status === 'running').length;
  $('#status-right').replaceChildren(
    h('span', { class: 'stat' }, `${running} session${running === 1 ? '' : 's'} running`));
}

// ------------------------------------------------------------ right sidebar ----
// Active tab's context fill, MCP health, subagents, and the running dev servers. Each section folds shut (ui.collapsed).

/** "node_modules/vite/bin/vite.js" -> "vite", python.exe -> "python". */
function itemName(s) {
  const pkg = /node_modules[\\/](?:\.bin[\\/])?((?:@[^\\/\s"]+[\\/])?[^\\/\s"]+)/i.exec(s.cmd || '')?.[1];
  return pkg ? pkg.replace('\\', '/') : s.name.replace(/\.exe$/i, '');
}

const MCP_STATUS = { // status -> [color class, label]
  connected: ['ok', 'connected'],
  failed: ['err', 'failed'],
  needs_client_registration: ['err', 'needs registration'],
  needs_auth: ['warn', 'needs auth'],
  disabled: ['mute', 'disabled'],
  unknown: ['mute', 'unknown'],
};
/** "plugin:design:slack" -> "slack"; the full name stays in the tooltip. */
const mcpName = (n) => (n.startsWith('plugin:') ? n.split(':').pop() : n);

const statusDot = (cls) => h('i', { class: `dot s ${cls}` });
let mcpMore = false; // MCPs that are not connected stay folded behind a "Show N more" row
let copiedPort = null; // port whose address was just copied (its row says "Copied" for a moment)
const RSIDE_SHOWN = 5; // Subagents / Running rows before "Show N more"
const rsideMore = new Set(); // sections ('agents', 'running') unfolded past RSIDE_SHOWN

/** The first RSIDE_SHOWN rows, then a "Show N more" / "Show less" row (rsideMore, cleared when the section is collapsed). */
function foldRows(id, rows) {
  if (rows.length <= RSIDE_SHOWN) return rows;
  const all = rsideMore.has(id);
  const toggle = () => { if (!rsideMore.delete(id)) rsideMore.add(id); renderRside(true); };
  return [...(all ? rows : rows.slice(0, RSIDE_SHOWN)),
    h('div', { class: 'rrow rmore', onclick: toggle }, all ? 'Show less' : `Show ${rows.length - RSIDE_SHOWN} more`)];
}

function rsection(id, title, count, ...body) {
  const open = !ui.collapsed.includes(id);
  return h('section', { class: 'rsec' },
    h('button', { class: `rsec-head${open ? ' open' : ''}`, 'aria-expanded': String(open), onclick: () => toggleRsection(id) },
      ico('chevron'), title, count != null ? h('span', { class: 'count' }, count) : null),
    open ? body.flat(2) : null);
}

function toggleRsection(id) {
  const set = new Set(ui.collapsed);
  if (!set.delete(id)) { set.add(id); rsideMore.delete(id); } // collapsing folds the list again: reopening shows the first few
  ui.collapsed = [...set];
  api.setUi({ collapsed: ui.collapsed });
  renderRside(true);
  if (id === 'images') pollImages();
  if (id === 'docs') pollDocs();
}

/** One tile per image; the thumbnail arrives later (pollImages sets src on the tile already on screen). */
function imageTile(tab, session, items, i) {
  const it = items[i];
  const url = thumbsBy.get(tab.id)?.get(it.id);
  return h('button', { class: 'img-tile', 'data-id': it.id, title: it.file || `Pasted image ${it.label}`, onclick: () => imageDialog(tab, session, items, i) },
    h('img', { alt: '', src: url || null }),
    h('span', { class: 'img-label' }, it.label));
}

function copyServer(s) {
  api.writeClipboard(`http://localhost:${s.port}`);
  copiedPort = s.port;
  renderRside();
  setTimeout(() => { if (copiedPort === s.port) { copiedPort = null; renderRside(); } }, 1200);
}

/**
 * Subagents: everything defined for the project, plus built-in/plugin types that ran in this session. Each running run
 * gets its own row (three parallel general-purpose agents = three rows, labelled by their description); finished runs
 * and definitions stay one row per type.
 */
function agentRows(proj, tab) {
  const info = tab?.kind === 'claude' ? infoBy.get(tab.id) : null;
  const defs = new Map((definedBy.get(proj?.path || GLOBAL) || []).map((d) => [d.name, d.model]));
  const rows = new Map([...defs].map(([name, model]) => [name, { name, model, running: 0, done: 0 }]));
  const live = [];
  // A run shows the model its replies carry, else the one the Agent call or its definition asked for, else nothing:
  // never the session's, which a run only has when it inherits (and then its first reply says so).
  for (const a of info?.agents || []) { // newest first
    const def = defs.get(a.type);
    const model = a.model || a.requested || (def !== 'inherit' && def) || null;
    if (a.running) {
      live.push({ name: a.type, runId: a.id, desc: a.description || '', start: a.start, model, running: 1, done: 0 });
      continue;
    }
    if (!rows.has(a.type)) rows.set(a.type, { name: a.type, model: null, running: 0, done: 0 });
    const r = rows.get(a.type);
    r.done++;
    if (!r.ran) { r.model = model; r.ran = true; } // the newest finished run beats the definition's
  }
  // A type with runs going and none finished is shown by those rows alone (no idle row beside them).
  for (const l of live) if (!rows.get(l.name)?.done) rows.delete(l.name);
  // Runs of one type without a description, or with the same one, are told apart by their start time.
  const dup = live.filter((l) => !l.desc || live.some((o) => o !== l && o.name === l.name && o.desc === l.desc));
  for (const l of dup) {
    const at = `started ${new Date(l.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    l.desc = l.desc ? `${l.desc} (${at})` : at;
  }
  const rank = (r) => (r.running ? 0 : r.done ? 1 : 2);
  return [...live, ...rows.values()] // sort is stable: runs of one type stay newest first
    .map((r) => (r.running || r.ran || r.model !== 'inherit' ? r : { ...r, model: info?.model || null })) // an idle definition that inherits
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

let lastRsideKey = '';
function renderRside(force = false) {
  syncDocs();
  const proj = currentProject();
  if (proj?.remoteId) {
    const key = `remote:${proj.path}`;
    if (!force && lastRsideKey === key) return;
    lastRsideKey = key;
    $('#rside-panel').replaceChildren(h('div', { class: 'rnote remote-summary' },
      h('strong', {}, remoteName(proj)), h('p', {}, proj.remotePath),
      h('p', {}, 'Session history and Git changes are available. File viewers, uploads, server discovery, MCP and subagent details are not available remotely yet.')));
    return;
  }
  const ctx = contextInfo();
  const mcp = mcpBy.get(proj?.path || GLOBAL);
  const tab = activeTab();
  const agents = agentRows(proj, tab);
  // Only listeners started from our sessions: the active tab's, or every tab's on the home screen.
  const mine = (s) => s.owner?.type === 'session' && (!tab || s.owner.sessionId === tab.id);
  const servers = ports.ok ? ports.servers.filter(mine) : [];
  const imgs = tab?.kind === 'claude' && tab.sessionId && imagesBy.get(tab.id)?.session === tab.sessionId ? imagesBy.get(tab.id).items : null;
  const docList = tab ? docListBy.get(tab.id) : null;

  const key = JSON.stringify([ctx && [ctx.session?.ctx, ctx.pct, ctx.win], proj?.path, mcp, agents, ports.ok && servers, ports.error, ui.collapsed, copiedPort, mcpMore, [...rsideMore], tab?.id, imgs, docList]);
  if (!force && key === lastRsideKey) return;
  lastRsideKey = key;

  const lvl = ctx?.pct != null ? levelOf(ctx.pct) : '';
  const head = ctx?.pct != null
    ? h('div', { class: 'ctx-head', title: WINDOW_NOTE },
        h('div', { class: 'ctx-line' },
          h('span', { class: 'ctx-title' }, 'Context'),
          h('span', { class: 'ctx-val' }, `${fmtTok(ctx.session.ctx)} / ${fmtTok(ctx.win)}`)),
        h('div', { class: `ctx-pct ${lvl}`.trim() }, `${ctx.pct}%`),
        h('span', { class: `meter big ${lvl}`.trim() }, h('i', { style: `width:${ctx.pct}%` })))
    : h('div', { class: 'ctx-head' },
        h('div', { class: 'ctx-line' }, h('span', { class: 'ctx-title' }, 'Context')),
        h('div', { class: 'rnote' }, ctx ? 'Shown after Claude\'s first reply.' : 'Open a Claude tab to see context.'));

  const mcpBody = !mcp ? h('div', { class: 'rrow' }, statusDot('wait'), h('span', { class: 'name' }, 'Checking…'))
    : !mcp.ok ? h('div', { class: 'rnote' }, 'Could not read MCP status.')
    : !mcp.servers.length ? h('div', { class: 'rnote' }, 'No MCP servers configured.')
    : (() => {
        const mcpRow = (m) => {
          const [cls, label] = MCP_STATUS[m.status] || MCP_STATUS.unknown;
          return h('div', { class: 'rrow', title: `${m.name}: ${m.label || label}` },
            statusDot(cls), h('span', { class: 'name' }, mcpName(m.name)),
            h('span', { class: `meta t-${cls}` }, m.status === 'unknown' && m.label ? m.label : label));
        };
        const rest = mcp.servers.filter((m) => m.status !== 'connected');
        return [
          proj ? null : h('div', { class: 'rnote' }, 'User-level servers, no project selected.'),
          ...mcp.servers.filter((m) => m.status === 'connected').map(mcpRow),
          rest.length ? h('div', { class: 'rrow rmore', title: rest.map((m) => `${mcpName(m.name)}: ${m.label || m.status}`).join('\n'),
            onclick: () => { mcpMore = !mcpMore; renderRside(true); } }, mcpMore ? 'Show less' : `Show ${rest.length} more`) : null,
          ...(mcpMore ? rest.map(mcpRow) : []),
        ];
      })();

  const agentBody = agents.length ? foldRows('agents', agents.map((a) => {
    const st = a.running ? 'working' : a.done ? 'done' : 'idle';
    const tip = `${a.name}: ${st}${a.desc ? `\n${a.desc}` : ''}${a.done ? `, ${a.done} finished this session` : ''}`;
    return h('div', { class: 'rrow copy', title: `${tip}\nClick to see its prompt`, onclick: () => agentDialog(a, activeTab()) },
      st === 'working' ? h('i', { class: 'dot s working' }) : st === 'done' ? h('span', { class: 't-ok' }, ico('check')) : statusDot('mute'),
      h('span', { class: 'name' }, a.name, a.desc ? h('span', { class: 'ag-desc' }, ` · ${a.desc}`) : null),
      h('span', { class: 'meta mono' }, a.model ? prettyModel(a.model) : '—'));
  })) : h('div', { class: 'rnote' }, 'No subagents defined.');

  const runBody = !ports.ok ? h('div', { class: 'rnote t-err' }, ports.error || 'Port scan failed')
    : !servers.length ? h('div', { class: 'rnote' }, tab ? 'Nothing running in this session.' : 'Nothing running.')
    : foldRows('running', servers.map((s) => {
        const copyable = !!s.port && !/emulator|qemu|adb/i.test(`${s.name} ${s.cmd || ''}`);
        const owner = !tab && tabs.get(s.owner.sessionId); // home screen: say which session started it
        return h('div', {
          class: `rrow${copyable ? ' copy' : ''}${copiedPort === s.port ? ' copied' : ''}`,
          title: copyable ? `Copy http://localhost:${s.port}\n${kbd('Shift+click')} to open it in the browser` : (s.cmd || s.name),
          onclick: copyable ? (e) => (e.shiftKey ? api.openExternal(`http://localhost:${s.port}`) : copyServer(s)) : null,
        }, statusDot('ok'), h('span', { class: 'name' }, itemName(s), owner ? h('span', { class: 'ag-desc' }, ` · ${tabLabel(owner)}`) : null),
          h('span', { class: 'meta mono' }, copiedPort === s.port ? 'Copied' : s.port ? `:${s.port}` : ''));
      }));

  const imgBody = tab?.kind !== 'claude' ? h('div', { class: 'rnote' }, 'Open a Claude tab to see its images.')
    : !imgs ? h('div', { class: 'rnote' }, tab.sessionId ? 'Loading…' : 'No images yet.')
    : !imgs.length ? h('div', { class: 'rnote' }, 'No images in this session.')
    : h('div', { class: 'img-grid' }, imgs.map((_, i) => imageTile(tab, tab.sessionId, imgs, i)));

  const working = agents.filter((a) => a.running).length;
  const docCount = docList ? new Set([...docList.session, ...docList.project].map(docKey)).size : 0;
  // Home screen: Context, Docs and Images belong to one tab, so they're left out rather than asking for one.
  $('#rside-panel').replaceChildren(tab ? head : '',
    rsection('mcp', 'MCPs', mcp?.ok ? `${mcp.servers.filter((m) => m.status === 'connected').length}/${mcp.servers.length}` : null, mcpBody),
    rsection('agents', 'Subagents', working ? `${working} working` : agents.length || null, agentBody),
    rsection('running', 'Running', servers.length || null, runBody),
    tab ? rsection('docs', 'Docs', docCount || null, docRows(tab, docList)) : '',
    tab ? rsection('images', 'Images', imgs?.length || null, imgBody) : '');
}

/** Both are slow-ish and rarely change: fetched per project, only while the panel is open and the window visible. */
const rsideBusy = new Set();
// Without a project (home screen) main lists the user-level ones: `claude mcp list` in the home folder, ~/.claude/agents.
async function pollMcp() {
  if (currentProject()?.remoteId) return;
  const key = currentProject()?.path || GLOBAL;
  if (!rsideOnScreen() || document.hidden || rsideBusy.has(key)) return;
  rsideBusy.add(key);
  try {
    const next = await api.mcpList(key || null);
    if (JSON.stringify(next) !== JSON.stringify(mcpBy.get(key))) { mcpBy.set(key, next); renderRside(); }
  } finally {
    rsideBusy.delete(key);
  }
}

async function pollDefinedAgents() {
  if (currentProject()?.remoteId) return;
  const key = currentProject()?.path || GLOBAL;
  if (!rsideOnScreen() || document.hidden) return;
  const next = await api.definedAgents(key || null);
  if (JSON.stringify(next) !== JSON.stringify(definedBy.get(key))) { definedBy.set(key, next); renderRside(); }
}

// --------------------------------------------------------------- session info ----
// In the status bar for a Claude tab: model, effort, and the session's subagents (from its transcript folder).

/** claude-opus-5-5 -> "Opus 5.5"; aliases ("opus") and display names pass through. */
function prettyModel(m) {
  const long = /\[1m\]$/i.test(m) ? ' (1M)' : ''; // also on an alias or a /model display name: "opus[1m]", "Opus 4.6[1m]"
  const base = m.replace(/\[1m\]$/i, '');
  const id = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(base);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!id) return cap(base) + long;
  return `${cap(id[1])} ${id[2]}${id[3] ? '.' + id[3] : ''}${long}`;
}

let lastInfoKey = '';
function renderInfo() {
  const tab = activeTab();
  const show = !!tab && tab.kind === 'claude';
  const i = show ? infoBy.get(tab.id) : null;
  const key = JSON.stringify([show && tab.id, i]);
  if (key === lastInfoKey) return;
  lastInfoKey = key;

  const bar = $('#status-info');
  if (!show) { bar.replaceChildren(); return; }
  const running = i ? i.agents.filter((a) => a.running) : [];
  const done = i ? i.agents.length - running.length : 0;
  const agentTip = i?.agents.map((a) => `${a.type}${a.description ? ': ' + a.description : ''} (${a.running ? 'running' : 'done'})`).join('\n');
  bar.replaceChildren(...[
    h('span', { class: 'i-item', title: 'Model' }, ico('cpu'), h('span', { class: 'i-main' }, i?.model ? prettyModel(i.model) : '—')),
    h('span', { class: 'i-item', title: 'Effort level (/effort to change)' }, ico('zap'), i?.effort ? `${i.effort} effort` : '—'),
    i?.agents.length
      ? h('span', { class: 'i-item i-agents', title: agentTip },
          ico('users'),
          running.length ? [h('i', { class: 'dot working' }), `${running.length} running`,
            h('span', { class: 'i-names' }, running.map((a) => a.type).join(', '))] : null,
          done ? h('span', { class: 'i-done' }, `${done} subagent${done === 1 ? '' : 's'} done`) : null)
      : null,
  ].filter(Boolean));
}

const infoBusy = new Set(); // per tab, so a slow poll of one tab never drops the poll of the tab just focused
async function pollInfo() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'claude') { renderInfo(); pollDocs(); return; }
  if (infoBusy.has(tab.id) || document.hidden) return;
  infoBusy.add(tab.id);
  try {
    const session = tab.sessionId;
    const next = await api.sessionInfo(tab.project.path, session, tab.id);
    if (tabs.has(tab.id) && tab.sessionId === session) infoBy.set(tab.id, next); // /clear meanwhile: the next poll has it
    renderInfo(); // key-diffed, shows whichever tab is active now
    renderRside();
  } finally {
    infoBusy.delete(tab.id);
  }
  pollImages();
  pollDocs();
}

/** Images of the active session: only while the panel is open and the section expanded. Thumbnails only for new ids. */
const imagesBusy = new Set();
async function pollImages() {
  const tab = activeTab();
  if (tab?.project.remoteId) return;
  if (!tab || tab.kind !== 'claude' || !tab.sessionId || !rsideOnScreen() || ui.collapsed.includes('images') || document.hidden || imagesBusy.has(tab.id)) return;
  imagesBusy.add(tab.id);
  try {
    const session = tab.sessionId;
    const next = await api.imagesList(tab.project.path, session);
    if (!tabs.has(tab.id) || tab.sessionId !== session) return;
    if (imagesBy.get(tab.id)?.session !== session) thumbsBy.set(tab.id, new Map());
    const thumbs = thumbsBy.get(tab.id);
    for (const id of thumbs.keys()) if (!next.items.some((i) => i.id === id)) thumbs.delete(id);
    imagesBy.set(tab.id, { session, items: next.items });
    renderRside();
    for (const it of next.items) {
      if (thumbs.has(it.id)) continue;
      if (activeTab() !== tab) return; // left the tab: the rest load when it is active again
      const url = await api.imageThumb(tab.project.path, session, it.id);
      if (tab.sessionId !== session || thumbsBy.get(tab.id) !== thumbs) return;
      thumbs.set(it.id, url);
      const img = url && $(`#rside .img-tile[data-id="${CSS.escape(it.id)}"] img`);
      if (img && activeTab() === tab) img.src = url;
    }
  } finally {
    imagesBusy.delete(tab.id);
  }
}

// ----------------------------------------------------------- markdown tabs ----
// The right sidebar has tabs: its own content (#rside-panel) and one per open markdown file (#rside-doc), kept per project
// (docsBy, saved for the next launch). The pill floating at its bottom switches them; it is shown while the active tab's
// project has a file open (the home screen has none). A file tab widens the sidebar to ui.rsideDocPct % of the window
// (--rside-doc-w, see docWidth) and the sidebar's own tab narrows it back to ui.rsideW, animated (`rside-sliding`).
// Terminals are refitted once the slide has settled, not on every frame: each resize makes Claude repaint its screen.
// Files are read and watched by main (md:read, md:watch) and parsed here (lib/md.js); text only becomes text nodes.
// The head's pencil swaps a page for a plain textarea with the raw markdown, saved by itself (md:write, see saveDocEdit).

const docsBy = new Map(); // project path -> { files: [absolute path], active: index into files | -1 (the sidebar's own tab) }
const docPages = new Map(); // docKey -> { ok, doc | error } as last read, dropped when the file changes on disk
const docLoads = new Map(); // docKey -> pending read
const docScroll = new Map(); // docKey -> scroll position of its page (runtime only)
const docImgs = new Map(); // `${file}\n${src}` -> data URL | null (an image a page shows, read by main)
const docListBy = new Map(); // tab id -> { session: [path], project: [path] } for the Docs section
const docEditing = new Set(); // docKeys whose page shows the editor (runtime only)
let docEdit = null; // the editor on screen: { file, ta, saved: the file's text as last read or written, clean: the textarea's value for it, eol, timer, saving }
const DOC_SAVE_MS = 600; // autosave after this long without typing
const DOC_RE = /\.(?:md|markdown)$/i;
const DOC_MIN_W = 320; // px: the narrowest a file tab makes the sidebar
const DOC_MIN_MAIN = 360; // px the terminal keeps beside a file tab
const DOC_PCT = { min: 20, max: 75, def: 40 }; // ui.rsideDocPct, % of the window
const SLIDE_MS = 280; // styles.css: body.rside-sliding #rside
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ALERT_TITLES = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

const docKey = (f) => f.toLowerCase(); // Windows and macOS (APFS by default) paths are case-insensitive
const docName = (f) => f.split(/[\\/]/).pop();
const docProject = () => activeTab()?.project || null;
const docsOf = (p) => (p ? docsBy.get(p.path) : null);
/** The file whose tab is active in the right sidebar, else null (its own tab, or no file open). */
function activeDoc() {
  const d = docsOf(docProject());
  return d && d.active >= 0 ? d.files[d.active] : null;
}
/** The file's path inside the project ("docs/PLAN.md"), else its full path. */
function docRel(p, f) {
  const root = p.path.replace(/[\\/]+$/, '');
  return docKey(f).startsWith(docKey(root)) && /[\\/]/.test(f[root.length] || '') ? f.slice(root.length + 1) : f;
}

/** Under a page's title: "proj\docs\PLAN.md" inside the project, else the full path. */
function docWhere(p, f) {
  if (!p) return f;
  const rel = docRel(p, f);
  return rel === f ? f : `${projName(p)}${IS_MAC ? '/' : '\\'}${rel}`;
}

function saveDocs() {
  api.saveDocs(Object.fromEntries(docsBy));
  api.watchDocs([...new Set([...docsBy.values()].flatMap((d) => d.files))]);
}

/** Open a markdown file as a tab of its project's right sidebar (or switch to it if it is open). */
function openDoc(project, file, anchor = null) {
  let d = docsBy.get(project.path);
  if (!d) docsBy.set(project.path, (d = { files: [], active: -1 }));
  let i = d.files.findIndex((f) => docKey(f) === docKey(file));
  if (i < 0) i = d.files.push(file) - 1;
  d.active = i;
  docAnchor = anchor;
  saveDocs();
  syncDocs();
  // Closed (by hand or by a cramped split): it floats in over the terminal instead of taking room, and stays until used
  // (sticky). A peek stays a peek, a pinned sidebar just switches tabs.
  if (!rsideOnScreen()) { rightPeek.set(true); rightPeek.sticky = true; }
}

/** Switch the active project's sidebar to one of its file tabs (index), or to its own tab (-1). */
function selectDoc(i) {
  const d = docsOf(docProject());
  if (!d || d.active === i) return;
  if (i === DIFF_TAB) d.prev = d.active; // closing Changes goes back there
  d.active = i;
  saveDocs();
  syncDocs();
  if (i === DIFF_TAB) pollDiff(); // while another tab showed, only the counts were polled
}

/** Close a file tab. The active one hands over to its neighbour (right, else left), the last one to the sidebar's own tab. */
function closeDoc(project, file) {
  const d = docsOf(project);
  const i = d ? d.files.findIndex((f) => docKey(f) === docKey(file)) : -1;
  if (i < 0) return;
  d.files.splice(i, 1);
  if (d.active === i) d.active = d.files.length ? Math.min(i, d.files.length - 1) : -1;
  else if (d.active > i) d.active--;
  if (d.prev === i) d.prev = -1;
  else if (d.prev > i) d.prev--;
  if (!d.files.length && !d.diff) docsBy.delete(project.path);
  pillEls.delete(`${project.path}\n${docKey(file)}`);
  if (![...docsBy.values()].some((x) => x.files.some((f) => docKey(f) === docKey(file)))) {
    docPages.delete(docKey(file));
    docScroll.delete(docKey(file));
  }
  saveDocs();
  syncDocs();
}

/** The doc tab width in px: ui.rsideDocPct of the window, leaving the terminal DOC_MIN_MAIN beside the left sidebar. */
function docWidth() {
  const room = window.innerWidth - (sidebarShown() ? ui.sidebarW : 0) - DOC_MIN_MAIN;
  return Math.round(Math.max(DOC_MIN_W, Math.min((window.innerWidth * (ui.rsideDocPct || DOC_PCT.def)) / 100, room)));
}
const applyDocW = () => document.documentElement.style.setProperty('--rside-doc-w', `${docWidth()}px`);

/**
 * Animate the right sidebar's width: `change` makes the new width apply (a class, or opening it), with the transition
 * on (body.rside-sliding). Terminals keep their size until it has settled, then refit once (fitActive is held meanwhile).
 */
let slideTimer = 0;
function slideRside(change) {
  document.body.classList.add('rside-sliding');
  change();
  clearTimeout(slideTimer);
  slideTimer = setTimeout(() => {
    slideTimer = 0;
    document.body.classList.remove('rside-sliding');
    fitActive();
    autoRside();
  }, (reducedMotion.matches ? 0 : SLIDE_MS) + 30);
}

let docBoot = false; // the launch's restore is activating its tabs: a saved file tab shows at once, without sliding
let docAnchor = null; // heading to scroll to once the next page is shown (a link to "other.md#section")
let docShown = null; // the file whose page is in #rside-doc
/** Bring the right sidebar in line with the active project's tabs: width, which content shows, the pill. Cheap; called from renderRside. */
function syncDocs() {
  const p = docProject();
  const file = activeDoc();
  const diff = diffActive(p);
  const wide = !!file || diff; // a file tab or the Changes tab: both at --rside-doc-w
  const body = document.body;
  if (!file && docShown) { keepDocScroll(); docShown = null; dropDocEdit(); } // before it hides: a hidden page has no scroll position
  if (!diff) keepDiffScroll();
  if (body.classList.contains('rside-doc') !== wide) {
    const set = () => body.classList.toggle('rside-doc', wide);
    if (rsideOnScreen() && !docBoot) slideRside(set);
    else { set(); requestAnimationFrame(fitActive); }
    autoRside();
  }
  $('#rside-panel').hidden = wide;
  $('#rside-doc').hidden = !file;
  $('#rside-diff').hidden = !diff;
  renderPill(p, docsOf(p));
  renderDiffBtn();
  if (diff) renderDiff();
  const k = file && docKey(file);
  if (file && (!docShown || k !== docKey(docShown) || (!docPages.has(k) && !docLoads.has(k)))) showDocPage(file);
}

const docBody = () => $('#rside-doc .doc-body');
const docScroller = () => docEdit?.ta || docBody(); // the editor scrolls itself
function keepDocScroll() {
  if (docShown && docScroller()) docScroll.set(docKey(docShown), docScroller().scrollTop);
}

function loadDoc(file) {
  const k = docKey(file);
  if (docPages.has(k)) return Promise.resolve(docPages.get(k));
  if (!docLoads.has(k)) {
    docLoads.set(k, api.readDoc(file)
      .then((r) => (r.ok ? { ok: true, text: r.text, doc: parseMarkdown(r.text) } : { ok: false, error: r.error }), () => ({ ok: false, error: 'Could not read the file.' }))
      .then((v) => { docLoads.delete(k); docPages.set(k, v); return v; }));
  }
  return docLoads.get(k);
}

/** Show a file's page in #rside-doc: its own last scroll position, or the current one when it is re-read after a change. */
let docSeq = 0;
async function showDocPage(file, reread = false) {
  const seq = ++docSeq;
  const host = $('#rside-doc');
  const same = docShown && docKey(docShown) === docKey(file);
  if (!same) keepDocScroll();
  const top = same ? docScroller()?.scrollTop || 0 : docScroll.get(docKey(file)) || 0;
  dropDocEdit(); // the page is rebuilt: what was typed is saved first
  docShown = file;
  const p = docProject();
  if (!same && !docPages.has(docKey(file))) host.replaceChildren(docHead(p, file), h('div', { class: 'doc-body' }, h('div', { class: 'rnote' }, 'Loading…')));
  const v = await loadDoc(file);
  if (seq !== docSeq) return; // another page was asked for meanwhile
  const editing = v.ok && docEditing.has(docKey(file));
  const page = editing ? h('div', { class: 'doc-body editing' }, docEditor(file, v.text).ta)
    : h('div', { class: 'doc-body', tabindex: '-1', onclick: (e) => docClick(e, file), onkeydown: (e) => { if (e.key === 'Enter') docClick(e, file); } },
      v.ok ? h('article', { class: 'md' }, mdPage(v.doc || parseMarkdown(v.text), file))
        : h('div', { class: 'doc-missing' }, h('div', {}, v.error), h('div', { class: 'doc-missing-path' }, file)));
  host.replaceChildren(docHead(p, file, v.ok), page);
  (editing ? docEdit.ta : page).scrollTop = reread || !docAnchor ? top : 0;
  if (docAnchor && !editing) scrollToAnchor(docAnchor);
  docAnchor = null;
}

function docHead(p, file, ok = false) {
  const editing = ok && docEditing.has(docKey(file));
  return h('div', { class: 'doc-head' },
    h('div', { class: 'doc-titles', title: file },
      h('div', { class: 'doc-title' }, docName(file)),
      h('div', { class: 'doc-path' }, docWhere(p, file))),
    editing ? h('span', { class: 'doc-save', 'aria-live': 'polite' }) : null,
    ok ? h('button', { class: `btn ghost icon sm${editing ? ' on' : ''}`, title: editing ? 'Back to preview' : 'Edit', 'aria-pressed': String(editing), onclick: () => toggleDocEdit(file) }, ico('pencil')) : null,
    h('button', { class: 'btn ghost icon sm', title: 'Open in VS Code', onclick: () => api.openFile(file) }, ico('code')),
    h('button', { class: 'btn ghost icon sm', title: `Show in ${FILES_APP}`, onclick: () => api.revealDoc(file) }, ico('folder')),
    h('button', { class: 'btn ghost icon sm', title: 'Close', onclick: () => { if (p) closeDoc(p, file); } }, ico('x')));
}

/** The editor for the page being shown (becomes docEdit): a textarea with the raw text, saved DOC_SAVE_MS after typing stops and on blur. */
function docEditor(file, text) {
  const ta = h('textarea', { class: 'doc-edit', spellcheck: 'false', 'aria-label': `Edit ${docName(file)}` });
  ta.value = text;
  const e = (docEdit = { file, ta, saved: text, clean: ta.value, eol: eolOf(text), timer: 0, saving: Promise.resolve() });
  ta.addEventListener('input', () => {
    docSaveStatus(e, '');
    clearTimeout(e.timer);
    e.timer = setTimeout(() => saveDocEdit(e), DOC_SAVE_MS);
  });
  ta.addEventListener('blur', () => saveDocEdit(e));
  return e;
}

/** Write the editor's text if it differs from the file (one write at a time; each reads the textarea when it runs). */
function saveDocEdit(e) {
  clearTimeout(e.timer);
  e.timer = 0;
  e.saving = e.saving.then(async () => {
    const value = e.ta.value;
    if (value === e.clean) return;
    const text = withEol(value, e.eol); // a textarea has only \n
    docSaveStatus(e, 'Saving…');
    const r = await api.writeDoc(e.file, text).catch(() => ({ ok: false, error: 'Could not save.' }));
    if (r.ok) {
      e.saved = text;
      e.clean = value;
      docPages.set(docKey(e.file), { ok: true, text, doc: null }); // parsed when the preview shows it
    }
    docSaveStatus(e, r.ok ? 'Saved' : r.error, !r.ok);
  });
  return e.saving;
}
const flushDocEdit = () => (docEdit ? saveDocEdit(docEdit) : Promise.resolve());
/** The editor leaves the screen: save what was typed. */
function dropDocEdit() {
  const e = docEdit;
  docEdit = null;
  if (e) saveDocEdit(e);
}

function docSaveStatus(e, text, error = false) {
  const el = docEdit === e && $('#rside-doc .doc-save');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', error);
}

/** The head's pencil: preview <-> editor. Back to the preview after the last save has landed, so it shows the new text. */
async function toggleDocEdit(file) {
  const k = docKey(file);
  if (!docEditing.has(k)) {
    docEditing.add(k);
    await showDocPage(file);
    docEdit?.ta.focus({ preventScroll: true });
    return;
  }
  docEditing.delete(k);
  await flushDocEdit();
  showDocPage(file);
}

/** The file being edited changed on disk: our own save is ignored, anything else replaces the text unless typing is pending. */
async function reloadDocEdit(e) {
  const v = await loadDoc(e.file);
  if (docEdit !== e || !v.ok || v.text === e.saved) return;
  if (e.ta.value !== e.clean) { saveDocEdit(e); return; } // typed since the last save: that wins
  const { scrollTop, selectionStart, selectionEnd } = e.ta;
  e.saved = v.text;
  e.eol = eolOf(v.text);
  e.ta.value = v.text;
  e.clean = e.ta.value;
  const n = e.ta.value.length;
  e.ta.setSelectionRange(Math.min(selectionStart, n), Math.min(selectionEnd, n));
  e.ta.scrollTop = scrollTop;
}

function scrollToAnchor(id) {
  const want = id.toLowerCase();
  const el = [...document.querySelectorAll('#rside-doc [data-anchor]')].find((x) => x.dataset.anchor === want);
  el?.scrollIntoView({ block: 'start' });
}

/** Links in a page: #heading scrolls, web links open in the browser, other .md files open as tabs, other files in VS Code. */
async function docClick(e, file) {
  const a = e.target.closest('a[data-href]');
  if (!a) return;
  e.preventDefault();
  const href = a.dataset.href;
  if (href.startsWith('#')) { try { scrollToAnchor(decodeURIComponent(href.slice(1))); } catch { /* malformed */ } return; }
  if (/^https?:/i.test(href)) { api.openExternal(href); return; }
  if (/^[a-z][a-z0-9+.-]+:/i.test(href) && !/^file:/i.test(href)) return; // mailto: and other schemes: nothing to open here
  const hash = href.indexOf('#');
  const target = hash >= 0 ? href.slice(0, hash) : href;
  if (!target) return;
  const abs = await api.resolveDocLink(file, target);
  if (!abs) { a.classList.add('broken'); a.title = `Not found: ${target}`; return; }
  const p = docProject();
  if (DOC_RE.test(abs) && p) openDoc(p, abs, hash >= 0 ? decodeURIComponent(href.slice(hash + 1)) : null);
  else api.openFile(abs);
}

function mdPage(doc, file) {
  const out = [];
  if (doc.front) out.push(h('dl', { class: 'md-front' }, doc.front.flatMap((e) => [h('dt', {}, e.key), h('dd', {}, e.value)])));
  out.push(...mdBlocks(doc.blocks, file, false));
  return out.length ? out : [h('div', { class: 'rnote' }, 'This file is empty.')];
}

function mdBlocks(blocks, file, tight) {
  const align = (a) => (a ? `text-align:${a}` : null);
  return blocks.map((b) => {
    if (b.t === 'h') return h(`h${b.level}`, { 'data-anchor': b.id }, mdInline(b.c, file));
    if (b.t === 'p') return h('p', { class: tight ? 'tight' : null }, mdInline(b.c, file));
    if (b.t === 'code') return h('pre', {}, h('code', {}, b.text));
    if (b.t === 'hr') return h('hr');
    if (b.t === 'quote') {
      return h('blockquote', { class: b.alert ? `alert ${b.alert}` : null },
        b.alert ? h('div', { class: 'alert-title' }, ALERT_TITLES[b.alert]) : null, mdBlocks(b.blocks, file, false));
    }
    if (b.t === 'list') {
      return h(b.ordered ? 'ol' : 'ul', { start: b.ordered && b.start !== 1 ? String(b.start) : null },
        b.items.map((it) => h('li', { class: it.task != null ? 'task' : null },
          it.task != null ? h('span', { class: `md-check${it.task ? ' on' : ''}`, role: 'img', 'aria-label': it.task ? 'Done' : 'Not done' }) : null,
          mdBlocks(it.blocks, file, !b.loose))));
    }
    if (b.t === 'table') {
      return h('div', { class: 'md-table' }, h('table', {},
        h('thead', {}, h('tr', {}, b.head.map((c, k) => h('th', { style: align(b.aligns[k]) }, mdInline(c, file))))),
        h('tbody', {}, b.rows.map((r) => h('tr', {}, r.map((c, k) => h('td', { style: align(b.aligns[k]) }, mdInline(c, file))))))));
    }
    return null;
  });
}

function mdInline(nodes, file) {
  return nodes.map((n) => {
    if (typeof n === 'string') return n;
    if (n.t === 'b') return h('strong', {}, mdInline(n.c, file));
    if (n.t === 'i') return h('em', {}, mdInline(n.c, file));
    if (n.t === 's') return h('del', {}, mdInline(n.c, file));
    if (n.t === 'code') return h('code', {}, n.text);
    if (n.t === 'br') return h('br');
    if (n.t === 'a') return h('a', { 'data-href': n.href, title: n.href, role: 'link', tabindex: '0' }, mdInline(n.c, file));
    if (n.t === 'img') return mdImage(n, file);
    return null;
  });
}

/** Local images are read by main (any size limit there); remote ones are never fetched, they show as a link. */
function mdImage(n, file) {
  if (/^(?:https?:)?\/\//i.test(n.src)) return h('a', { class: 'md-img-link', 'data-href': n.src, title: n.src, role: 'link', tabindex: '0' }, n.alt || 'Image');
  const missing = () => h('span', { class: 'md-img-missing', title: n.src }, n.alt || n.src);
  if (/^data:image\//i.test(n.src)) return h('img', { src: n.src, alt: n.alt });
  const key = `${file}\n${n.src}`;
  if (docImgs.has(key)) return docImgs.get(key) ? h('img', { src: docImgs.get(key), alt: n.alt, title: n.alt || null }) : missing();
  const img = h('img', { alt: n.alt, title: n.alt || null });
  api.docImage(file, n.src).then((url) => {
    if (docImgs.size > 100) docImgs.clear();
    docImgs.set(key, url);
    if (url) img.src = url;
    else img.replaceWith(missing());
  }, () => img.replaceWith(missing()));
  return img;
}

/** A file changed on disk: drop what was read; the page on screen is re-read in place (scroll kept). */
function onDocChanged(file) {
  const k = docKey(file);
  docPages.delete(k);
  for (const key of docImgs.keys()) if (docKey(key.split('\n')[0]) === k) docImgs.delete(key);
  if (!docShown || docKey(docShown) !== k || $('#rside-doc').hidden) return;
  if (docEdit && docKey(docEdit.file) === k) reloadDocEdit(docEdit);
  else showDocPage(docShown, true);
}

// The pill: the sidebar's own tab (an icon), then a dot per file; the active dot stretches into a bar. Elements are kept
// per project and file (pillEls), so only a new dot animates in and the active bar's width can transition.
const pillEls = new Map(); // `${project}\n${docKey}` (or `${project}\n` for the icon) -> element
let lastPillKey = '';
function renderPill(p, d) {
  const pill = $('#rside-pill');
  const files = d?.files || [];
  const key = JSON.stringify([p?.path, files, d?.active, !!d?.diff]);
  if (key === lastPillKey) return;
  lastPillKey = key;
  if (!files.length && !d?.diff) { pill.hidden = true; return; }
  if (pill.hidden) {
    pill.hidden = false;
    pill.classList.remove('enter');
    void pill.offsetWidth; // restart the animation
    pill.classList.add('enter');
  }
  const el = (k, make) => { if (!pillEls.has(k)) pillEls.set(k, make()); return pillEls.get(k); };
  const items = [el(`${p.path}\n`, () => h('button', { class: 'pill-home', onclick: () => selectDoc(-1) }, ico('panelRight')))];
  items[0].classList.toggle('on', d.active === -1);
  items[0].title = 'Context, MCPs, subagents and running servers';
  items[0].setAttribute('aria-current', d.active === -1 ? 'true' : 'false');
  if (d.diff) { // the Changes tab: an icon, which widens on hover to show its ×
    const b = el(`${p.path}\n:diff`, () => h('button', { class: 'pill-diff enter', title: 'Changes', 'aria-label': 'Changes', onclick: () => selectDoc(DIFF_TAB), onanimationend: (e) => e.currentTarget.classList.remove('enter') },
      ico('diff'), h('span', { class: 'pill-x', role: 'button', title: 'Close changes', onclick: (e) => { e.stopPropagation(); closeDiff(docProject()); } }, ico('x'))));
    b.classList.toggle('on', d.active === DIFF_TAB);
    b.setAttribute('aria-current', d.active === DIFF_TAB ? 'true' : 'false');
    items.push(b);
  }
  files.forEach((f, i) => {
    const dot = el(`${p.path}\n${docKey(f)}`, () => {
      const b = h('button', {
        class: 'pill-dot enter', 'aria-label': docName(f), title: docName(f),
        onclick: () => selectDoc(docsOf(docProject())?.files.findIndex((x) => docKey(x) === docKey(f)) ?? -1),
        onanimationend: () => b.classList.remove('enter'),
      }, h('i'), h('span', { class: 'pill-x', role: 'button', title: `Close ${docName(f)}`, onclick: (e) => { e.stopPropagation(); closeDoc(docProject(), f); } }, ico('x')));
      return b;
    });
    dot.classList.toggle('on', i === d.active);
    dot.setAttribute('aria-current', i === d.active ? 'true' : 'false');
    items.push(dot);
  });
  // Move only what changed: a re-inserted element restarts its transitions.
  for (const c of [...pill.children]) if (!items.includes(c)) c.remove();
  items.forEach((x, i) => { if (pill.children[i] !== x) pill.insertBefore(x, pill.children[i] || null); });
}

/** The Docs section's lists for the active tab: only while the panel is open and the section expanded. */
const docsBusy = new Set();
async function pollDocs() {
  const tab = activeTab();
  if (tab?.project.remoteId) return;
  if (!tab || !rsideOnScreen() || ui.collapsed.includes('docs') || document.hidden || docsBusy.has(tab.id)) return;
  docsBusy.add(tab.id);
  try {
    const next = await api.docsList(tab.project.path, tab.kind === 'claude' ? tab.sessionId : null);
    if (tabs.has(tab.id) && JSON.stringify(next) !== JSON.stringify(docListBy.get(tab.id))) { docListBy.set(tab.id, next); renderRside(); }
  } finally {
    docsBusy.delete(tab.id);
  }
}

/** Docs section rows: files this session wrote or edited, then the project's top-level ones not already listed. */
function docRows(tab, list) {
  if (!list) return h('div', { class: 'rnote' }, 'Loading…');
  const seen = new Set(list.session.map(docKey));
  const root = list.project.filter((f) => !seen.has(docKey(f)));
  if (!list.session.length && !root.length) return h('div', { class: 'rnote' }, 'No markdown files yet.');
  const row = (f) => {
    const rel = docRel(tab.project, f);
    const dir = rel.slice(0, Math.max(0, rel.length - docName(f).length - 1));
    return h('div', { class: 'rrow copy', title: `${f}\nClick to read it here`, onclick: () => openDoc(tab.project, f) },
      ico('fileText'), h('span', { class: 'name' }, docName(f)), dir ? h('span', { class: 'meta' }, dir) : null);
  };
  return [
    ...(list.session.length ? [h('div', { class: 'rsub' }, 'Written in this session'), ...foldRows('docs', list.session.map(row))] : []),
    ...(root.length ? [h('div', { class: 'rsub' }, 'Project'), ...root.map(row)] : []),
  ];
}

// ---------------------------------------------------------------- changes ----
// The Changes tab: the active project's uncommitted changes (its repo's working tree and index against HEAD, new files
// included) as a unified diff per file, like the review panes of Claude desktop or Codex. It is a tab of the right
// sidebar beside the markdown tabs (docsBy[project].diff, active = DIFF_TAB), at their width. Opened by the top bar's
// +/- button, the status bar's change count or the showChanges key; when one of them had to open the sidebar, closing
// the tab closes it again (diffPinned). Main runs git (git:diff, git:diffstat) and caches each result under the status
// output and the changed files' mtimes, so polling it after every git status poll is cheap. When the diff changed (its
// id), only the files whose own id changed are rebuilt (diffEls), so a selection elsewhere survives Claude's edits, and
// the file at the top of the view stays there (diffAnchor). Text only becomes text nodes.

const DIFF_TAB = -2; // docsBy[project].active while the Changes tab shows
const DIFF_FOLD_AT = 400; // changed lines: a bigger file starts folded
const LOCK_RE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
const DIFF_STATUS = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'New file, not tracked yet' };
const diffBy = new Map(); // project path -> git:diff result, while its Changes tab is open
const statBy = new Map(); // project path -> { files, added, removed } for the top bar's button
const diffFolds = new Map(); // project path -> Map(file path -> folded) for every file shown (runtime only)
const diffScroll = new Map(); // project path -> scroll position of its page (runtime only)
const diffEls = new Map(); // file id -> its section, for the project on the page (diffOn)
let diffOn = null; // the project whose page is in #rside-diff
let diffPinned = null; // the project whose Changes opened the closed sidebar: closing that tab closes it again

const diffActive = (p = docProject()) => docsOf(p)?.active === DIFF_TAB;
const diffShown = () => diffActive() && rsideOnScreen();
const diffBody = () => $('#rside-diff .diff-body');
function keepDiffScroll() {
  if (diffOn && diffBody()) diffScroll.set(diffOn, diffBody().scrollTop);
}

/** Open the project's Changes tab (or switch to it). The sidebar is opened for it when it is closed. */
function openDiff(p) {
  let d = docsBy.get(p.path);
  if (!d) docsBy.set(p.path, (d = { files: [], active: -1 }));
  if (d.active !== DIFF_TAB) d.prev = d.active; // closing it goes back there
  d.diff = true;
  d.active = DIFF_TAB;
  saveDocs();
  syncDocs();
  if (!rsideOnScreen()) {
    const wasClosed = !ui.servers; // not when a cramped split hid it (autoRside): closing must not save it as closed
    setServers(true);
    if (wasClosed) diffPinned = p.path;
  }
  pollDiff();
}

function closeDiff(p) {
  const d = docsOf(p);
  if (!d?.diff) return;
  d.diff = false;
  if (d.active === DIFF_TAB) d.active = d.prev >= 0 && d.prev < d.files.length ? d.prev : -1;
  if (!d.files.length) docsBy.delete(p.path);
  pillEls.delete(`${p.path}\n:diff`);
  diffBy.delete(p.path);
  saveDocs();
  if (diffPinned === p.path) {
    diffPinned = null;
    if (d.active === -1 && rsideShown()) setServers(false); // closed before it narrows: no slide
  }
  syncDocs();
}

/** The top bar's button, the status bar's change count and the showChanges key: show the Changes tab, or close it. */
function toggleDiff() {
  const p = docProject();
  if (!p || p.chat) return false;
  if (diffShown()) closeDiff(p);
  else openDiff(p);
}

/** The top bar's "+12 −3" button: shown while the project has changes, or while its Changes tab shows. */
let lastDiffBtnKey = '';
function renderDiffBtn(force = false) {
  const p = docProject();
  const s = p && !p.chat ? statBy.get(p.path) : null;
  const on = diffShown();
  const key = JSON.stringify([s, on]);
  if (!force && key === lastDiffBtnKey) return;
  lastDiffBtnKey = key;
  const btn = $('#open-diff');
  btn.hidden = !on && !s?.files;
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.replaceChildren(...[ico('diff'), s && h('span', { class: 'd-add' }, `+${s.added}`), s && h('span', { class: 'd-del' }, `−${s.removed}`)].filter(Boolean));
  btn.title = tip(s ? `Changes: ${s.files} file${s.files === 1 ? '' : 's'}, ${s.added} line${s.added === 1 ? '' : 's'} added, ${s.removed} removed` : 'Changes', 'showChanges');
}

/**
 * After every git status poll (and when the tab or the sidebar shows): the whole diff while the Changes tab is on
 * screen, else just the counts for the button, and nothing for a clean project. One at a time; one asked for meanwhile runs after.
 */
const diffBusy = new Set();
const diffQueued = new Set();
async function pollDiff() {
  const p = docProject();
  if (!p || p.chat || document.hidden) return;
  if (diffBusy.has(p.path)) { diffQueued.add(p.path); return; }
  const full = diffShown();
  if (!full && !git[p.path]?.dirty) { // clean, or not a repo
    if (statBy.delete(p.path)) renderDiffBtn();
    return;
  }
  diffBusy.add(p.path);
  try {
    if (full) {
      const r = await api.gitDiff(p.path, diffBy.get(p.path)?.id || null);
      if (!r.same && docsOf(p)?.diff) {
        diffBy.set(p.path, r);
        if (r.ok) statBy.set(p.path, { files: r.files.length + r.more, added: r.added, removed: r.removed });
        else statBy.delete(p.path);
      }
      renderDiff();
    } else {
      const s = await api.diffStat(p.path);
      if (s.ok) statBy.set(p.path, { files: s.files, added: s.added, removed: s.removed });
      else statBy.delete(p.path);
    }
    renderDiffBtn();
  } catch { /* the next poll tries again */ } finally {
    diffBusy.delete(p.path);
    if (diffQueued.delete(p.path) && docProject()?.path === p.path) pollDiff();
  }
}

let lastDiffKey = '';
function renderDiff(force = false) {
  const host = $('#rside-diff');
  const p = docProject();
  if (!p || host.hidden) return;
  const r = diffBy.get(p.path);
  const key = JSON.stringify([p.path, r ? r.id || r.error || !!r.noRepo : null, git[p.path]?.branch, git[p.path]?.detached]);
  if (!force && key === lastDiffKey) return;
  lastDiffKey = key;
  const same = diffOn === p.path && !!diffBody();
  if (!same) { keepDiffScroll(); diffEls.clear(); }
  diffOn = p.path;
  const body = same ? diffBody() : h('div', { class: 'diff-body' });
  const anchor = same ? diffAnchor(body) : null;
  const files = r?.ok ? r.files : [];
  if (files.length) {
    const els = files.map((f) => diffEls.get(f.id) || diffFile(p, r.root, f));
    diffEls.clear();
    files.forEach((f, i) => diffEls.set(f.id, els[i]));
    if (r.more) els.push(h('div', { class: 'diff-msg' }, `${r.more} more new file${r.more === 1 ? '' : 's'} not shown.`));
    // Only the files that changed are swapped: moving or re-adding an unchanged one would drop a selection in it.
    const keep = new Set(els);
    for (const el of [...body.children]) if (!keep.has(el)) el.remove();
    let at = body.firstChild;
    for (const el of els) if (el === at) at = at.nextSibling; else body.insertBefore(el, at);
  } else {
    diffEls.clear();
    const branch = diffBranch(p);
    body.replaceChildren(!r ? h('div', { class: 'rnote' }, 'Loading…')
      : r.noRepo ? diffEmpty('branch', 'Not a git repository', 'This tab shows the uncommitted changes of a git repository.')
      : !r.ok ? diffEmpty('branch', 'Could not read the changes', r.error || '')
      : diffEmpty('check', 'No uncommitted changes', `Everything is committed${branch ? ` on ${branch}` : ''}.`));
  }
  if (same) host.firstChild.replaceWith(diffHead(p, r));
  else host.replaceChildren(diffHead(p, r), body);
  if (!same) body.scrollTop = diffScroll.get(p.path) || 0;
  else if (anchor) toAnchor(body, anchor);
}

/** The file at the top of the page's view and how far down it is scrolled, to keep there when files above it change. */
function diffAnchor(body) {
  const top = body.scrollTop;
  if (!top) return null; // at the top it stays at the top, so a new first file shows
  for (const el of body.children) if (el.dataset.path && el.offsetTop + el.offsetHeight > top) return { path: el.dataset.path, off: top - el.offsetTop };
  return null;
}

/** Back to the anchor's file; to its header when the old offset no longer fits in it (folded, or it shrank). */
function toAnchor(body, a) {
  const el = [...body.children].find((x) => x.dataset.path === a.path);
  if (el) body.scrollTop = el.offsetTop + (a.off < el.offsetHeight ? a.off : 0);
}

/** The branch as the status bar shows it (`@abc1234` when detached). */
function diffBranch(p) {
  const info = git[p.path];
  return info?.branch ? `${info.detached ? '@' : ''}${info.branch}` : '';
}

function diffEmpty(icon, title, line) {
  return h('div', { class: 'diff-empty' }, ico(icon), h('div', { class: 'diff-empty-title' }, title), h('div', {}, line));
}

function diffHead(p, r) {
  const files = r?.ok ? r.files : [];
  const branch = diffBranch(p);
  const foldable = files.filter((f) => !diffNote(f));
  const anyOpen = anyUnfolded(p, foldable);
  return h('div', { class: 'doc-head' },
    h('div', { class: 'doc-titles' },
      h('div', { class: 'doc-title' }, 'Changes'),
      h('div', { class: 'doc-path diff-sum' },
        branch ? `${branch} · ` : '',
        files.length ? [`${files.length} file${files.length === 1 ? '' : 's'} `, h('span', { class: 'd-add' }, `+${r.added}`), ' ', h('span', { class: 'd-del' }, `−${r.removed}`)]
          : 'Uncommitted changes')),
    foldable.length > 1 ? h('button', { class: 'btn ghost icon sm diff-foldall', title: anyOpen ? 'Collapse all' : 'Expand all', onclick: () => foldAll(p, foldable, anyUnfolded(p, foldable)) }, ico(anyOpen ? 'foldAll' : 'unfoldAll')) : null,
    h('button', { class: 'btn ghost icon sm', title: 'Close', onclick: () => closeDiff(p) }, ico('x')));
}

/**
 * As the file was last shown, else by default: lockfiles and big changes start folded. A file keeps its state from then
 * on (diffFile records it), so one being read never folds itself when Claude's edits take it past DIFF_FOLD_AT.
 */
function diffFolded(p, f) {
  const set = diffFolds.get(p.path);
  if (set?.has(f.path)) return set.get(f.path);
  return LOCK_RE.test(f.path) || f.added + f.removed > DIFF_FOLD_AT;
}

const anyUnfolded = (p, files) => files.some((f) => !diffFolded(p, f));

function setFold(p, f, folded) {
  if (!diffFolds.has(p.path)) diffFolds.set(p.path, new Map());
  diffFolds.get(p.path).set(f.path, folded);
}

function foldAll(p, files, fold) {
  for (const f of files) setFold(p, f, fold);
  diffEls.clear(); // every file is rebuilt with its new state; the one at the top of the view stays there
  renderDiff(true);
}

/** The head's Collapse all / Expand all, after a file was folded by hand. */
function syncFoldAll(p) {
  const btn = $('#rside-diff .diff-foldall');
  if (!btn) return;
  const anyOpen = anyUnfolded(p, (diffBy.get(p.path)?.files || []).filter((f) => !diffNote(f)));
  btn.title = anyOpen ? 'Collapse all' : 'Expand all';
  btn.replaceChildren(ico(anyOpen ? 'foldAll' : 'unfoldAll'));
}

const diffAbs = (root, rel) => `${root}${IS_MAC ? '/' : '\\'}${IS_MAC ? rel : rel.replace(/\//g, '\\')}`;
/** The first new-side line a file's diff changes, to open it there. */
function firstChange(f) {
  const hk = f.hunks[0];
  if (!hk) return null;
  let n = hk.n;
  for (const l of hk.lines) { if (l[0] === '+' || l[0] === '-') return Math.max(1, n); if (l[0] === ' ') n++; }
  return Math.max(1, hk.n);
}

/** Why a file has no lines to show, said in its header instead ("binary", "5.4 MB", a mode change...), else null. */
function diffNote(f) {
  if (f.binary) return 'binary';
  if (f.dir) return 'nested repository';
  if (f.big) return `${f.big < 1024 * 1024 ? `${Math.ceil(f.big / 1024)} KB` : `${(f.big / 1024 / 1024).toFixed(1)} MB`}, not shown`;
  if (f.skip) return 'could not read it';
  if (f.hunks.length) return null;
  return f.mode ? `mode ${f.mode}` : f.status === 'R' ? 'renamed' : 'empty';
}

/**
 * One file (`root` = its repo): a sticky header (click folds it) over its lines, built when first unfolded. A file
 * without lines is just the header.
 */
function diffFile(p, root, f) {
  const st = f.untracked ? 'U' : f.status;
  const name = f.path.split('/').pop();
  const dir = f.path.slice(0, f.path.length - name.length);
  const note = diffNote(f);
  // Nothing to open for a deleted file or a folder, and a binary one is never started from here (a changed .exe would run).
  const openBtn = !p.remoteId && f.status !== 'D' && !f.binary && !f.dir
    ? h('button', { class: 'btn ghost icon sm', title: 'Open in VS Code', onclick: (e) => { e.stopPropagation(); api.openFile(diffAbs(root, f.path), firstChange(f)); } }, ico('code'))
    : h('span', { class: 'diff-gap' }); // the notes and counts stay aligned
  const nameEl = h('span', { class: 'diff-name' },
    f.old ? [h('span', { class: 'diff-dir' }, f.old), h('span', { class: 'diff-arrow' }, '→')] : null,
    dir ? h('span', { class: 'diff-dir' }, dir) : null,
    h('span', { class: 'diff-base' }, name));
  const title = `${f.old ? `${f.old} → ` : ''}${f.path}\n${DIFF_STATUS[st]}`;
  if (note) {
    return h('section', { class: 'diff-file', 'data-path': f.path }, h('div', { class: 'diff-fh still', title },
      h('span', { class: 'ico' }), h('span', { class: `diff-st st-${st}` }, st), nameEl, h('span', { class: 'diff-note' }, note), openBtn));
  }
  let folded = diffFolded(p, f);
  setFold(p, f, folded);
  let lines = null;
  const sec = h('section', { class: `diff-file${folded ? ' folded' : ''}`, 'data-path': f.path });
  const toggle = () => {
    const body = diffBody();
    const stuck = body && sec.offsetTop < body.scrollTop; // folded from its header stuck at the top: that header stays there
    folded = !folded;
    setFold(p, f, folded);
    if (!folded && !lines) sec.append((lines = diffLines(root, f)));
    sec.classList.toggle('folded', folded);
    head.setAttribute('aria-expanded', String(!folded));
    if (stuck) body.scrollTop = sec.offsetTop;
    syncFoldAll(p);
  };
  const head = h('div', {
    class: 'diff-fh', role: 'button', tabindex: '0', 'aria-expanded': String(!folded), title,
    onclick: toggle, onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } },
  },
  ico('chevron'),
  h('span', { class: `diff-st st-${st}` }, st),
  nameEl,
  h('span', { class: 'diff-n' }, f.added ? h('span', { class: 'd-add' }, `+${f.added}`) : null, f.removed ? h('span', { class: 'd-del' }, `−${f.removed}`) : null),
  openBtn);
  sec.append(head);
  if (!folded) sec.append((lines = diffLines(root, f)));
  return sec;
}

/** A file's hunks: line numbers (old, new; a click on one opens the file there), the code, the changed part of a replaced line marked. */
function diffLines(root, f) {
  const box = h('div', { class: 'diff-lines' });
  const count = (hk, c) => hk.lines.filter((l) => l[0] === ' ' || l[0] === c).length;
  const last = Math.max(...f.hunks.map((hk) => Math.max(hk.o + count(hk, '-'), hk.n + count(hk, '+'))));
  box.style.setProperty('--lnw', `calc(${String(last).length}ch + 14px)`);
  const open = f.status !== 'D';
  const rows = [];
  for (const hk of f.hunks) {
    if (f.status === 'M' || f.status === 'R') {
      rows.push(h('div', { class: 'dh' }, `@@ -${hk.o},${count(hk, '-')} +${hk.n},${count(hk, '+')} @@`, hk.head ? h('span', { class: 'dh-ctx' }, hk.head) : null));
    }
    const marks = new Map(); // line index -> the [from, to) ranges of its changed parts
    for (const [i, j] of linePairs(hk.lines)) {
      const a = hk.lines[i].slice(1);
      const b = hk.lines[j].slice(1);
      const ch = a.length + b.length < 4000 && inlineMarks(a, b);
      if (!ch) continue;
      if (ch.a.length) marks.set(i, ch.a);
      if (ch.b.length) marks.set(j, ch.b);
    }
    let o = hk.o;
    let n = hk.n;
    hk.lines.forEach((l, i) => {
      const c = l[0];
      if (c === '\\') { rows.push(h('div', { class: 'dnote' }, l.slice(2))); return; }
      const text = l.slice(1);
      const code = [];
      let from = 0;
      for (const [s, e] of marks.get(i) || []) { code.push(text.slice(from, s), h('mark', {}, text.slice(s, e))); from = e; }
      code.push(text.slice(from));
      const cls = c === '+' ? 'add' : c === '-' ? 'del' : 'ctx';
      const at = Math.max(1, n); // where a click opens the file: the new side
      rows.push(h('div', { class: `dl ${cls}`, 'data-n': open ? String(at) : null },
        h('span', { class: 'ln' }, c === '+' ? '' : String(o)),
        h('span', { class: 'ln' }, c === '-' ? '' : String(n)),
        h('span', { class: 'dc' }, code)));
      if (c !== '+') o++;
      if (c !== '-') n++;
    });
  }
  if (f.cut) rows.push(h('div', { class: 'diff-msg' }, `${f.cut} more line${f.cut === 1 ? '' : 's'} not shown. Open the file to see the rest.`));
  box.append(...rows);
  box.addEventListener('click', (e) => {
    const row = e.target.closest('.ln') && e.target.closest('.dl[data-n]');
    if (row && !docProject()?.remoteId) api.openFile(diffAbs(root, f.path), +row.dataset.n);
  });
  return box;
}

function renderAll() {
  renderSidebar(true);
  renderWelcome();
  renderStatus();
  renderRside();
  renderFoot();
  renderInfo();
}

// --------------------------------------------------------------- actions ----

async function addProjects() {
  showProjectPicker();
}

function projectDevicePicker(selected) {
  const trigger = h('button', { id: 'project-device', class: 'btn outline remote-device-trigger', type: 'button',
    'aria-label': 'Device', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'project-device-menu',
    popovertarget: 'project-device-menu', popovertargetaction: 'toggle' });
  const menu = h('div', { id: 'project-device-menu', class: 'remote-device-menu', popover: 'auto', role: 'menu', 'aria-label': 'Device' });
  trigger.value = selected;
  const choices = [{ id: '', name: 'This computer', icon: 'folder' }, ...remotes.filter((d) => d.enabled !== false).map((d) => ({ ...d, icon: 'server' }))];
  function render() {
    const chosen = choices.find((d) => d.id === trigger.value) || choices[0];
    trigger.replaceChildren(ico(chosen.icon), h('span', { class: 'remote-device-name' }, chosen.name), h('span', { class: 'remote-device-chevron' }, ico('chevron')));
    menu.replaceChildren(...choices.map((d) => h('button', {
      class: 'menu-item', type: 'button', role: 'menuitemradio', 'aria-checked': String(d.id === trigger.value), tabindex: '-1',
      onclick: () => { menu.hidePopover(); trigger.value = d.id; render(); trigger.focus(); trigger.dispatchEvent(new Event('change')); },
    }, ico(d.icon), h('span', { class: 'remote-device-name' }, d.name), d.id === trigger.value ? ico('check') : h('span', { class: 'ico' }))),
    h('div', { class: 'menu-sep', role: 'separator' }), h('button', { class: 'menu-item', type: 'button', role: 'menuitem', tabindex: '-1',
      onclick: () => { menu.hidePopover(); trigger.value = ':add'; trigger.dispatchEvent(new Event('change')); } }, ico('plus'), 'Add remote…'));
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    menu.style.width = `${Math.min(rect.width, innerWidth - 16)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  }
  function focusMenu() {
    const rect = trigger.getBoundingClientRect();
    if (menu.getBoundingClientRect().bottom > innerHeight - 8) menu.style.top = `${Math.max(8, rect.top - menu.offsetHeight - 4)}px`;
    menu.querySelector('[aria-checked="true"]').focus();
  }
  // Let the native invoker toggle: auto-popover light dismissal runs before click handlers.
  trigger.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu.showPopover(); focusMenu(); } };
  menu.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') position(); });
  menu.addEventListener('toggle', () => {
    const open = menu.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open) focusMenu();
  });
  menu.onkeydown = (e) => {
    if (e.key === 'Tab') { menu.hidePopover(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = [...menu.querySelectorAll('button')];
    const at = items.indexOf(document.activeElement);
    items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };
  render();
  return { trigger, menu };
}

function showProjectPicker(selected = '') {
  const { trigger: device, menu: deviceMenu } = projectDevicePicker(selected);
  const content = h('div', { class: 'remote-folders' });
  const note = h('div', { class: 'rnote', role: 'status' });
  const name = h('input', { id: 'project-name', placeholder: 'Project name (optional)', 'aria-label': 'Project name' });
  const folder = h('input', { id: 'remote-folder', placeholder: '/home/…', 'aria-label': 'Remote folder', spellcheck: 'false' });
  const add = h('button', { class: 'btn primary', disabled: true }, 'Add project');
  const body = h('div', { class: 'ag-body remote-form' }, h('label', { for: 'project-device' }, 'Source folders'), device, deviceMenu, content, note);
  const dlg = openModal('Add project', null, body);
  let generation = 0;
  let currentFolder = null;
  let creatingFolder = false;
  let go;
  const createName = h('input', { id: 'remote-new-folder', placeholder: 'Folder name', 'aria-label': 'New folder name', autocomplete: 'off' });
  const createButton = h('button', { class: 'btn outline sm', type: 'submit' }, 'Create');
  const createCancel = h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { createRow.hidden = true; newFolder.focus(); } }, 'Cancel');
  const createRow = h('form', { class: 'remote-create-row', hidden: true }, createName, createButton,
    createCancel);
  const newFolder = h('button', { class: 'btn ghost sm', id: 'remote-new-folder-button', disabled: true, type: 'button', onclick: () => {
    createRow.hidden = false; createName.value = ''; createName.focus();
  } }, ico('folderPlus'), 'New folder');
  createRow.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentFolder || creatingFolder) return;
    const id = device.value; const parent = currentFolder; const g = generation;
    const childName = createName.value.trim();
    setCreating(true); note.textContent = 'Creating folder…';
    let result;
    try { result = await api.remoteMkdir(id, parent, childName); }
    catch (err) { result = { ok: false, error: err.message }; }
    finally { setCreating(false); }
    if (!dlg.isOpen() || device.value !== id || generation !== g) return;
    if (!result.ok) { note.textContent = result.error; createName.focus(); return; }
    createRow.hidden = true;
    await browse(result.path); folder.focus();
  };
  function setCreating(busy) {
    creatingFolder = busy;
    for (const control of [createName, createButton, createCancel, folder, device, go]) if (control) control.disabled = busy;
    add.disabled = newFolder.disabled = busy || !currentFolder;
    for (const entry of body.querySelectorAll('.remote-entry')) entry.disabled = busy;
  }
  async function browse(folderPath) {
    const g = ++generation; const id = device.value;
    currentFolder = null; newFolder.disabled = true; createRow.hidden = true;
    add.disabled = true; note.textContent = 'Connecting…';
    const result = await api.remoteDirs(id, folderPath);
    if (!dlg.isOpen() || generation !== g || device.value !== id) return;
    if (!result.ok) { note.textContent = result.error; return; }
    currentFolder = result.path; folder.value = result.path; add.disabled = false; newFolder.disabled = false; note.textContent = '';
    const entries = body.querySelector('.remote-entries');
    entries.replaceChildren(
      h('button', { class: 'remote-entry', onclick: () => browse(result.parent) }, ico('arrowUp'), '..'),
      ...result.entries.map((n) => h('button', { class: 'remote-entry', onclick: () => browse(`${result.path.replace(/\/$/, '')}/${n}`) }, ico('folder'), n)));
  }
  function changed() {
    generation++;
    if (device.value === ':add') { closeModal?.(); showRemoteSetup(); return; }
    note.textContent = '';
    if (!device.value) {
      content.replaceChildren(h('button', { class: 'btn outline', onclick: () => { closeModal?.(); addLocalProjects(); } }, ico('folder'), 'Choose a folder on this computer…'));
      return;
    }
    const d = remotes.find((d) => d.id === device.value);
    go = h('button', { class: 'btn outline sm', title: 'Open the folder typed in this field (Enter)', onclick: () => browse(folder.value) }, 'Go');
    folder.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); browse(folder.value); } };
    folder.oninput = () => { generation++; add.disabled = true; newFolder.disabled = true; currentFolder = null; };
    add.onclick = async () => {
      add.disabled = true;
      const result = await api.addRemoteProject(device.value, folder.value, name.value.trim());
      if (!dlg.isOpen()) return;
      if (!result.ok) { note.textContent = result.error; add.disabled = false; return; }
      projects = result.projects; closeModal?.();
      touchProject(result.added[0]);
      expanded.add(result.added[0]); saveExpanded(); renderAll(); pollGit(); pollSessions();
    };
    content.replaceChildren(name, h('div', { class: 'remote-path-row' }, folder, go),
      h('div', { class: 'remote-browser' }, h('div', { class: 'remote-folder-toolbar' }, newFolder), createRow,
        h('div', { class: 'remote-entries', 'aria-label': 'Folders' })),
      h('div', { class: 'remote-actions' }, add));
    browse(d.home);
  }
  device.onchange = changed;
  changed(); device.focus();
}

function showRemoteSetup(fromSettings = false) {
  const target = h('input', { id: 'remote-target', placeholder: 'user@hostname', 'aria-label': 'SSH target', autocomplete: 'off', spellcheck: 'false' });
  const name = h('input', { id: 'remote-name', placeholder: 'My server', 'aria-label': 'Display name' });
  const port = h('input', { id: 'remote-port', type: 'number', min: '1', max: '65535', placeholder: 'From SSH config (usually 22)', 'aria-label': 'SSH port' });
  const note = h('div', { class: 'rnote', role: 'status' }, 'Uses your existing SSH keys and config. Requires Node.js 20+ and tmux on Ubuntu. Setup installs a small Stanza helper under ~/.local/share/stanza/remote.');
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Connect');
  const form = h('form', { class: 'ag-body remote-form' },
    h('label', { for: 'remote-target' }, 'SSH target'), target,
    h('label', { for: 'remote-name' }, 'Display name'), name,
    h('label', { for: 'remote-port' }, 'Port (optional)'), port, note,
    h('div', { class: 'remote-actions' }, h('button', { class: 'btn outline', type: 'button', onclick: () => fromSettings ? closeModal?.() : showProjectPicker() }, fromSettings ? 'Cancel' : 'Back'), submit));
  const dlg = openModal(fromSettings ? 'Add connection' : 'Add remote', null, form);
  form.onsubmit = async (e) => {
    e.preventDefault(); submit.disabled = true; note.textContent = 'Connecting…';
    let result;
    try { result = await api.addRemote({ target: target.value.trim(), name: name.value.trim(), port: port.value ? Number(port.value) : undefined }); }
    catch (e) { result = { ok: false, error: e.message }; }
    if (result.remotes) { remotes = result.remotes; renderSettings(); }
    if (!dlg.isOpen()) return;
    submit.disabled = false;
    if (!result.ok) { note.textContent = `${result.error}\nCheck that ssh ${target.value.trim()} works in your terminal first. New host keys or locked keys must be handled there.`; return; }
    if (fromSettings) { closeModal?.(); renderSettings(); $('#settings [data-fk="connection-add"]')?.focus(); }
    else showProjectPicker(result.device.id);
  };
  target.focus();
}

async function addLocalProjects() {
  const { projects: list, added } = await api.addProjects();
  projects = list;
  for (const p of added.slice().reverse()) touchProject(p); // a multi-selection keeps the picker's order
  renderAll();
  pollGit();
  if (added.length === 1) {
    const p = projects.find((x) => x.path === added[0]);
    if (p) focusProject(p);
  }
}

async function removeProject(p) {
  const ok = await confirmDialog({
    title: 'Remove project?',
    message: `"${projName(p)}" will be removed from this list. The folder itself is not touched, and open tabs stay open.`,
    okLabel: 'Remove',
    danger: true,
  });
  if (!ok) return;
  projects = await api.removeProject(p.path);
  if (expanded.delete(p.path)) saveExpanded();
  renderAll();
}

function setFontSize(size) {
  ui.fontSize = Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, size));
  for (const t of tabs.values()) t.term.options.fontSize = ui.fontSize;
  api.setUi({ fontSize: ui.fontSize });
  requestAnimationFrame(fitActive);
  renderSettings();
}

/** Whole-window zoom: main calls setZoomFactor (and resizes the title bar buttons); terminals refit via their ResizeObservers. */
function setZoom(z) {
  ui.zoom = z;
  document.documentElement.style.setProperty('--zoom', z);
  api.setUi({ zoom: z });
  renderSettings();
}
function stepZoom(d) {
  const cur = ui.zoom || 1;
  const next = d > 0 ? ZOOM_STEPS.find((s) => s > cur + 0.001) : ZOOM_STEPS.findLast((s) => s < cur - 0.001);
  if (next) setZoom(next);
}

// Sidebar widths: the CSS vars hold the live value, ui.sidebarW / ui.rsideW the saved one.
const PANEL_W = {
  sidebarW: { min: 180, max: 480, def: 232, cssVar: '--sidebar-w' },
  rsideW: { min: 240, max: 600, def: 300, cssVar: '--rside-w' },
};
const clampW = (key, w) => Math.min(PANEL_W[key].max, Math.max(PANEL_W[key].min, Math.round(w) || PANEL_W[key].def));
function applyPanelW(key, w) {
  ui[key] = clampW(key, w);
  document.documentElement.style.setProperty(PANEL_W[key].cssVar, ui[key] + 'px');
}

/** Drag handle on a divider. `widthAt(clientX)` gives the panel width for a pointer position; the terminal refits via its ResizeObserver. */
function wireResizer(el, key, widthAt) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    document.body.classList.add('resizing');
  });
  // The right sidebar showing a file tab has its own width, a share of the window (ui.rsideDocPct).
  const doc = () => key === 'rsideW' && document.body.classList.contains('rside-doc');
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    if (doc()) setDocPct((widthAt(e.clientX) / window.innerWidth) * 100);
    else applyPanelW(key, widthAt(e.clientX));
  });
  const save = () => api.setUi(doc() ? { rsideDocPct: ui.rsideDocPct } : { [key]: ui[key] });
  const end = (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    el.classList.remove('drag');
    document.body.classList.remove('resizing');
    save();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => {
    if (doc()) setDocPct(DOC_PCT.def);
    else applyPanelW(key, PANEL_W[key].def);
    save();
  });
}

function setDocPct(pct) {
  ui.rsideDocPct = Math.round(Math.min(DOC_PCT.max, Math.max(DOC_PCT.min, pct)) * 10) / 10;
  applyDocW();
}

/** Shown in the layout: pinned (ui.sidebar), or on the home screen, which always shows it (a collapsed sidebar only applies with a tab open). */
let restoring = false; // saved tabs are being reopened at launch: not the home screen, so the sidebar doesn't flash in
const sidebarShown = () => ui.sidebar || (!activeId && !restoring);

/** Home screen (no active tab; others may still run in the background) <-> tabs: `no-tabs`, and the sidebar comes back
 * into the layout (or leaves it) when that changes. */
function syncHome() {
  document.body.classList.toggle('no-tabs', !activeId);
  if (!activeId) pollStats();
  if (document.body.classList.contains('sidebar-collapsed') === sidebarShown()) placeBrand();
}

/** Toggle + logo live in the sidebar's top row; while it is collapsed they move to the start of the top bar. */
function placeBrand() {
  const shown = sidebarShown();
  if (shown) leftPeek.set(false);
  if (document.body.classList.contains('sidebar-collapsed') === shown) { // only peeking slides: a layout change snaps
    leftPeek.stop();
    document.body.classList.toggle('sidebar-collapsed', !shown);
  }
  if (shown) $('#sidebar').prepend($('#brand'));
  else $('#topbar').prepend($('#brand'));
  // New session "+": in the search row, or after the brand in the top bar while the sidebar is collapsed
  const nt = $('#new-tab');
  nt.classList.toggle('sm', shown);
  if (shown) $('.search-row').append(nt);
  else $('#brand').after(nt);
  placeUpdatePop(); // the footer (its anchor) hides while collapsed
  applyDocW(); // the room a file tab may take depends on the left sidebar
}

/* Peek (Zen browser's compact mode): a sidebar that isn't in the layout floats in over the terminal when the pointer
   reaches the window's edge on its side; it slides away 80 ms after the pointer leaves it, but not while something it
   opened is still open or one of its fields has focus. A pointer that leaves the window through that edge (aiming at the
   sidebar of a window that isn't maximized) also brings it out and keeps it out: the page can't see the cursor out there,
   so main watches it (peek:hold) and says when it has gone well past the edge or above / below the window (peek:away).
   The top bar keeps a sidebar that is out out too: its buttons by the pointer position, its drag region (no pointer events,
   like outside the window) through main's watch.
   The left sidebar peeks while collapsed with a tab open, the right one whenever it is closed (by hand, by autoRside in a
   cramped split, or on the home screen). */
let pointer = null; // last pointer position in the window, null once it has left it
const topBarH = () => $('#topbar').getBoundingClientRect().bottom;

/* A peek slides on a spring instead of a CSS transition: a reversed transition flips direction in one frame (a peek
   cancelled while still coming in snapped back), a spring keeps its speed, so it slows down, stops and drifts back
   (Zen's bounce). x = translateX in px (0 = out), v = px/s. Frames run only while it moves. Mass 1; c = 2 * sqrt(k) is
   critically damped (no overshoot, which would pull it off the window's edge), a bit less settles faster. */
const PEEK_SPRING = { k: 600, c: 46 };

/**
 * One sidebar's peek. `el` / `zone` = selectors of the sidebar and its edge zone, `cls` = the body class while it is out,
 * `inLayout()` = it is part of the layout (then it never peeks), `keep()` = something of it is in use, `onOut()` runs as it
 * comes out. `holding` = the pointer is just outside its edge and main is watching it. `sticky` = brought out by an
 * action, not the pointer (a file opened from the terminal): it stays until the pointer has been in it and left, or a click
 * or Esc outside it (wirePeek).
 */
function makePeek({ side, el, zone, cls, inLayout, keep, onOut }) {
  const dir = side === 'right' ? 1 : -1; // the way it slides away
  const spring = { x: null, v: 0, out: false, raf: 0, t: 0 };
  const pk = { side, el, zone, inLayout, holding: false, sticky: false, timer: 0 };
  const peeking = () => document.body.classList.contains(cls);
  const away = () => dir * ($(el).offsetWidth + 48); // matches the CSS rest transform: the shadow is off screen too
  function set(on) {
    clearTimeout(pk.timer);
    if (!on) pk.sticky = false;
    if (!on && pk.holding) { pk.holding = false; api.peekRelease(side); }
    on = on && !inLayout();
    if (on === peeking()) return;
    document.body.classList.toggle(cls, on);
    if (on) onOut?.();
    slide(on);
  }
  function slide(out) {
    const sb = $(el);
    spring.out = out;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stop();
      if (out) { sb.style.transform = 'none'; sb.style.visibility = 'visible'; }
      return;
    }
    if (spring.x === null) spring.x = away(); // from rest, away
    sb.style.visibility = 'visible';
    if (!spring.raf) { spring.t = 0; spring.raf = requestAnimationFrame(step); }
  }
  function step(now) {
    const sb = $(el);
    const goal = spring.out ? 0 : away();
    const { k, c } = PEEK_SPRING;
    let dt = spring.t ? Math.min(Math.max(now - spring.t, 0), 34) / 1000 : 1 / 60; // a stalled frame doesn't jump
    spring.t = now;
    while (dt > 0) { // 4 ms steps keep the integration stable at any frame rate
      const h = Math.min(dt, 0.004);
      spring.v += (-k * (spring.x - goal) - c * spring.v) * h;
      const x = spring.x + spring.v * h;
      spring.x = dir < 0 ? Math.min(x, 0) : Math.max(x, 0); // never past the window's edge
      dt -= h;
    }
    if (Math.abs(spring.x - goal) < 0.5 && Math.abs(spring.v) < 20) { // settled
      spring.raf = 0;
      if (spring.out) { spring.x = 0; spring.v = 0; sb.style.transform = 'none'; }
      else stop(); // back to the CSS rest state (hidden)
      return;
    }
    sb.style.transform = `translateX(${spring.x}px)`;
    spring.raf = requestAnimationFrame(step);
  }
  /** Stop at once and hand the sidebar back to the stylesheet (away, or in the layout once pinned). */
  function stop() {
    cancelAnimationFrame(spring.raf);
    Object.assign(spring, { x: null, v: 0, raf: 0 });
    const sb = $(el);
    sb.style.transform = '';
    sb.style.visibility = '';
  }
  function later(ms = 80) {
    clearTimeout(pk.timer);
    pk.timer = setTimeout(() => {
      if (!peeking()) return;
      // the position, not :hover: a pointer resting where the sidebar slid in under it isn't :hover until it moves
      const r = $(el).getBoundingClientRect();
      const over = pointer && (dir < 0 ? pointer.x < r.right : pointer.x >= r.left) && pointer.y >= r.top && pointer.y < r.bottom;
      const inBar = pointer && pointer.y < topBarH();
      if (pk.holding || pk.sticky || over || inBar || keep()) later(120);
      else set(false);
    }, ms);
  }
  /** Its edge zone's distance from the window's top and bottom in CSS px, and whether it is out, for main's peek:hold. */
  function insets() {
    const r = $(zone).getBoundingClientRect();
    return [r.top, window.innerHeight - r.bottom, peeking()];
  }
  return Object.assign(pk, { peeking, set, stop, later, insets });
}

const leftPeek = makePeek({
  side: 'left', el: '#sidebar', zone: '#peek-zone', cls: 'sidebar-peek', inLayout: () => sidebarShown(),
  keep: () => !$('#menu').hidden || !$('#detail').hidden || document.activeElement === $('#session-search'),
});
const rightPeek = makePeek({
  side: 'right', el: '#rside', zone: '#rpeek-zone', cls: 'rside-peek', inLayout: () => rsideShown(),
  // a menu, an agent or image dialog opened from it, or the markdown editor in use
  keep: () => !$('#menu').hidden || !$('#modal').hidden || (document.activeElement?.matches('textarea, input') && $('#rside').contains(document.activeElement)),
  onOut: () => { renderRside(); pollPorts(); pollMcp(); pollDefinedAgents(); pollInfo(); pollDiff(); }, // closed, nothing was polled
});
const peeks = [leftPeek, rightPeek];

function wirePeek() {
  document.addEventListener('mousemove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    for (const pk of peeks) if (pk.holding) { pk.holding = false; api.peekRelease(pk.side); } // back in the page: its own events take over
  }, { passive: true });
  // also fires when the pointer moves onto the top bar's drag region
  document.documentElement.addEventListener('mouseleave', async () => {
    pointer = null;
    const free = peeks.filter((pk) => !pk.inLayout());
    if (!free.length) return;
    const held = await api.peekHold({ ...Object.fromEntries(free.map((pk) => [pk.side, pk.insets()])), bar: topBarH() });
    for (const pk of free) {
      if (!held.includes(pk.side)) { if (pk.peeking()) pk.later(); continue; }
      if (pointer || pk.inLayout()) { api.peekRelease(pk.side); continue; } // came back (or pinned it) while main was asked
      pk.holding = true;
      pk.set(true);
      pk.later();
    }
  });
  const of = (side) => (side === 'right' ? rightPeek : leftPeek);
  api.onPeekAway((side) => { const pk = of(side); pk.holding = false; pk.set(false); });
  api.onPeekInside((side) => { const pk = of(side); pk.holding = false; if (pk.peeking()) pk.later(); }); // back in the page below the top bar
  for (const pk of peeks) {
    $(pk.zone).addEventListener('mouseenter', () => { pk.set(true); pk.later(); });
    $(pk.el).addEventListener('mouseenter', () => { pk.sticky = false; }); // from now on it leaves with the pointer
    $(pk.el).addEventListener('mouseleave', () => { if (pk.peeking()) pk.later(); });
  }
  // a sticky peek goes on a click anywhere else (capture: the terminal keeps its mousedowns to itself); Esc is in the keydown handler
  document.addEventListener('mousedown', (e) => {
    for (const pk of peeks) if (pk.sticky && !e.target.closest(`${pk.el}, #menu, #modal`)) pk.set(false);
  }, true);
}

function setSidebar(open) {
  leftPeek.set(false);
  ui.sidebar = open;
  if (!open && detailKind) setDetail(null);
  if (!open) closeMenu();
  placeBrand();
  api.setUi({ sidebar: open });
  requestAnimationFrame(fitActive);
}

const rsideShown = () => document.body.classList.contains('rside-open'); // in the layout
const rsideOnScreen = () => rsideShown() || rightPeek.peeking(); // in the layout or peeking: worth polling and animating

/** Show or hide the right sidebar without touching the saved choice (autoRside uses this directly). */
function applyRside(open) {
  const el = $('#rside');
  const peeked = rightPeek.peeking();
  if (open && !rsideShown()) { rightPeek.set(false); rightPeek.stop(); } // pinning a peek snaps, only peeking slides
  if (open && !rsideShown() && document.body.classList.contains('rside-doc') && !docBoot && !peeked) {
    // opening onto a file tab slides it out from the edge (a plain open is instant, as it always was)
    slideRside(() => { document.body.classList.add('rside-open'); el.style.width = '0px'; void el.offsetWidth; el.style.width = ''; });
  } else document.body.classList.toggle('rside-open', open);
  $('#toggle-rside').classList.toggle('on', open);
  if (open) { renderRside(); pollPorts(); pollMcp(); pollDefinedAgents(); pollInfo(); pollDiff(); }
  renderDiffBtn();
  requestAnimationFrame(fitActive);
}

function setServers(open) { // the user's choice for the right sidebar (ui.servers is its saved flag)
  ui.servers = open;
  rsideAuto = false;
  diffPinned = null; // a choice made by hand stays
  rsideForced = open && visibleIds().length > 1; // reopened by hand in a split: don't hide it again
  api.setUi({ servers: open });
  applyRside(open);
}

/** Window close: only interrupt the user if quitting would stop real work. */
let closeAsked = false;
async function onCloseRequest() {
  if (closeAsked) return;
  closeAsked = true;
  try {
    await flushDocEdit();
    const working = [...tabs.values()].filter((t) => !t.project.remoteId && isWorking(t));

    // Dev servers started from our tabs die with the app. Reuse the last scan unless it is stale.
    let scan = ports;
    if (Date.now() - portsAt > 10000) scan = await api.listPorts();
    const servers = scan.ok ? scan.servers.filter((s) => s.owner?.type === 'session') : [];

    if (!working.length && !servers.length) return api.quit();

    const items = [
      ...working.map((t) => ({ name: tabLabel(t), sub: 'Claude is working' })),
      ...servers.map((s) => {
        const t = tabs.get(s.owner.sessionId);
        return { name: `:${s.port}`, sub: `${s.name}${t ? ' · ' + tabLabel(t) : ''}` };
      }),
    ];
    const ok = await confirmDialog({
      title: 'Quit Stanza?',
      message: 'Quitting will stop:',
      items,
      okLabel: 'Quit and stop',
      cancelLabel: 'Keep open',
      danger: true,
    });
    if (ok) api.quit();
  } finally {
    closeAsked = false;
  }
}

/**
 * The one update button in the footer: download (accent-tinted) while the app's repo has new commits upstream,
 * else refresh = check now (the periodic poll runs every 30 min). A check that finds commits turns it into download.
 */
function updateBtn() {
  if (update?.available) {
    const n = update.behind || 0;
    return h('button', {
      class: `btn ghost icon sm update${updating ? ' busy' : ''}`,
      title: updating ? 'Updating…' : `Update available: ${n} new commit${n === 1 ? '' : 's'}`,
      disabled: updating, onclick: runUpdate,
    }, ico('download'));
  }
  return h('button', {
    class: `btn ghost icon sm${checking ? ' busy' : ''}`,
    title: checking ? 'Checking for updates…' : 'Check for updates',
    disabled: checking || updating, onclick: checkNow,
  }, ico('redo'));
}

function renderUpdate() {
  $('#update-slot')?.replaceChildren(updateBtn());
  renderUpdatePop();
}

/**
 * The icon alone is easy to miss, so a new update also opens a popover under it: what's new, Later / Update.
 * It stays until dismissed (no outside-click or Escape close: Escape belongs to Claude) and only comes back when
 * more commits arrive. Runtime only, so a restart reminds once more.
 */
let updateSeen = 0; // `behind` count the user has dismissed
let updateStep = 'info'; // 'info' | 'confirm': the popover's step (the confirm replaces the old centered dialog)
function renderUpdatePop() {
  const pop = $('#update-pop');
  if (checkNote) { // result of a manual check with nothing to install: a short note, closes itself
    pop.hidden = false;
    pop.replaceChildren(
      h('h4', {}, checkNote.error ? "Couldn't check for updates" : "You're up to date"),
      h('p', { class: 'up-sub' }, checkNote.text),
      h('div', { class: 'row' }, h('button', { class: 'btn outline sm', onclick: closeCheckNote }, 'OK')));
    placeUpdatePop();
    return;
  }
  const show = !!update?.available && (updating || update.behind > updateSeen);
  pop.hidden = !show;
  if (!show) return;
  const n = update.behind;
  const what = `${n} new commit${n === 1 ? '' : 's'}`;
  const how = update.packaged
    ? `The app closes and a separate ${IS_MAC ? 'process' : 'window'} rebuilds it (a minute or two), then reopens it.`
    : 'Pulls the update, runs npm install and restarts the app.';
  if (updating) { // progress: no buttons, the app restarts by itself
    pop.replaceChildren(
      h('h4', {}, 'Updating Stanza…'),
      h('p', { class: 'up-sub' }, update.packaged ? 'Closing now so the rebuild can run.' : 'Pulling changes, the app restarts when done.'),
      h('div', { class: 'up-busy' }, ico('redo'), h('span', {}, update.packaged ? 'A minute or two' : 'Hold on')));
    placeUpdatePop();
    return;
  }
  const back = () => { updateStep = 'info'; renderUpdatePop(); };
  const later = () => { updateSeen = n; updateStep = 'info'; renderUpdatePop(); activeTab()?.term.focus(); };
  const more = n - (update.subjects?.length || 0);
  const log = update.subjects?.length
    ? h('ul', { class: 'up-log' }, update.subjects.map((s) => h('li', { title: s }, s)), more > 0 ? h('li', { class: 'up-more' }, `and ${more} more`) : null)
    : null;
  if (updateStep === 'confirm') {
    const working = [...tabs.values()].filter(isWorking);
    const live = liveTabs().length;
    pop.replaceChildren(...[ // replaceChildren would print a null as "null"
      h('h4', {}, 'Update and restart?'),
      h('p', { class: 'up-sub' }, `${what}. ${how}`),
      log,
      live ? h('p', { class: 'up-warn' }, `${live} open session${live === 1 ? '' : 's'} end and reopen afterwards; dev servers started from them stop.`) : null,
      working.length
        ? h('ul', { class: 'up-items' }, working.map((t) => h('li', {}, h('span', { class: 'it-name' }, tabLabel(t)), h('span', { class: 'it-sub' }, 'Claude is working'))))
        : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn outline sm', onclick: back }, 'Back'),
        h('button', { class: `btn ${working.length ? 'destructive' : 'primary'} sm`, onclick: startUpdate }, 'Update and restart'))].filter(Boolean));
    placeUpdatePop();
    return;
  }
  pop.replaceChildren(...[
    h('h4', {}, 'Update available'),
    h('p', { class: 'up-sub' }, `${what} for Stanza.`),
    log,
    h('div', { class: 'row' },
      h('button', { class: 'btn outline sm', onclick: later }, 'Later'),
      h('button', { class: 'btn primary sm', onclick: runUpdate }, 'Update'))].filter(Boolean));
  placeUpdatePop();
}

/** Above the update button in the footer; the bottom-left corner while the sidebar is collapsed (footer hidden). */
function placeUpdatePop() {
  const pop = $('#update-pop');
  if (pop.hidden) return;
  const r = sidebarShown() ? $('#update-slot')?.getBoundingClientRect() : null; // collapsed: the footer is away (or only peeking)
  const left = r?.width ? r.left - 4 : 8;
  pop.style.left = `${Math.max(8, Math.min(left, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.bottom = `${r?.height ? window.innerHeight - r.top + 6 : 8}px`;
}

let checkNoteTimer = 0;

function closeCheckNote() {
  clearTimeout(checkNoteTimer);
  checkNote = null;
  renderUpdatePop();
  activeTab()?.term.focus();
}

async function checkNow() {
  if (checking || updating || updateBusy) return;
  checking = true;
  updateBusy = true; // keeps the periodic poll from overlapping
  clearTimeout(checkNoteTimer);
  checkNote = null;
  renderUpdate();
  try {
    const next = await api.checkUpdate();
    update = next;
    if (next?.available) { updateSeen = 0; updateStep = 'info'; } // reopen the "Update available" popover even if it was dismissed before
    else checkNote = next?.error ? { text: next.error, error: true } : { text: 'Stanza is on the latest version.' };
  } catch (e) {
    checkNote = { text: String(e?.message || e).slice(0, 160), error: true };
  } finally {
    checking = false;
    updateBusy = false;
  }
  renderUpdate();
  if (checkNote) checkNoteTimer = setTimeout(closeCheckNote, 5000);
}

/** Pull the app's own repo and restart (source runs), or close and let scripts/update.* rebuild a built copy. */
function runUpdate() { // opens the confirm step in the popover; startUpdate does the work
  if (!update?.available || updating) return;
  updateStep = 'confirm';
  updateSeen = 0;
  renderUpdatePop();
}

async function startUpdate() {
  if (!update?.available || updating) return;
  updating = true;
  renderUpdate();
  const r = await api.applyUpdate(); // on success the app restarts before this returns
  updating = false;
  renderUpdate();
  if (!r?.ok) {
    await confirmDialog({ title: 'Update failed', message: r?.error || 'Unknown error.', okLabel: 'OK', cancelLabel: 'Close' });
    pollUpdate();
  }
}

function newSessionHere() {
  const tab = activeTab();
  const list = realProjects();
  if (tab) openSession(tab.project);
  else if (list.length === 1) openSession(list[0]);
  else newSessionMenu($('#new-tab')); // pick one, or chat without a project
}

/** The project the top bar's shortcuts act on: the active tab's, else the only one. */
function currentProject() {
  const list = realProjects();
  return activeTab()?.project || (list.length === 1 ? list[0] : null);
}

function projectAction(fn) {
  const p = currentProject();
  if (p) fn(p);
  else if (!realProjects().length) addProjects();
}

// --------------------------------------------------------------- polling ----

// Visible but not focused (the user works in another app): the active project's git status slows down.
const idle = () => !document.hasFocus();

const remoteGitBusy = new Set();
const remoteSessionsBusy = new Set();
function remoteProjects(all, sessions = false) {
  if (document.hidden) return [];
  const shown = new Set([currentProject()?.path, ...expanded, ...[...tabs.values()].map((t) => t.project.path)]);
  return [...projects, ...orphanProjects()].filter((p) => p.remoteId && remotes.find((d) => d.id === p.remoteId)?.enabled !== false && (all || (sessions ? shown.has(p.path) : currentProject()?.path === p.path)));
}
function pollRemoteGit(all) {
  for (const p of remoteProjects(all)) {
    if (remoteGitBusy.has(p.path)) continue;
    remoteGitBusy.add(p.path);
    api.gitStatus([p.path]).then((r) => {
      if (r[p.path] === undefined) return;
      git = { ...git, ...r }; renderSidebar(); renderStatus(); renderWelcome();
      if (docProject()?.path === p.path) pollDiff();
    }).catch(() => {}).finally(() => remoteGitBusy.delete(p.path));
  }
}
function pollRemoteSessions(all) {
  for (const p of remoteProjects(all, true)) {
    if (remoteSessionsBusy.has(p.path)) continue;
    remoteSessionsBusy.add(p.path);
    const attached = tabsOf(p.path).filter((t) => t.status === 'running');
    const bindings = new Map(attached.map((t) => [t.id, { handle: t.runtimeId, generation: t.remoteGeneration || 0 }]));
    Promise.all([api.listSessions([p.path]), api.liveSessions(attached.filter((t) => t.kind === 'claude').map((t) => t.id)),
      ...attached.map(async (t) => {
        const handle = t.runtimeId;
        if (!handle) return;
        const r = await api.remoteRuntime(p.path, handle);
        if (!tabs.has(t.id) || t.runtimeId !== handle || (t.remoteGeneration || 0) !== bindings.get(t.id).generation || !r.ok) return;
        if (!r.runtime?.alive) {
          t.remoteEnded = true; t.status = 'exited'; api.ptyKill(t.id);
          showOverlay(t, 'Remote session ended.');
        }
      })]).then(([r, live]) => {
      if (r[p.path] !== undefined) { sessionsBy = { ...sessionsBy, ...r }; sessionsVer++; }
      for (const [id, b] of bindings) {
        const t = tabs.get(id);
        if (!t || t.runtimeId !== b.handle || (t.remoteGeneration || 0) !== b.generation) continue;
        if (live[id]) liveBy[id] = live[id]; else delete liveBy[id];
      }
      assignSessions();
      renderSidebar(); renderFoot(); renderStatus(); renderWelcome(); renderInfo();
    }).catch(() => {}).finally(() => remoteSessionsBusy.delete(p.path));
  }
}

// The active project every 4 s (8 s while unfocused), all of them every 20 s (and on focus, project changes).
// A full poll asked for while a partial one runs is queued, not dropped.
let gitBusy = false;
let gitQueued = false;
let gitTick = 0;
async function pollGit(all = true) {
  pollRemoteGit(all);
  const list = realProjects().filter((p) => !p.remoteId); // remotes never hold local polls busy
  if (gitBusy && all) gitQueued = true;
  if (gitBusy || document.hidden || !list.length) return;
  const cur = all ? null : currentProject();
  if (!all && (!cur || cur.chat || cur.remoteId)) return;
  gitBusy = true;
  try {
    const res = await api.gitStatus(all ? list.map((p) => p.path) : [cur.path]);
    const next = { ...git, ...res };
    if (JSON.stringify(next) !== JSON.stringify(git)) {
      git = next;
      renderSidebar();
      renderStatus();
      renderWelcome();
    }
  } finally {
    gitBusy = false;
    if (gitQueued) { gitQueued = false; pollGit(); }
    pollDiff(); // the active project's changes: cached in main until the status or a changed file moves
  }
}

// Every 4 s the projects on screen (open tabs, expanded in the sidebar, the current one), all of them every 20 s and on
// focus: sessions started outside the app still show up, without stat-ing every transcript of every project each tick.
let sessionsBusy = false;
let sessionsQueued = false;
let sessionsTick = 0;
let sessionsSoon = null;

/** A poll of the projects on screen shortly after an Enter or a finished reply in a Claude tab, not at the next 4 s tick. */
function soonSessions(ms = 400) {
  clearTimeout(sessionsSoon);
  sessionsSoon = setTimeout(() => (sessionsBusy ? soonSessions(300) : pollSessions(false)), ms);
}

async function pollSessions(all = true) {
  pollRemoteSessions(all);
  const shown = all ? null : new Set([...[...tabs.values()].map((t) => t.project.path), ...expanded, currentProject()?.path]);
  // removed projects with open tabs too: their rows need titles, fresh tabs their transcript (assignSessions)
  const paths = [...projects, ...orphanProjects()].filter((p) => !p.remoteId).map((p) => p.path).filter((p) => all || shown.has(p));
  if (sessionsBusy && all) sessionsQueued = true;
  if (sessionsBusy || document.hidden || !paths.length) return;
  sessionsBusy = true;
  try {
    const claudeIds = [...tabs.values()].filter((t) => !t.project.remoteId && t.kind === 'claude' && t.status === 'running').map((t) => t.id);
    const [res, live] = await Promise.all([api.listSessions(paths), api.liveSessions(claudeIds)]);
    liveBy = { ...liveBy, ...live };
    const next = { ...sessionsBy, ...res };
    if (JSON.stringify(next) !== JSON.stringify(sessionsBy)) { sessionsBy = next; sessionsVer++; }
    assignSessions();
    renderSidebar();
    renderFoot();
    renderRside();
    renderWelcome(); // the last conversation card
    pollInfo();
  } finally {
    sessionsBusy = false;
    if (sessionsQueued) { sessionsQueued = false; pollSessions(); }
  }
}

let usageBusy = false;
let usageRetries = 0;
async function pollUsage() {
  if (usageBusy || document.hidden) return;
  usageBusy = true;
  try {
    const next = await api.getUsage();
    if (JSON.stringify(next) !== JSON.stringify(usage)) { usage = next; renderFoot(); renderWelcome(); }
    // At launch the network or token may not be ready yet: retry soon instead of waiting for the next poll.
    // Not for HTTP failures (429 above all): main backs off by Retry-After, fast retries would only extend it.
    if (!next.ok && !next.status && ++usageRetries <= 5) setTimeout(pollUsage, 3000);
    else if (next.ok) usageRetries = 0;
  } catch {
    if (++usageRetries <= 5) setTimeout(pollUsage, 3000);
  } finally {
    usageBusy = false;
  }
}

// Home screen only: shown again, the stats are re-read (main re-parses the file only when it changed).
let statsBusy = false;
async function pollStats() {
  if (statsBusy || document.hidden || activeId) return;
  statsBusy = true;
  try {
    const next = await api.getStats(localDay());
    if (JSON.stringify(next) !== JSON.stringify(stats)) { stats = next; renderWelcome(); }
  } catch { /* the home screen just shows no stats */ } finally {
    statsBusy = false;
  }
}

let updateBusy = false;
async function pollUpdate() {
  if (updateBusy || updating || document.hidden) return;
  updateBusy = true;
  try {
    const next = await api.checkUpdate();
    if (JSON.stringify(next) !== JSON.stringify(update)) { update = next; renderUpdate(); }
  } finally {
    updateBusy = false;
  }
}

let portsBusy = false;
let portsAt = 0;
async function pollPorts() {
  // Only the right sidebar shows ports; closeTab / onCloseRequest rescan themselves when the last scan is stale.
  if (portsBusy || document.hidden || !rsideOnScreen()) return;
  portsBusy = true;
  try {
    const next = await api.listPorts();
    portsAt = Date.now();
    if (JSON.stringify(next) !== JSON.stringify(ports)) {
      ports = next;
      renderRside();
    }
  } finally {
    portsBusy = false;
  }
}

// ------------------------------------------------------------------ init ----

function wireGlobalEvents() {
  api.onRemoteStatus((id, status) => {
    remoteStatuses[id] = status;
    if (status.status === 'disabled') for (const t of tabs.values()) if (t.project.remoteId === id && !t.remoteEnded) remoteDisconnected(t);
    renderSidebar(true);
    if (settingsTab === 'connections') renderSettings();
  });
  api.onPtyData((id, data) => {
    const tab = tabs.get(id);
    if (!tab) return;
    tab.term.write(data);
    tab.lastOutput = Date.now();
    if (!visibleIds().includes(id)) {
      if (!tab.busy) { tab.busy = true; renderSidebar(); }
      clearTimeout(tab.busyTimer);
      tab.busyTimer = setTimeout(() => { tab.busy = false; renderSidebar(); }, 1500);
    }
  });

  api.onPtyExit((id, code) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.relaunch) { tab.relaunch(); return; } // relaunchTab ended it: no "Session ended" overlay
    if (tab.project.remoteId && tab.remoteEnding) { tab.status = 'exited'; return; }
    if (tab.project.remoteId && !tab.remoteEnded) { remoteDisconnected(tab); return; }
    tab.status = 'exited';
    tab.exitCode = code;
    tab.busy = false;
    showOverlay(tab, code === 0 ? 'Session ended.' : `Session ended (exit code ${code}).`);
    if (id !== activeId) { tab.attention = true; api.flash(); }
    renderSidebar(true);
    renderStatus();
    pollPorts();
  });

  api.onCloseRequest(onCloseRequest);
  api.onNotifyClick((id) => { if (tabs.has(id)) activate(id); });

  api.onOpenPath(async (p) => {
    if (!p) return;
    projects = (await api.getState()).projects;
    renderAll();
    const project = projects.find((x) => x.path.toLowerCase() === p.toLowerCase());
    if (project) focusProject(project);
  });

  // App shortcuts (SHORTCUTS, editable in settings). The defaults take Ctrl+T/S/W from Claude Code on purpose and
  // otherwise avoid its keys; on macOS they use Cmd. Capture phase, so the terminal never sees a handled key.
  window.addEventListener('keydown', (e) => {
    if (recording) { e.preventDefault(); e.stopPropagation(); recordKey(e); return; }
    let handled = true;
    if (e.key === 'Escape' && menuFor) closeMenu();
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menuFor && !$('#menu').hidden) menuArrow(e);
    else if (e.key === 'Escape' && detailKind) setDetail(null);
    else if (e.key === 'Escape' && settingsOpen && $('#modal').hidden) toggleSettings(false);
    else if (!$('#modal').hidden) handled = false; // a dialog is open: no shortcuts (Ctrl+W again would stack a second one)
    else if (e.key === 'Escape' && rightPeek.sticky && !$('#rside').contains(e.target)) rightPeek.set(false); // a file floated in from the terminal
    else if (e.target.classList?.contains('doc-edit') && e.code.startsWith('Arrow')) handled = false; // the markdown editor: word selection, not panes
    else if (e.target.classList?.contains('doc-edit') && mod(e) && e.code === 'KeyS' && !e.altKey && !e.shiftKey) flushDocEdit(); // habit: save now, not the sidebar
    else handled = runShortcut(e);
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  window.addEventListener('focus', () => {
    pollGit(); pollPorts(); pollSessions(); pollUsage(); pollStats();
    if (settingsOpen) $('#settings').focus();
    else if (document.activeElement?.id !== 'session-search') activeTab()?.term.focus();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { pollGit(); pollPorts(); pollSessions(); pollUsage(); pollStats(); }
  });
  document.addEventListener('mousedown', (e) => {
    // Closed without rebuilding the footer: a rebuild on mousedown swallowed the click on its gear or update button.
    if (detailKind && !e.target.closest('#detail, .fstat')) {
      detailKind = null;
      $('#detail').hidden = true;
      $('#side-foot .fstat.on')?.classList.remove('on');
    }
    // the "…" button toggles the menu itself on click, so a mousedown on it must not close it first
    if (menuFor && !e.target.closest('#menu, .remote-device-menu, #project-device, .project.menu-open .p-more, .session.menu-open .s-menu, #new-tab')) closeMenu();
  });
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('resize', placeUpdatePop);
  window.addEventListener('resize', applyDocW); // a file tab's width is a share of the window
  api.onDocChanged(onDocChanged);
  $('#projects').addEventListener('scroll', closeMenu);

  const search = $('#session-search');
  let searchTimer = null;
  const clearSearch = () => {
    clearTimeout(searchTimer);
    search.value = '';
    query = '';
    $('.search').classList.remove('has-text');
    renderSidebar(true);
  };
  search.addEventListener('input', () => {
    $('.search').classList.toggle('has-text', !!search.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = search.value; renderSidebar(true); }, 80);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    clearSearch();
    search.blur();
    activeTab()?.term.focus();
  });
  $('#search-clear').addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  $('#search-clear').addEventListener('click', (e) => { e.preventDefault(); clearSearch(); search.focus(); });

  $('#new-tab').addEventListener('click', (e) => newSessionMenu(e.currentTarget));
  $('#open-code').addEventListener('click', () => projectAction((p) => p.remoteId ? remoteNotice('Remote editor integration is not available yet. Use Copy remote path from the project menu.') : api.openInCode(p.path)));
  $('#open-shell').addEventListener('click', () => projectAction((p) => openSession(p, { kind: 'shell' })));
  $('#open-folder').addEventListener('click', () => projectAction((p) => p.remoteId ? api.writeClipboard(p.remotePath) : api.openFolder(p.path)));
  $('#toggle-sidebar').addEventListener('click', () => setSidebar(!ui.sidebar));
  $('#home').addEventListener('click', goHome);
  $('#toggle-rside').addEventListener('click', () => setServers(!rsideShown()));
  $('#open-diff').addEventListener('click', toggleDiff);
  $('#close-tab').addEventListener('click', () => { if (activeId) closeTab(activeId); });
  $('#split-tab').addEventListener('click', () => (curSplit() ? unsplit() : splitHere()));
  wirePeek();
  wireDropZone();
  wireDivider($('#pz-v'), 'x');
  wireDivider($('#pz-h'), 'y');

  wireResizer($('#rz-left'), 'sidebarW', (x) => x);
  wireResizer($('#rz-right'), 'rsideW', (x) => window.innerWidth - x);

  new ResizeObserver(() => requestAnimationFrame(fitActive)).observe($('#terminals'));
}

async function init() {
  $('#logo').innerHTML = LOGO_IMG;
  $('#toggle-sidebar').append(ico('sidebar'));
  $('#new-tab').append(ico('plus'));
  $('#close-tab').append(ico('x'));
  $('#split-tab').append(ico('columns'));
  $('#open-code').append(h('span', { class: 'ico', html: VSCODE_SVG }));
  $('#open-shell').append(ico('terminal'));
  $('#open-folder').append(ico('folder'));
  $('#toggle-rside').append(ico('panelRight'));
  $('#search-icon').append(ico('search'));
  $('#search-clear').append(ico('x'));
  $('#add-project').append(ico('folderPlus'));
  $('#add-project').onclick = addProjects;
  if (IS_MAC) {
    document.body.classList.add('mac'); // room for the traffic lights (styles.css)
    api.onFullScreen((on) => document.body.classList.toggle('fullscreen', on)); // no traffic lights in full screen
    for (const el of document.querySelectorAll('[title]')) {
      el.title = kbd(el.title).replace('PowerShell', SHELL_LABEL).replace('Explorer', FILES_APP);
    }
  }

  const state = await api.getState();
  projects = state.projects;
  remotes = state.remotes || [];
  remoteStatuses = state.remoteStatuses || {};
  chatInfo = state.chat;
  userName = state.user || '';
  ui = state.ui;
  ui.collapsed ||= [];
  document.documentElement.style.setProperty('--zoom', ui.zoom || 1);
  applyTheme();
  loadKeys(ui.keys);
  applyKeyTitles();
  for (const key of Object.keys(PANEL_W)) applyPanelW(key, ui[key]);
  applyDocW();
  for (const [p, d] of Object.entries(state.docs || {})) docsBy.set(p, d);
  if (docsBy.size) api.watchDocs([...docsBy.values()].flatMap((d) => d.files));
  for (const p of ui.expanded || []) expanded.add(p);
  restoring = !!state.restore?.tabs?.length;
  placeBrand();
  document.body.classList.toggle('rside-open', ui.servers);
  $('#toggle-rside').classList.toggle('on', ui.servers);

  wireGlobalEvents();
  renderAll();
  docBoot = true; // restoreTabs activates its first tab before its first await: a saved file tab shows without sliding
  restoreTabs(state.restore).catch(() => {});
  docBoot = false;

  pollGit();
  pollPorts();
  pollSessions();
  pollUsage();
  pollStats();
  pollMcp();
  pollDefinedAgents();
  setInterval(() => { const all = ++gitTick % 5 === 0; if (all || !idle() || gitTick % 2 === 0) pollGit(all); }, 4000);
  setInterval(() => { if (!idle() || Date.now() - portsAt > 30000) pollPorts(); }, 6000);
  setInterval(() => pollSessions(++sessionsTick % 5 === 0), 4000);
  setInterval(pollUsage, 60000);
  // served from main's 5 min cache; a project change polls at once (activate). Definitions too: one made with /agents shows up.
  setInterval(() => { pollMcp(); pollDefinedAgents(); }, 60000);
  setTimeout(pollUpdate, 10000); // after startup settles; git fetch is network
  setInterval(pollUpdate, 30 * 60 * 1000);
  // "Working" depends on recent output, so re-check it (cheap: the renders are key-diffed).
  setInterval(() => { if (!document.hidden) { renderSidebar(); renderFoot(); } }, 1500);
  // Notifications matter most while the window is hidden, so this one runs regardless (it only reads a few buffer lines).
  setInterval(() => { for (const t of tabs.values()) trackTab(t); }, 1500);
}

init();
