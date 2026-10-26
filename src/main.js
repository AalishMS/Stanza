'use strict';

const { app, BrowserWindow, Menu, Notification, ipcMain, dialog, shell, clipboard, screen, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const pty = require('@lydell/node-pty');
const {
  parseGitStatus, parentPid, parseNetstat, parseMsysPs, parseLsof, parsePs, macDevName, withoutFlagValues,
  oneLine, usageTokens, parseTail, firstPrompt, transcriptCwd, liveRecord, descendantPids, defaultEffort, withLongContext, parseModelEffort, agentDone, lastModel, agentPrompt,
  parseAgentFile, parseMcpList, remapSplits, edgeHold, summarizeStats,
} = require('./lib/parse');
const { scanImages } = require('./lib/images');
const { parseDiff, parseNumstat, statusPaths, zList, lineCount, addedFile } = require('./lib/diff');
const { isRemote, remoteKey, remoteTarget, UUID, deviceName, verifyRemoteIdentity } = require('./lib/remote');
const { Remote } = require('./remote');
const crypto = require('crypto');

// Windows is the main platform. macOS gets small `IS_MAC` branches next to the Windows code (best effort, untested here).
const IS_MAC = process.platform === 'darwin';
const ICON = path.join(__dirname, '..', 'assets', IS_MAC ? 'icon-mac.png' : 'icon.ico');
const ICON_PNG = path.join(__dirname, '..', 'assets', 'icon.png');

const AUMID = 'com.local.stanza'; // = build.appId
if (!IS_MAC) app.setAppUserModelId(AUMID);

/**
 * Windows shows toasts of an unregistered AppUserModelID under the host exe's name ("Electron" for npm start).
 * Registering a display name and icon for it (per user, no installer needed) gives "Stanza" for both the packaged
 * exe and source runs. The icon is copied out of the asar, which Windows can't read. Best effort.
 */
function registerToastIdentity() {
  try {
    const icon = path.join(app.getPath('userData'), 'toast-icon.png');
    fs.copyFileSync(ICON_PNG, icon); // Refresh existing profiles when the app logo changes.
    const key = `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`;
    for (const [name, value] of [['DisplayName', 'Stanza'], ['IconUri', icon]]) {
      execFile('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true }, () => {});
    }
    // The ID of the app's old name ("Claude Bench"); fails quietly once it is gone.
    execFile('reg.exe', ['delete', 'HKCU\\Software\\Classes\\AppUserModelId\\com.local.claudebench', '/f'], { windowsHide: true }, () => {});
  } catch { /* toasts still work, just under the exe's name */ }
}

// An app started from Finder gets PATH=/usr/bin:/bin:/usr/sbin:/sbin, which misses claude, node (nvm, Homebrew) and code.
// Ask the user's login shell for its PATH once; sessions and `claude mcp list` wait for it.
// An rc file can block (an "update? [Y/n]" prompt, `exec tmux`) and interactive shells ignore SIGTERM, so stdin is closed,
// the shell gets its own process group, and after 5 s the whole group is SIGKILLed and we go on with the fallback folders.
const shellEnvReady = !IS_MAC ? Promise.resolve() : new Promise((resolve) => {
  let out = '';
  let done = false;
  let child = null;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    const found = /__CB_PATH__=(.+)/.exec(out)?.[1]?.trim();
    if (found && found.includes(':')) process.env.PATH = found; // a single entry means the shell printed something else
    // Also add the usual folders when the shell's PATH lacks them (or the shell never answered).
    const have = new Set((process.env.PATH || '').split(':'));
    const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.claude', 'local')];
    process.env.PATH = [...have, ...extra.filter((d) => !have.has(d))].filter(Boolean).join(':');
    resolve();
  };
  const timer = setTimeout(finish, 5000);
  try {
    child = spawn(process.env.SHELL || '/bin/zsh', ['-ilc', 'echo "__CB_PATH__=$PATH"'], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    child.stdout.on('data', (d) => { out += d; if (/__CB_PATH__=.*\n/.test(out)) finish(); });
    child.on('error', finish);
    child.on('close', finish);
  } catch {
    finish();
  }
});
if (IS_MAC && !process.env.LANG) process.env.LANG = 'en_US.UTF-8'; // Finder launches have no locale; claude and zsh want UTF-8

// ---------------------------------------------------------------- state ----

const defaults = {
  projects: [], // [{ path, name }]
  remotes: [],
  remoteClient: null,
  ui: { sidebar: true, servers: true, rsideMigrated: true, sidebarW: 232, rsideW: 300, rsideDocPct: 40, fontSize: 14, zoom: 1, theme: 'dark', claude: false, accent: 'blue', expanded: [], collapsed: [], keys: {} }, // theme: dark | light | system; claude: Claude desktop's palette over that theme; accent: ACCENTS; expanded: project paths showing sessions; collapsed: right-sidebar sections folded shut; keys: shortcut overrides (action id -> combos); rsideDocPct: right sidebar width (% of the window) while a markdown tab shows
  docs: {}, // markdown tabs in the right sidebar, per project: { [project path]: { files: [absolute path], active: index | -1 } }
  bounds: null,
  maximized: false,
  tabs: [], // open tabs in tab order, reopened at launch: [{ project: path, kind: 'claude' | 'shell', sessionId }]
  activeTab: -1, // index into tabs
  splits: [], // split groups of the open tabs: [{ tabs: [index into tabs, 2-4], cx, ry, v }]
  chatDir: null, // folder of "No project" chats chosen in settings; null = ~/Claude Chats
};
let state = structuredClone(defaults);
const stateFile = () => path.join(app.getPath('userData'), 'state.json');
// The app was called "Claude Bench" and before that "Claude Terminal" (userData = %APPDATA%\claude-bench, \claude-terminal);
// the newest of those is read once if nothing is saved yet. undefined when there is none. Looked up next to userData, not
// in appData, so a test instance with its own --user-data-dir never loads (and restores the tabs of) the real install.
const legacyStateFile = () => ['claude-bench', 'claude-terminal']
  .map((name) => path.join(path.dirname(app.getPath('userData')), name, 'state.json')).find((f) => fs.existsSync(f));
let firstRun = false; // no state file at all: the sidebar is seeded with recent Claude Code projects (recentProjects)

function loadState() {
  try {
    const file = fs.existsSync(stateFile()) ? stateFile() : legacyStateFile();
    const saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    state = { ...defaults, ...saved, ui: { ...defaults.ui, ...saved.ui } };
    // The right sidebar used to default to closed, so a saved `false` is usually just that old default: reopen it once.
    if (!saved.ui?.rsideMigrated) { state.ui.servers = true; state.ui.rsideMigrated = true; }
    // Chats used to live in the home folder (Claude Code never keeps trust there): move the entry to its own folder.
    // Not when the user picked home as the chat folder in settings (it would be re-expanded on every launch).
    for (const p of state.projects) {
      if (!p.chat || !samePath(p.path, os.homedir()) || samePath(chatDir(), os.homedir())) continue;
      try { fs.mkdirSync(chatDir(), { recursive: true }); p.path = chatDir(); } catch { continue; /* stays at home */ }
      if (Array.isArray(state.ui.expanded)) state.ui.expanded.push(p.path); // shown open, like before
    }
  } catch {
    /* first run or unreadable file: keep defaults */
    firstRun = !fs.existsSync(stateFile()) && !legacyStateFile();
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    const tmp = stateFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, stateFile());
  } catch (err) {
    console.error('Could not save state:', err);
  }
}

/**
 * The saved tabs that can be reopened: the project is still listed and on disk, and a Claude tab's transcript still exists
 * (it is resumed with --resume). Shell tabs start fresh. One bad entry only drops that entry.
 */
function restorableTabs() {
  const list = [];
  const at = new Map(); // saved index -> index in list
  let active = -1;
  (Array.isArray(state.tabs) ? state.tabs : []).forEach((t, i) => {
    try {
      const proj = state.projects.find((p) => samePath(p.path, t.project));
      if (!proj) return;
      if (proj.remoteId) {
        if (!state.remotes.some((d) => d.id === proj.remoteId) || !['shell', 'claude'].includes(t.kind)) return;
        if (!UUID.test(t.runtimeId) && !(t.kind === 'claude' && UUID.test(t.sessionId))) return;
        list.push({ project: proj.path, kind: t.kind, sessionId: UUID.test(t.sessionId) ? t.sessionId : null, runtimeId: t.runtimeId });
        at.set(i, list.length - 1);
        if (i === state.activeTab) active = list.length - 1;
        return;
      }
      if (!isDir(proj.path)) return;
      if (t.kind === 'claude') {
        if (!UUID_RE.test(t.sessionId) || !fs.existsSync(path.join(projectDir(proj.path), `${t.sessionId}.jsonl`))) return;
        list.push({ project: proj.path, kind: 'claude', sessionId: t.sessionId });
      } else if (t.kind === 'shell') {
        list.push({ project: proj.path, kind: 'shell', sessionId: null });
      } else return;
      at.set(i, list.length - 1);
      if (i === state.activeTab) active = list.length - 1;
    } catch { /* skip this one */ }
  });
  return { tabs: list, active, splits: remapSplits(state.splits, at) };
}

function saveTabs(payload) {
  const list = Array.isArray(payload?.tabs) ? payload.tabs : [];
  state.tabs = list.slice(0, 50)
    .filter((t) => typeof t?.project === 'string' && (t.kind === 'shell' || (t.kind === 'claude' && (UUID_RE.test(t.sessionId) || (isRemote(t.project) && UUID.test(t.runtimeId))))))
    .map((t) => ({ project: t.project, kind: t.kind, sessionId: t.kind === 'claude' ? t.sessionId : null, ...(isRemote(t.project) ? { runtimeId: t.runtimeId } : {}) }));
  state.activeTab = Number.isInteger(payload?.active) ? payload.active : -1;
  const ratio = (v) => (typeof v === 'number' && v > 0.05 && v < 0.95 ? v : 0.5);
  const used = new Set();
  state.splits = (Array.isArray(payload?.splits) ? payload.splits : []).slice(0, 12).map((g) => {
    const members = (Array.isArray(g?.tabs) ? g.tabs : [])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < state.tabs.length && !used.has(i)).slice(0, 4);
    members.forEach((i) => used.add(i)); // a tab is in at most one group
    return { tabs: members, cx: ratio(g.cx), ry: ratio(g.ry), v: g.v === true };
  }).filter((g) => g.tabs.length >= 2);
  saveState();
}

const DIFF_TAB = -2; // renderer.js: a project's `active` while its Changes tab shows

/**
 * The saved markdown tabs that can be reopened: the project is still listed and the file still exists. `active` follows
 * its file, since a dropped file shifts the ones after it; a dropped active file leaves the sidebar's own tab active.
 * `diff` = the project's Changes tab is open too (active DIFF_TAB while it shows).
 */
function restorableDocs() {
  const out = {};
  const saved = state.docs && typeof state.docs === 'object' ? state.docs : {};
  for (const [proj, d] of Object.entries(saved)) {
    try {
      const p = state.projects.find((x) => samePath(x.path, proj));
      if (!p || !Array.isArray(d?.files)) continue;
      if (p.remoteId) { if (d.diff) out[p.path] = { files: [], active: DIFF_TAB, diff: true }; continue; }
      const files = d.files.filter((f) => typeof f === 'string' && MD_RE.test(f) && isFile(f));
      const diff = d.diff === true; // the Changes tab is open
      if (!files.length && !diff) continue;
      const active = Number.isInteger(d.active) ? d.files[d.active] : null;
      out[p.path] = { files, active: diff && d.active === DIFF_TAB ? DIFF_TAB : active ? files.indexOf(active) : -1, ...(diff ? { diff } : {}) };
    } catch { /* skip this project */ }
  }
  return out;
}

function saveDocs(payload) {
  const out = {};
  for (const [proj, d] of Object.entries(payload && typeof payload === 'object' ? payload : {}).slice(0, 200)) {
    const files = (Array.isArray(d?.files) ? d.files : []).filter((f) => typeof f === 'string' && f.length < 1000 && MD_RE.test(f)).slice(0, 500);
    const diff = d?.diff === true;
    if (!files.length && !diff) continue;
    const active = diff && d.active === DIFF_TAB ? DIFF_TAB : Number.isInteger(d.active) && d.active >= 0 && d.active < files.length ? d.active : -1;
    out[proj] = { files, active, ...(diff ? { diff } : {}) };
  }
  state.docs = out;
  saveState();
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const samePath = (a, b) => isRemote(a) || isRemote(b) ? a === b : path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

let remote;
const remoteStatuses = {};
function remoteManager() {
  if (!remote) {
    if (!UUID.test(state.remoteClient)) { state.remoteClient = crypto.randomUUID(); saveState(); }
    remote = new Remote(state.remoteClient, (id, status) => { remoteStatuses[id] = status; send('remote:status', id, status); });
  }
  return remote;
}
function remoteProject(key) {
  const p = state.projects.find((p) => p.path === key) || [...sessions.values()].find((s) => s.cwd === key)?.project;
  const device = p && state.remotes.find((d) => d.id === p.remoteId);
  if (!p?.remoteId || !device || remoteKey(device.id, p.remotePath) !== key) throw Error('Remote project is not available');
  return { project: p, device };
}
async function remoteCall(key, op, params = {}) {
  const { project, device } = remoteProject(key);
  return deviceCall(device, op, { ...params, cwd: project.remotePath });
}
async function deviceCall(device, op, params = {}) {
  const info = await checkRemoteDevice(device);
  if (op === 'prepare' && params.kind === 'claude' && !info.claude) throw Error('Claude Code is missing on the server. Open a remote Shell to install it.');
  return remoteManager().call(device, op, params);
}
async function checkRemoteDevice(device, force = false) {
  try {
    const info = await remoteManager().check(device, force);
    verifyRemoteIdentity(device, info);
    return info;
  } catch (e) {
    // Validation failures (missing tools or a different identity) are offline too.
    // Keep transport failures' normal retry delay so background polls cannot hammer SSH.
    if (remoteStatuses[device.id]?.status === 'connected') remoteManager().disconnect(device, e.message);
    throw e;
  }
}

const creatingRemote = new Set();
async function createRemoteSession(opts) {
  if (!UUID.test(opts.id) || sessions.has(opts.id) || creatingRemote.has(opts.id)) return { ok: false, error: 'Session is already starting or attached' };
  creatingRemote.add(opts.id);
  try {
    const { project, device } = remoteProject(opts.cwd);
    const handle = UUID.test(opts.runtimeId) ? opts.runtimeId : crypto.randomUUID();
    const runtime = await remoteCall(opts.cwd, 'prepare', { ...opts, handle });
    if (device.enabled === false) throw Error('Connection is off. Turn it on in Settings > Connections.');
    if (sessions.has(opts.id)) return { ok: false, error: 'Session already attached' };
    if ([...sessions.values()].some((s) => s.remoteId && s.runtimeId === runtime.handle)) throw Error('That remote session is already attached in another tab');
    const launch = remoteManager().attach(device, runtime.handle);
    const p = pty.spawn(launch.file, launch.argv, { name: 'xterm-256color', cols: Math.max(opts.cols || 80, 2), rows: Math.max(opts.rows || 24, 2), cwd: os.homedir(), env: { ...process.env, TERM: 'xterm-256color' } });
    const s = { pty: p, cwd: opts.cwd, project, kind: opts.kind, remoteId: device.id, runtimeId: runtime.handle, buf: '', timer: null, startedAt: runtime.startedAt };
    s.closed = new Promise((resolve) => { s.resolveClosed = resolve; });
    sessions.set(opts.id, s);
    p.onData((d) => { s.buf += d; if (!s.timer) s.timer = setTimeout(() => flushSession(opts.id), 6); });
    p.onExit(({ exitCode }) => {
      clearTimeout(s.timer); flushSession(opts.id); sessions.delete(opts.id);
      s.resolveClosed();
      send('pty:exit', opts.id, exitCode);
    });
    return { ok: true, runtimeId: runtime.handle, sessionId: runtime.sessionId || runtime.resumeId || null, skipPerms: !!runtime.skipPerms, startedAt: runtime.startedAt };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { creatingRemote.delete(opts.id); }
}

/**
 * "No project" chats run in their own folder, not in home: Claude Code never saves trust for the home folder, so every
 * chat there asked again. Claude tabs started in it get `--add-dir <home>` (createSession) for Desktop/Downloads chores.
 */
const defaultChatDir = () => path.join(os.homedir(), 'Claude Chats');
const chatDir = () => (typeof state.chatDir === 'string' && state.chatDir) || defaultChatDir();
/** For the settings page: where chats run, and whether that is the default or the home folder (trust asked every time). */
const chatInfo = () => ({ dir: chatDir(), isDefault: !state.chatDir, isHome: samePath(chatDir(), os.homedir()) });
/** The home screen's greeting name: the OS account name (empty if it can't be read, the greeting then has none). */
const userName = () => { try { return os.userInfo().username || ''; } catch { return ''; } };

/** Settings: run chats in `dir` (null = the default folder). Moves the Chats entry if there is one; old chats stay on disk. */
function setChatDir(dir) {
  const target = dir || defaultChatDir();
  if (state.projects.some((x) => !x.chat && samePath(x.path, target))) {
    return { error: 'That folder is already a project in the sidebar.' };
  }
  const cur = state.projects.find((x) => x.chat);
  if (cur && [...sessions.values()].some((s) => samePath(s.cwd, cur.path))) {
    return { error: 'Close the open chats to change the folder.' }; // their tabs belong to the current folder
  }
  if (!dir) {
    try { fs.mkdirSync(target, { recursive: true }); } catch (err) { return { error: `Could not create ${target}: ${err.message}` }; }
  } else if (!isDir(target)) {
    return { error: `Folder not found: ${target}` };
  }
  state.chatDir = dir && !samePath(dir, defaultChatDir()) ? path.resolve(dir) : null;
  const entry = state.projects.find((x) => x.chat);
  if (entry) entry.path = chatDir();
  saveState();
  return { projects: state.projects, chat: chatInfo() };
}

/**
 * The project entry for chats, flagged `chat`, always first. Created on first use (and its folder with it).
 * If that folder is already a real project it stays one, and chats just open there. Returns the projects and the path to open.
 */
function chatProject() {
  const dir = chatDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (err) {
    return { error: `The chat folder isn't available: ${dir}\n${err.message}` }; // e.g. a drive that is gone; settings can change it
  }
  if (!state.projects.some((x) => samePath(x.path, dir))) {
    state.projects = state.projects.filter((x) => !x.chat); // one Chats entry (an older one may sit at home)
    state.projects.unshift({ path: dir, name: 'Chats', chat: true });
    saveState();
  }
  return { projects: state.projects, path: state.projects.find((x) => samePath(x.path, dir)).path };
}

/** Is `cwd` the chat folder of the Chats entry? */
const isChatDir = (cwd) => state.projects.some((x) => x.chat && samePath(x.path, cwd));

function addProject(p) {
  const abs = path.resolve(p);
  if (!isDir(abs)) return null;
  if (!state.projects.some((x) => samePath(x.path, abs))) {
    state.projects.push({ path: abs, name: path.basename(abs) || abs });
    saveState();
  }
  return abs;
}

// ----------------------------------------------------------------- ptys ----

const sessions = new Map(); // id -> { pty, pid, cwd, kind, buf, timer }

// Variables that mark "I am running inside a Claude Code session". If the app was
// started from one, nested `claude` processes would otherwise inherit them.
const STRIP_ENV = [
  'CLAUDECODE', 'CLAUDE_PID',
  'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(channel, ...args) {
  const win = mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// Sidebar peek: a pointer that left the window through the edge of a collapsed sidebar (left, or the right sidebar)
// keeps it out while it stays within PEEK_SLACK px of that edge and within the window's height. The page can't see the
// cursor out there, so main polls it (only while it is there) and tells the page when it has moved on (edgeHold).
// The top bar is the same for a sidebar that is out: its drag region sends the page no pointer events either.
const PEEK_SLACK = 144; // CSS px
const peekWatch = { sides: new Set(), bar: 0, timer: null };
function peekState(side, top = 0, bottom = 0, bar = 0) {
  if (mainWindow.isMinimized() || !mainWindow.isVisible()) return 'away'; // minimized from the top bar: the cursor is still there
  const z = mainWindow.webContents.getZoomFactor();
  return edgeHold(screen.getCursorScreenPoint(), mainWindow.getContentBounds(), PEEK_SLACK * z, top * z, side, bottom * z, bar * z);
}
/** Stop watching for `side` ('left' | 'right'), or for both. */
function stopPeekWatch(side) {
  if (side) peekWatch.sides.delete(side);
  else peekWatch.sides.clear();
  if (peekWatch.sides.size) return;
  clearInterval(peekWatch.timer);
  peekWatch.timer = null;
}
/**
 * The pointer just left the page: is it beside the edge of one of the collapsed sidebars in `zones` (`{ left, right, bar }`,
 * each side `[top, bottom, out]`: its edge zone's distance from the window's top and bottom in CSS px, and whether it is
 * out now), or over the top bar (`bar` CSS px high) with that sidebar out? Then watch it and return those sides.
 */
function peekHold(zones) {
  stopPeekWatch();
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  const held = ['left', 'right'].filter((s) => zones[s] && peekState(s, zones[s][0], zones[s][1], zones[s][2] ? zones.bar : 0) === 'hold');
  if (!held.length) return [];
  peekWatch.sides = new Set(held);
  peekWatch.bar = zones.bar; // held sidebars are out, so the top bar keeps each of them out from here on
  peekWatch.timer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return stopPeekWatch();
    for (const side of [...peekWatch.sides]) {
      const s = peekState(side, 0, 0, peekWatch.bar);
      if (s === 'hold') continue;
      stopPeekWatch(side);
      send(s === 'away' ? 'peek:away' : 'peek:inside', side);
    }
  }, 40);
  return held;
}

function flushSession(id) {
  const s = sessions.get(id);
  if (!s || !s.buf) return;
  const data = s.buf;
  s.buf = '';
  s.timer = null;
  send('pty:data', id, data);
}

// Windows: node-pty's kill() closes the console and also TerminateProcess-es every process attached to it. In
// its first seconds Claude is too busy to beat that, so its fullscreen boot canary stays in ~/.claude.json and the
// next launch falls back to the classic renderer (two strikes turn fullscreen off for that version). For Claude
// tabs, close only the console (Claude exits on the close event) and end what is left after 5 s.
// Once only: node-pty closes the native pseudoconsole on every kill() and a second close corrupts the heap (the whole app
// crashed). A Claude tab can take seconds to exit, so closing a tab during a relaunch, or quitting right after closing
// one, used to kill it twice. Its pty also takes no writes or resizes any more (native calls on the closed console).
function endSession(s) {
  if (s.ending) return;
  s.ending = true;
  const agent = s.pty._agent;
  if (s.remoteId || IS_MAC || s.kind !== 'claude' || typeof agent?._getConsoleProcessList !== 'function') {
    try { s.pty.kill(); } catch { /* already gone */ }
    return;
  }
  const list = agent._getConsoleProcessList.call(agent).catch(() => []);
  agent._getConsoleProcessList = () => Promise.resolve([]);
  try { s.pty.kill(); } catch { /* already gone */ }
  setTimeout(() => list.then((pids) => {
    for (const pid of pids) {
      try { process.kill(pid); } catch { /* exited */ }
    }
  }), 5000).unref();
}

function createSession({ id, cwd, kind, resumeId, fork, skipPerms, cols, rows }) {
  if (sessions.has(id)) return { ok: false, error: 'Session already exists' };
  if (!isDir(cwd)) return { ok: false, error: `Folder not found: ${cwd}` };
  // Only a bare UUID may reach the command line as a session id.
  if (resumeId != null && !(typeof resumeId === 'string' && UUID_RE.test(resumeId))) {
    return { ok: false, error: 'Invalid session id' };
  }

  const env = { ...process.env, COLORTERM: 'truecolor', TERM_PROGRAM: 'Stanza' };
  for (const k of STRIP_ENV) delete env[k];
  delete env.NO_COLOR; // an inherited NO_COLOR makes claude and shells print everything uncolored
  if (env.FORCE_COLOR === '0') delete env.FORCE_COLOR;

  let file;
  let argv;
  if (kind === 'claude') {
    // No bare --continue: Claude would pick the newest transcript itself, even one already open in another tab, and the
    // tab couldn't know which (the renderer resolves "Continue last conversation" to a resumeId instead).
    const extra = resumeId ? ['--resume', resumeId, ...(fork === true ? ['--fork-session'] : [])] : [];
    if (isChatDir(cwd)) extra.push('--add-dir', os.homedir()); // chats may tidy the Desktop, Downloads...
    if (skipPerms === true) extra.push('--dangerously-skip-permissions'); // the session menu's "Relaunch, skip permissions"
    if (IS_MAC) {
      // Found on the login shell's PATH (shellEnvReady); the tab ends when claude exits, like cmd /c.
      file = 'claude';
      argv = extra;
    } else {
      // cmd resolves both claude.cmd (npm) and claude.exe (native installer).
      file = 'cmd.exe';
      argv = ['/d', '/c', 'claude', ...extra];
    }
  } else if (IS_MAC) {
    file = process.env.SHELL || '/bin/zsh';
    argv = ['-l'];
  } else {
    file = 'powershell.exe';
    argv = ['-NoLogo'];
  }

  let p;
  try {
    p = pty.spawn(file, argv, {
      name: 'xterm-256color',
      cols: Math.max(cols || 80, 2),
      rows: Math.max(rows || 24, 2),
      cwd,
      env,
    });
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }

  // /model and /effort save the default for new sessions only: this process keeps the one it started with (sessionInfo).
  // startedAt: subagent runs written before it belong to an earlier process (resumed session), so they can't be running.
  const s = { pty: p, cwd, kind, buf: '', timer: null, startedAt: Date.now(), settings: kind === 'claude' ? readSettingsSync() : null };
  sessions.set(id, s);

  // Coalesce bursts of output into one IPC message per few milliseconds.
  p.onData((d) => {
    s.buf += d;
    if (!s.timer) s.timer = setTimeout(() => flushSession(id), 6);
  });
  p.onExit(({ exitCode }) => {
    clearTimeout(s.timer);
    flushSession(id);
    sessions.delete(id);
    send('pty:exit', id, exitCode);
  });

  return { ok: true };
}

// ------------------------------------------------------------------ git ----

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: 10000, maxBuffer: 32 * 1024 * 1024, ...opts },
      (err, stdout) => resolve(err ? null : stdout)
    );
  });
}

async function gitStatus(cwd) {
  if (isRemote(cwd)) return remoteCall(cwd, 'status');
  const out = await run('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (out == null) statusOut.delete(cwd);
  else statusOut.set(cwd, out);
  return out == null ? null : parseGitStatus(out);
}

// ----------------------------------------------------------------- diff ----
// The Changes tab (renderer.js "changes"): uncommitted changes against HEAD (index and working tree together), new
// untracked files included, for the whole repo the project is in. Both calls are polled with the git status, so each
// result is cached per project under a key: that status output plus the mtime and size of every path it lists. git diff
// runs again only when the key changes, or after DIFF_TTL (a file edited inside a new folder shows only as "? folder/").

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // a repo without commits yet diffs against nothing
const DIFF_TTL = 20000;
const UNTRACKED_MAX = 300; // untracked files listed
const UNTRACKED_READ = 512 * 1024; // bytes: a bigger untracked file is listed without its text
const UNTRACKED_TOTAL = 8 * 1024 * 1024; // bytes read for untracked files per call
const statusOut = new Map(); // project path -> its last `git status --porcelain=v2` output (gitStatus)
const gitRoots = new Map(); // project path -> repo top level
const diffCache = new Map(); // `${kind}\n${project path}` -> { key, at, value }, the newest few

const gitIn = (root, args, opts = {}) => run('git', ['-C', root, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, ...opts });

async function gitRoot(cwd) {
  if (!gitRoots.has(cwd)) {
    const out = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    if (!out?.trim()) return null; // not a repo (yet): asked again next time
    gitRoots.set(cwd, path.resolve(out.trim()));
  }
  return gitRoots.get(cwd);
}

/** An untracked file's text, or why it isn't shown. `budget.left` caps the bytes read per call. */
function readUntracked(file, budget) {
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) return { dir: true }; // ls-files lists a nested repository as "sub/"
    if (!st.isFile()) return { skip: true };
    if (isBinaryFile(file)) return { binary: true };
    if (st.size > UNTRACKED_READ || st.size > budget.left) return { big: st.size };
    budget.left -= st.size;
    return { text: fs.readFileSync(file, 'utf8') };
  } catch {
    return { skip: true };
  }
}

/** The cached value for a project when nothing it depends on changed, else `compute(root, base)`'s, stored with its `id`. */
async function diffCached(kind, cwd, compute) {
  let out = statusOut.get(cwd);
  if (out == null) {
    out = await run('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    if (out == null) return { ok: false, noRepo: true };
    statusOut.set(cwd, out);
  }
  const root = await gitRoot(cwd);
  if (!root) return { ok: false, noRepo: true };
  const stats = statusPaths(out).slice(0, 1000).map((p) => {
    try {
      const st = fs.statSync(path.resolve(cwd, p)); // relative to the folder status ran in, not the repo root
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return '-';
    }
  });
  const key = `${out}\n${stats.join(',')}`;
  const k = `${kind}\n${cwd}`;
  const hit = diffCache.get(k);
  if (hit && hit.key === key && Date.now() - hit.at < DIFF_TTL) return hit.value;
  const base = /^# branch\.oid \(initial\)$/m.test(out) ? EMPTY_TREE : 'HEAD';
  const hash = require('crypto').createHash('sha1');
  const value = await compute(root, base, hash);
  value.id = (value.hashed ? hash : hash.update(JSON.stringify(value))).digest('hex');
  delete value.hashed;
  diffCache.delete(k);
  diffCache.set(k, { key, at: Date.now(), value });
  if (diffCache.size > 8) diffCache.delete(diffCache.keys().next().value);
  return value;
}

/** For the top bar's button: { ok, files, added, removed } of the uncommitted changes (new files' lines count as added). */
function diffStat(cwd) {
  if (isRemote(cwd)) return remoteCall(cwd, 'diff').then((v) => v.ok ? { ok: true, files: v.files.length + v.more, added: v.added, removed: v.removed } : v);
  return diffCached('stat', cwd, async (root, base) => {
    const [num, others] = await Promise.all([
      gitIn(root, ['diff', base, '--numstat', '-z', '-M', '--no-color', '--no-ext-diff']),
      gitIn(root, ['ls-files', '--others', '--exclude-standard', '-z']),
    ]);
    if (num == null) return { ok: false, error: 'Could not read the changes.' };
    const list = parseNumstat(num);
    const extra = zList(others);
    const budget = { left: UNTRACKED_TOTAL };
    let added = 0;
    let removed = 0;
    for (const f of list) { added += f.added || 0; removed += f.removed || 0; }
    for (const rel of extra.slice(0, UNTRACKED_MAX)) added += lineCount(readUntracked(path.join(root, rel), budget).text);
    return { ok: true, files: list.length + extra.length, added, removed };
  });
}

/**
 * The whole diff: { ok, root, files: parseDiff's, then untracked files (`untracked`, their text as one added hunk, or
 * `binary` / `big` (bytes) / `skip`), sorted by path, each with an `id` of its contents, added, removed, more: untracked
 * files left out }, or { same: true } when it is still the one the renderer has (`have` = its id).
 */
async function gitDiff(cwd, have) {
  if (isRemote(cwd)) return remoteCall(cwd, 'diff', { have });
  const value = await diffCached('diff', cwd, async (root, base, hash) => {
    const [patch, others] = await Promise.all([
      gitIn(root, ['-c', 'core.quotepath=false', 'diff', base, '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-M'],
        { timeout: 20000, maxBuffer: 16 * 1024 * 1024 }),
      gitIn(root, ['ls-files', '--others', '--exclude-standard', '-z']),
    ]);
    if (patch == null) return { ok: false, error: 'git diff failed, or its output is over 16 MB.' };
    const files = parseDiff(patch);
    const extra = zList(others);
    const budget = { left: UNTRACKED_TOTAL };
    hash.update(root).update('\0').update(patch); // the id: what the result is made of, cheaper than the result itself
    for (const rel of extra.slice(0, UNTRACKED_MAX)) {
      const u = readUntracked(path.join(root, rel), budget);
      const f = addedFile(rel.replace(/\/$/, ''), u.text || '');
      f.untracked = true;
      if (u.text == null) Object.assign(f, { binary: !!u.binary, big: u.big || 0, skip: !!u.skip, dir: !!u.dir });
      hash.update('\0').update(rel).update('\0').update(u.text ?? JSON.stringify(u));
      files.push(f);
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    // each file's own id: the renderer keeps a file's section on the page while it stays the same
    for (const f of files) f.id = require('crypto').createHash('sha1').update(JSON.stringify(f)).digest('hex').slice(0, 16);
    const sum = (k) => files.reduce((n, f) => n + f[k], 0);
    return { ok: true, hashed: true, root, files, added: sum('added'), removed: sum('removed'), more: Math.max(0, extra.length - UNTRACKED_MAX) };
  });
  return value.ok && have && value.id === have ? { same: true } : value;
}

// ---------------------------------------------------------------- ports ----

const DEV_PROCESSES = new Set([
  'node.exe', 'bun.exe', 'deno.exe', 'python.exe', 'pythonw.exe', 'py.exe', 'ruby.exe',
  'java.exe', 'javaw.exe', 'php.exe', 'php-cgi.exe', 'dotnet.exe', 'go.exe', 'cargo.exe',
  'uvicorn.exe', 'gunicorn.exe', 'hugo.exe', 'caddy.exe',
]);

/** The process table (WMI), plus the listeners only when netstat failed (Get-NetTCPConnection is slow too). */
const portScript = (withConns) => `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
${withConns ? '$c = Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess' : '$c = @()'}
$p = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, @{ n = 'T'; e = { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } }
@{ c = @($c); p = @($p) } | ConvertTo-Json -Compress -Depth 4
`;

let portScan = null;

// The process table from the last PowerShell scan, reused while no new listener appears. A cold powershell.exe + WMI
// costs about a second of CPU; netstat costs ~30 ms. `keys` holds the "pid:port" listeners seen without a gap since that
// scan: one that stops and comes back counts as new, so a recycled pid gets a fresh scan instead of the old process's
// name and owner (only a pid exiting and being reused on the same port between two netstat runs slips through).
const PROC_TTL = 60000;
let procScan = null; // { at, p, keys: Set }

async function psScan(withConns) {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', portScript(withConns)], { timeout: 20000 });
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

/** Listeners and processes as { c: [{ LocalAddress, LocalPort, OwningProcess }], p: [{ ProcessId, ParentProcessId, Name, CommandLine, T }] }. */
async function winScan() {
  const out = await run('netstat.exe', ['-ano']);
  const c = out ? parseNetstat(out) : [];
  if (!c.length) { // netstat failed or changed its format: the old full scan
    procScan = null;
    const data = await psScan(true);
    return data ? { ok: true, data } : { ok: false, error: 'Could not read listening ports' };
  }
  const keys = new Set(c.map((x) => `${x.OwningProcess}:${x.LocalPort}`));
  const fresh = procScan && Date.now() - procScan.at < PROC_TTL && [...keys].every((k) => procScan.keys.has(k));
  if (fresh) {
    procScan.keys = keys; // drop listeners that went away
  } else {
    const data = await psScan(false);
    if (!data) { procScan = null; return { ok: false, error: 'Could not read processes' }; }
    procScan = { at: Date.now(), p: data.p || [], keys };
  }
  return { ok: true, data: { c, p: procScan.p } };
}

function macScan() {
  const exec = (file, args) => new Promise((resolve) => {
    execFile(file, args, { timeout: 20000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => resolve({ err, stdout: stdout || '' }));
  });
  return Promise.all([
    exec('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn', '+c', '0']),
    exec('/bin/ps', ['-axww', '-o', 'pid=,ppid=,etime=,args=']),
  ]).then(([l, p]) => {
    // lsof exits with 1 when nothing is listening; that is an empty list, not a failure.
    if ((l.err && l.err.code !== 1) || p.err) return { ok: false, error: 'Could not read listening ports' };
    const { conns, names } = parseLsof(l.stdout);
    return { ok: true, data: { c: conns, p: parsePs(p.stdout, names, Date.now()) } };
  });
}

/** Git's MSYS ps.exe beside a process's executable (first token of its command line), or null. */
function msysPs(cmd) {
  const m = /^\s*(?:"([^"]+)"|(\S+))/.exec(cmd || '');
  if (!m || !/\.exe$/i.test(m[1] || m[2])) return null;
  const ps = path.join(path.dirname(m[1] || m[2]), 'ps.exe');
  try { return fs.statSync(ps).isFile() ? ps : null; } catch { return null; }
}

async function scanPorts() {
  const scan = await (IS_MAC ? macScan() : winScan());
  if (!scan.ok) return scan;
  const data = scan.data;

  const procs = new Map();
  for (const p of data.p || []) procs.set(p.ProcessId, p);

  const sessionByPid = new Map();
  // ConPTY reports pid 0 until it has connected, so read it now rather than at spawn time.
  for (const [id, s] of sessions) {
    if (s.remoteId) continue;
    if (s.pty.pid) sessionByPid.set(s.pty.pid, { id, cwd: s.cwd, kind: s.kind });
  }

  // Not the Chats entry: it may be set to the home folder, which nearly every command line would match.
  const projectsByLength = state.projects.filter((p) => !p.chat && !p.remoteId).sort((a, b) => b.path.length - a.path.length);

  // Walks up the parent chain: { s } = the session it was started from, else { broken } = the process whose parent is
  // gone. Git Bash (MSYS) emulates fork/exec with new Windows processes and the one in between can exit, so a server
  // Claude's Bash tool started (`npx vite`) has a dead Windows parent; `msys` (its own ps) still knows the real one.
  const walk = (pid, msys) => {
    let cur = pid;
    for (let i = 0; i < 40 && cur; i++) {
      const s = sessionByPid.get(cur);
      if (s) return { s };
      const p = procs.get(cur);
      if (!p) return {};
      const next = parentPid(procs, p);
      if (next && (procs.has(next) || sessionByPid.has(next))) cur = next;
      else if (msys?.has(cur)) cur = msys.get(cur);
      else return { broken: next || p.ParentProcessId ? p : null };
    }
    return {};
  };

  // Ask MSYS only when a listener's chain breaks at one of its processes (ps.exe next to the exe), once per process table.
  let msys = procScan?.msys || null;
  if (!IS_MAC && !msys) {
    for (const c of data.c || []) {
      const { broken } = walk(c.OwningProcess);
      const ps = broken && msysPs(broken.CommandLine);
      if (!ps) continue;
      const out = await run(ps, ['-l'], { timeout: 5000 });
      msys = out ? parseMsysPs(out) : new Map();
      if (procScan) procScan.msys = msys;
      break;
    }
  }

  const ownerOf = (pid, cmd) => {
    // 1. Started from one of our terminals (walk up the parent chain).
    const { s } = walk(pid, msys);
    if (s) return { type: 'session', sessionId: s.id, projectPath: s.cwd, kind: s.kind };
    // 2. Its executable or a script argument points inside a known project folder (not just a --flag= value).
    const lower = withoutFlagValues(cmd);
    for (const pr of projectsByLength) {
      if (lower.includes(pr.path.toLowerCase())) return { type: 'project', projectPath: pr.path };
    }
    return null;
  };

  const byKey = new Map();
  for (const c of data.c || []) {
    const pid = c.OwningProcess;
    if (!pid || pid <= 4) continue;
    const proc = procs.get(pid);
    const name = proc?.Name || 'unknown';
    const key = `${pid}:${c.LocalPort}`;
    const loopback = c.LocalAddress === '127.0.0.1' || c.LocalAddress === '::1';
    const existing = byKey.get(key);
    if (existing) {
      // IPv4 + IPv6 listeners for the same port: exposed if any of them is.
      if (!loopback) existing.exposed = true;
      continue;
    }
    const owner = ownerOf(pid, proc?.CommandLine);
    byKey.set(key, {
      port: c.LocalPort,
      pid,
      name,
      cmd: proc?.CommandLine || '',
      exposed: !loopback,
      owner,
      dev: !!owner || DEV_PROCESSES.has(IS_MAC ? macDevName(name) : name.toLowerCase()),
    });
  }

  const servers = [...byKey.values()].sort((a, b) => a.port - b.port);
  return { ok: true, servers };
}

function listPorts() {
  // Never run two PowerShell scans at once; callers share the in-flight one.
  if (!portScan) portScan = scanPorts().finally(() => { portScan = null; });
  return portScan;
}

// ------------------------------------------------- sessions and usage ----
// Claude Code keeps one transcript per session at ~/.claude/projects/<cwd with non-alphanumerics -> "-">/<uuid>.jsonl.
// Transcripts reach several MB, so lists only read the tail (title, context) and results are cached by mtime+size.

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const TAIL_BYTES = 64 * 1024;
const WIDE_TAIL_BYTES = 1024 * 1024;
const HEAD_BYTES = 16 * 1024;

const projectDir = (cwd) => path.join(PROJECTS_DIR, path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-'));

async function readRange(file, start, length) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function readTail(file, size, bytes) {
  const start = Math.max(0, size - bytes);
  const text = await readRange(file, start, Math.min(size, bytes));
  return start > 0 ? text.slice(text.indexOf('\n') + 1) : text; // drop the partial first line
}

const sessionCache = new Map(); // file -> { sig, info }

async function readSession(file, st) {
  const sig = `${st.mtimeMs}:${st.size}`;
  const hit = sessionCache.get(file);
  if (hit?.sig === sig) return hit.info;

  let read = Math.min(st.size, TAIL_BYTES);
  let t = parseTail(await readTail(file, st.size, TAIL_BYTES));
  if (!t.usage && st.size > TAIL_BYTES) { // a huge tool result can push the last reply out of the tail
    read = Math.min(st.size, WIDE_TAIL_BYTES);
    t = parseTail(await readTail(file, st.size, WIDE_TAIL_BYTES));
  }

  let info = null;
  // Sessions that never got a reply or a title (only /model and friends) are noise.
  if (t.title || t.custom || t.usage || st.size > read) {
    let head = null;
    const readHead = async () => (head ??= await readRange(file, 0, Math.min(st.size, HEAD_BYTES)));
    // A /rename name wins over the AI title, as in Claude Code; one never re-appended is only in the head.
    const custom = t.custom || (st.size > read ? parseTail(await readHead()).custom : null);
    const title = oneLine(custom)
      || oneLine(t.title)
      || oneLine(firstPrompt(await readHead()))
      || oneLine(t.prompt)
      || 'Untitled session';
    info = {
      id: path.basename(file, '.jsonl'),
      title,
      mtime: Math.round(st.mtimeMs),
      last: t.last || Math.round(st.mtimeMs), // last message time: the sidebar's sort and "ago" (mtime is bumped by resume/exit)
      birth: Math.round(st.birthtimeMs),
      model: t.model,
      ctx: t.compacted ?? usageTokens(t.usage), // after a /compact with no reply yet: what it left, not the old size
    };
  }
  sessionCache.set(file, { sig, info });
  return info;
}

async function listSessions(cwd) {
  if (isRemote(cwd)) {
    const [history, runtimes] = await Promise.all([remoteCall(cwd, 'history'), remoteCall(cwd, 'live')]);
    const { project } = remoteProject(cwd);
    for (const r of runtimes.filter((r) => r.cwd === project.remotePath && r.alive)) {
      const found = r.sessionId && history.find((s) => s.id === r.sessionId);
      if (found) Object.assign(found, { runtimeId: r.handle, transcriptId: found.id, kind: r.kind });
      else history.unshift({ id: r.sessionId || r.handle, transcriptId: r.sessionId, runtimeId: r.handle, kind: r.kind,
        title: r.kind === 'shell' ? 'Shell (running remotely)' : 'New remote session', last: r.startedAt, birth: r.startedAt, mtime: r.startedAt });
    }
    return history;
  }
  const dir = projectDir(cwd);
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const rows = await Promise.all(names
    .filter((n) => n.endsWith('.jsonl') && UUID_RE.test(n.slice(0, -6)))
    .map(async (n) => {
      const file = path.join(dir, n);
      try { return await readSession(file, await fs.promises.stat(file)); } catch { return null; }
    }));
  return rows.filter(Boolean).sort((a, b) => b.last - a.last).slice(0, 200);
}

/**
 * First run: the folders of the most recently used Claude Code projects, newest first. Folder names in ~/.claude/projects
 * are lossy, so the path comes from the newest transcript's `cwd`. Home and the chat folder are chats, not projects; temp
 * folders are scratch.
 */
async function recentProjects(n = 3) {
  let dirs;
  try {
    dirs = (await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  const dated = await Promise.all(dirs.map(async (d) => {
    const dir = path.join(PROJECTS_DIR, d.name);
    try { return { dir, at: (await fs.promises.stat(dir)).mtimeMs }; } catch { return null; } // a new session bumps it
  }));
  const skip = [os.homedir(), chatDir(), defaultChatDir()];
  const out = [];
  for (const { dir } of dated.filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 30)) {
    if (out.length >= n) break;
    try {
      const files = await Promise.all((await fs.promises.readdir(dir))
        .filter((f) => f.endsWith('.jsonl') && UUID_RE.test(f.slice(0, -6)))
        .map(async (f) => ({ file: path.join(dir, f), st: await fs.promises.stat(path.join(dir, f)) })));
      const newest = files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)[0];
      if (!newest) continue;
      const cwd = transcriptCwd(await readRange(newest.file, 0, Math.min(newest.st.size, HEAD_BYTES)));
      if (!cwd || !isDir(cwd) || [...skip, ...out].some((x) => samePath(x, cwd))) continue;
      if (path.resolve(cwd).toLowerCase().startsWith(path.join(os.tmpdir(), path.sep).toLowerCase())) continue; // scratch folders
      out.push(path.resolve(cwd));
    } catch { /* skip this folder */ }
  }
  return out;
}

// Model, effort and subagents of one session, for the bar under the terminal. Effort is only in the transcript as
// /effort and /model output, so it falls back to the defaults in ~/.claude/settings.json. Subagents live in
// <session>/subagents/agent-*.jsonl with an agent-*.meta.json (type, description) next to each.
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const AGENT_STALE_MS = 10 * 60 * 1000; // an unfinished agent silent this long was cut off (session closed)

async function readJson(file) {
  try {
    return JSON.parse((await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

// Home screen stats: Claude Code's own /stats cache, re-read only when the file changes. `today` = the renderer's local
// date, for the streak. null when the file is missing or of a shape we don't know.
const STATS_FILE = path.join(os.homedir(), '.claude', 'stats-cache.json');
let statsCache = null; // { mtime, raw }
async function getStats(today) {
  try {
    const st = await fs.promises.stat(STATS_FILE);
    if (statsCache?.mtime !== st.mtimeMs) statsCache = { mtime: st.mtimeMs, raw: await readJson(STATS_FILE) };
    return summarizeStats(statsCache.raw, String(today || ''));
  } catch {
    return null;
  }
}

// The whole transcript, read once and then only its new lines: a tail would lose an /effort a few tool calls back and
// fall back to settings.json, which another tab's /model or /effort may have changed since.
const modelCache = new Map(); // file -> { off, value }, the newest 50 files
const MODEL_CHUNK = 1024 * 1024;
async function readModelEffort(file) {
  const st = await fs.promises.stat(file);
  let hit = modelCache.get(file);
  if (!hit || st.size < hit.off) hit = { off: 0, value: { model: null, effort: null, set: false } }; // new, or rewritten
  let { off, value } = hit;
  if (st.size > off) {
    const fh = await fs.promises.open(file, 'r');
    try {
      let carry = Buffer.alloc(0); // a line cut at the chunk's end; one still being written waits for the next poll
      for (let pos = off; pos < st.size;) {
        const buf = Buffer.alloc(Math.min(MODEL_CHUNK, st.size - pos));
        const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
        const nl = data.lastIndexOf(0x0a);
        if (nl < 0) { carry = data; continue; }
        value = parseModelEffort(data.toString('utf8', 0, nl + 1), value);
        carry = Buffer.from(data.subarray(nl + 1));
        off = pos - carry.length;
      }
    } finally {
      await fh.close();
    }
  }
  modelCache.delete(file);
  modelCache.set(file, { off, value });
  if (modelCache.size > 50) modelCache.delete(modelCache.keys().next().value);
  return value;
}

// A run's model is the one its replies carry, never the parent session's: big lines (screenshots, the prompt_snapshot
// appended at the end) can push every reply out of the tail, so the wide tail is read next and the last model seen is
// kept. `requested` is the Agent call's `model` from .meta.json ("haiku"), shown until the first reply.
const agentCache = new Map(); // file -> { sig, agent }
async function readAgent(dir, name) {
  const file = path.join(dir, name);
  const st = await fs.promises.stat(file);
  const sig = `${st.mtimeMs}:${st.size}`;
  const hit = agentCache.get(file);
  if (hit?.sig === sig) return hit.agent;
  const meta = (await readJson(file.replace(/\.jsonl$/, '.meta.json'))) || {};
  let tail = await readTail(file, st.size, TAIL_BYTES);
  let done = agentDone(tail);
  let model = lastModel(tail);
  if ((done == null || !model) && st.size > TAIL_BYTES) {
    tail = await readTail(file, st.size, WIDE_TAIL_BYTES);
    done = agentDone(tail);
    model = lastModel(tail);
  }
  const requested = oneLine(meta.model);
  const agent = {
    id: name.slice(6, -6),
    type: oneLine(meta.agentType) || 'agent',
    model: model || hit?.agent.model || null,
    requested: requested && requested !== 'inherit' ? requested : null,
    description: oneLine(meta.description),
    done: done === true,
    ctx: usageTokens(parseTail(tail).usage) || hit?.agent.ctx || 0, // each subagent has its own context window
    start: Math.round(st.birthtimeMs),
    mtime: Math.round(st.mtimeMs),
  };
  agentCache.set(file, { sig, agent });
  return agent;
}

function readSettingsSync() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

// ~/.claude/sessions/<pid>.json: Claude Code's record of each running interactive Claude, with the session it is on now.
// It changes on /resume and /clear, and /resume keeps writing to the old session's transcript, so no new file shows that
// switch (undocumented, seen on v2.1.304; without it the renderer falls back to guessing, matchSessions in lib/ui.js).
const LIVE_DIR = path.join(os.homedir(), '.claude', 'sessions');
const LIVE_TRIES = 15; // a tab whose record never shows stops costing process scans after this many

async function readLiveRecords() {
  let names;
  try {
    names = (await fs.promises.readdir(LIVE_DIR)).filter((n) => /^\d+\.json$/.test(n));
  } catch {
    return [];
  }
  return (await Promise.all(names.map((n) => readJson(path.join(LIVE_DIR, n))))).filter(Boolean);
}

// The processes on a tab's console (cmd.exe, Claude, its tools). node-pty forks a helper for it, so it runs only until
// the tab's Claude is found. Private API, like endSession's use of it.
function consolePids(s) {
  const agent = s.pty._agent;
  if (typeof agent?._getConsoleProcessList !== 'function') return Promise.resolve([]);
  return agent._getConsoleProcessList.call(agent).catch(() => []);
}

// tab id -> the session its Claude is on now. Its Claude's pid is found once (it stays the same across /resume and
// /clear), looked for only while a record not older than the tab and owned by no other tab exists; then each call reads
// one small file. On macOS a launcher may keep Claude in a child process instead of replacing itself.
async function liveSessions(ids) {
  const out = {};
  const taken = new Set([...sessions.values()].map((s) => s.claudePid).filter(Boolean));
  let records = null;
  let macProcs = null; // at most one ps per poll, only for tabs whose direct pty lookup missed
  for (const id of Array.isArray(ids) ? ids : []) {
    const s = sessions.get(id);
    if (!s || s.remoteId || s.kind !== 'claude' || s.ending) continue;
    if (!s.claudePid && (s.liveTries || 0) < LIVE_TRIES) {
      if (!records) records = await readLiveRecords();
      const fresh = records.filter((r) => !taken.has(r.pid) && (r.startedAt || 0) >= s.startedAt - 5000);
      if (fresh.length) {
        s.liveTries = (s.liveTries || 0) + 1;
        let pid;
        if (IS_MAC) {
          pid = liveRecord(fresh, [s.pty.pid], taken);
          if (!pid) {
            if (!macProcs) {
              const out = await run('/bin/ps', ['-axww', '-o', 'pid=,ppid=,etime=,args='], { timeout: 5000 });
              macProcs = parsePs(out || '', new Map(), Date.now()); // failure leaves the heuristic fallback in place
            }
            pid = liveRecord(fresh, descendantPids(macProcs, s.pty.pid), taken);
          }
        } else {
          pid = liveRecord(fresh, await consolePids(s), taken);
        }
        if (pid) { s.claudePid = pid; taken.add(pid); }
      }
    }
    if (!s.claudePid) continue;
    const r = await readJson(path.join(LIVE_DIR, `${s.claudePid}.json`));
    if (r?.pid === s.claudePid && typeof r.sessionId === 'string' && UUID_RE.test(r.sessionId)) out[id] = r.sessionId;
  }
  return out;
}

// `tabId`'s settings as its Claude started, not today's file: another tab's /model or /effort changes the file, not this
// session. A tab with no transcript yet reads the file, where a /model or /effort typed before the first prompt shows.
async function sessionInfo(cwd, sessionId, tabId) {
  if (isRemote(cwd)) return { model: null, effort: null, agents: [] };
  const started = sessionId ? sessions.get(tabId)?.settings : null;
  const settings = started || (await readJson(SETTINGS_FILE));
  let model = null;
  let effort = null;
  let set = false;
  let agents = [];
  if (typeof cwd === 'string' && typeof sessionId === 'string' && UUID_RE.test(sessionId)) {
    try {
      ({ model, effort, set } = await readModelEffort(path.join(projectDir(cwd), `${sessionId}.jsonl`)));
    } catch { /* no transcript yet */ }
    const dir = path.join(projectDir(cwd), sessionId, 'subagents');
    try {
      const names = (await fs.promises.readdir(dir)).filter((n) => /^agent-.+\.jsonl$/.test(n));
      agents = await Promise.all(names.map((n) => readAgent(dir, n).catch(() => null)));
    } catch { /* no subagents */ }
  }
  // The settings' "[1m]" only says how the session started: after a /model in it, the transcript knows better.
  model = (set ? model : withLongContext(model, settings?.model)) || settings?.model || null;
  // A bare alias from settings ("sonnet") has no version: use the one model of that family known in modelSettings.
  const alias = model && /^([a-z]+)(\[1m\])?$/i.exec(model);
  if (alias) {
    const ids = Object.keys(settings?.modelSettings || {}).filter((k) => k.startsWith(`claude-${alias[1].toLowerCase()}-`));
    if (ids.length === 1) model = ids[0] + (alias[2] || '');
  }
  effort = effort || defaultEffort(settings, model);
  const now = Date.now();
  // Only this tab's live Claude runs agents: none once it exited, and none from before it started (a resumed session's
  // runs that were cut off when the old process ended).
  const proc = sessions.get(tabId);
  agents = agents.filter(Boolean)
    .map((a) => ({ ...a, running: !a.done && !!proc && a.mtime >= proc.startedAt && now - a.mtime < AGENT_STALE_MS }))
    .sort((a, b) => b.start - a.start);
  return { model, effort, agents };
}

// Right sidebar data. MCP health comes from `claude mcp list` (the transcript does not store it): it health-checks every
// configured server (spawning every stdio one), so it is slow (seconds), cached per folder and never run twice at once.
// MCP config rarely changes mid-session, so the cache lives 5 minutes. Without a project (home screen) it runs in the home
// folder: user-level servers and claude.ai connectors. `force` skips the cache (refreshLogin). A failed run (timeout, claude
// not found yet) is retried after 30 s instead, or the section would say "Could not read" for 5 minutes.
const MCP_TTL_MS = 5 * 60 * 1000;
const MCP_RETRY_MS = 30 * 1000;
const mcpCache = new Map(); // cwd -> { at, value } | { pending }

function mcpList(cwd, force = false) {
  if (cwd == null) cwd = os.homedir();
  if (typeof cwd !== 'string' || !fs.existsSync(cwd)) return Promise.resolve({ ok: false, servers: [] });
  const hit = mcpCache.get(cwd);
  if (hit?.pending) return hit.pending;
  if (!force && hit && Date.now() - hit.at < (hit.value?.ok ? MCP_TTL_MS : MCP_RETRY_MS)) return Promise.resolve(hit.value);
  const [file, args] = IS_MAC ? ['claude', ['mcp', 'list']] : ['cmd.exe', ['/d', '/c', 'claude', 'mcp', 'list']];
  const pending = shellEnvReady.then(() => new Promise((resolve) => {
    const env = { ...process.env }; // after shellEnvReady, so macOS gets the login shell's PATH
    for (const k of STRIP_ENV) delete env[k];
    execFile(file, args,
      { cwd, env, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err && !stdout ? { ok: false, servers: [] } : { ok: true, servers: parseMcpList(stdout) }));
  })).then((value) => {
    mcpCache.set(cwd, { at: Date.now(), value });
    return value;
  });
  mcpCache.set(cwd, { ...hit, pending });
  return pending;
}

/** Subagents the user has defined: ~/.claude/agents/*.md and <project>/.claude/agents/*.md (frontmatter name + model). */
async function definedAgents(cwd) {
  const dirs = [path.join(os.homedir(), '.claude', 'agents')];
  if (typeof cwd === 'string') dirs.push(path.join(cwd, '.claude', 'agents'));
  const out = new Map();
  for (const dir of dirs) {
    let names;
    try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.md')); } catch { continue; }
    for (const n of names) {
      try {
        const { name, model } = parseAgentFile(await fs.promises.readFile(path.join(dir, n), 'utf8'), n);
        out.set(name, { name, model: oneLine(model) || 'inherit' }); // project agents override user ones
      } catch { /* unreadable file */ }
    }
  }
  return [...out.values()];
}

/**
 * What a subagent is told: the system prompt of its definition file (the body after the frontmatter), and the prompt each
 * run of this type in the session was given (first user line of its transcript). Both are capped, they can be long.
 */
const PROMPT_CAP = 20000;
async function agentPrompts(cwd, sessionId, name) {
  const out = { definition: null, runs: [] };
  if (typeof name !== 'string') return out;
  if (typeof cwd !== 'string') cwd = null; // home screen: user-level definitions only, no runs
  let defModel = null; // the definition's `model:`; a "[1m]" there (or, for inherit, the parent's) marks a 1M run of a 200k-by-default model
  const dirs = [cwd && path.join(cwd, '.claude', 'agents'), path.join(os.homedir(), '.claude', 'agents')].filter(Boolean); // project wins
  for (const dir of dirs) {
    let names;
    try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.md')); } catch { continue; }
    for (const n of names) {
      try {
        const def = parseAgentFile(await fs.promises.readFile(path.join(dir, n), 'utf8'), n);
        if (def.name !== name) continue;
        out.definition = def.body.slice(0, PROMPT_CAP);
        defModel = def.model;
        break;
      } catch { /* unreadable file */ }
    }
    if (out.definition != null) break;
  }
  if (cwd && typeof sessionId === 'string' && UUID_RE.test(sessionId)) {
    const dir = path.join(projectDir(cwd), sessionId, 'subagents');
    let configured = defModel;
    if (!configured || configured === 'inherit') {
      const parent = await readModelEffort(path.join(projectDir(cwd), `${sessionId}.jsonl`)).catch(() => ({}));
      const set = (await readJson(SETTINGS_FILE))?.model;
      configured = withLongContext(parent.model, set) || set || null;
    }
    try {
      const names = (await fs.promises.readdir(dir)).filter((n) => /^agent-.+\.jsonl$/.test(n));
      for (const n of names) {
        try {
          const file = path.join(dir, n);
          const meta = (await readJson(file.replace(/\.jsonl$/, '.meta.json'))) || {};
          if ((meta.agentType || 'agent') !== name) continue;
          const prompt = agentPrompt(await readRange(file, 0, 512 * 1024));
          const a = await readAgent(dir, n);
          out.runs.push({ id: a.id, description: a.description, prompt: prompt.slice(0, PROMPT_CAP), start: a.start, ctx: a.ctx,
            model: withLongContext(withLongContext(a.model, a.requested), configured) || a.requested });
        } catch { /* unreadable */ }
      }
    } catch { /* no subagents */ }
    out.runs.sort((a, b) => b.start - a.start);
  }
  return out;
}

// Images in a session (right sidebar): lib/images.js keeps an index of where each image's line sits in the transcript;
// thumbnails and full images are decoded from that byte range on demand.
const THUMB_KEEP = 100; // thumbnails cached across all sessions (LRU)
const THUMB_W = 320;
const thumbCache = new Map(); // `${file}|${id}` -> data URL or null, oldest first

const sessionFile = (cwd, sessionId) => (typeof cwd === 'string' && typeof sessionId === 'string' && UUID_RE.test(sessionId)
  ? path.join(projectDir(cwd), `${sessionId}.jsonl`) : null);
async function imagesList(cwd, sessionId) {
  const file = sessionFile(cwd, sessionId);
  try {
    const st = file && (await scanImages(file));
    if (!st) return { items: [] };
    const exists = (f) => (f ? fs.promises.stat(f).then(() => true, () => false) : false);
    return { items: await Promise.all(st.items.slice().reverse().map(async ({ id, kind, label, file: f }) => ({ id, kind, label, file: f, exists: await exists(f) }))) };
  } catch {
    return { items: [] };
  }
}

async function findImage(cwd, sessionId, id) {
  const file = sessionFile(cwd, sessionId);
  const st = file && (await scanImages(file));
  const it = st?.items.find((i) => i.id === id);
  return it ? { file, it } : null;
}

/** The image's { media_type, data }, re-read from its line's byte range. */
async function imageSource(file, it) {
  const b = JSON.parse(await readRange(file, it.off, it.len)).message.content[it.block];
  const src = (it.sub >= 0 ? b.content[it.sub] : b).source;
  return /^image\/[a-z0-9.+-]+$/i.test(src.media_type) ? src : null;
}

async function imageThumb(cwd, sessionId, id) {
  const f = await findImage(cwd, sessionId, id).catch(() => null);
  if (!f) return null;
  const key = `${f.file}|${id}`;
  if (thumbCache.has(key)) {
    const v = thumbCache.get(key);
    thumbCache.delete(key);
    thumbCache.set(key, v);
    return v;
  }
  let url = null; // GIF/WebP: nativeImage can't decode them, the tile stays a placeholder
  try {
    const src = await imageSource(f.file, f.it);
    const img = src && nativeImage.createFromBuffer(Buffer.from(src.data, 'base64'));
    if (img && !img.isEmpty()) {
      const { width, height } = img.getSize(); // shrink by the longer side, so a tall full-page screenshot gets small too
      const small = Math.max(width, height) <= THUMB_W ? img
        : img.resize({ ...(width >= height ? { width: THUMB_W } : { height: THUMB_W }), quality: 'good' });
      const px = small.toBitmap(); // BGRA: keep PNG when any pixel is transparent, JPEG would turn it black
      let alpha = false;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; }
      url = alpha ? small.toDataURL() : `data:image/jpeg;base64,${small.toJPEG(80).toString('base64')}`;
    }
  } catch { /* unreadable or changed line */ }
  thumbCache.set(key, url);
  if (thumbCache.size > THUMB_KEEP) thumbCache.delete(thumbCache.keys().next().value);
  return url;
}

async function imageFull(cwd, sessionId, id) {
  try {
    const f = await findImage(cwd, sessionId, id);
    const src = f && (await imageSource(f.file, f.it));
    return src ? `data:${src.media_type};base64,${src.data}` : null;
  } catch {
    return null;
  }
}

async function revealImage(cwd, sessionId, id) {
  const f = await findImage(cwd, sessionId, id).catch(() => null);
  if (f?.it.file && (await fs.promises.stat(f.it.file).then(() => true, () => false))) shell.showItemInFolder(path.normalize(f.it.file));
}

// Plan limits (session, weekly, per-model weekly) come from the same endpoint Claude Code's /usage reads, using the
// OAuth token Claude Code keeps in ~/.claude/.credentials.json. The token only goes to api.anthropic.com.
// Claude Code refreshes the token while it runs; we never write the credentials file.
const CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
let limitsCache = { at: 0, value: null };
let limitsFetch = null;

/**
 * On macOS Claude Code keeps the same JSON in the login Keychain instead of the file. Read only. A failed read (no item,
 * or the user denied/ignored the access dialog) is not retried for 10 minutes, so the dialog can't keep coming back.
 */
const KEYCHAIN_RETRY_MS = 10 * 60 * 1000;
let keychainFailedAt = 0;
function keychainOauth() {
  if (Date.now() - keychainFailedAt < KEYCHAIN_RETRY_MS) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }, (err, stdout) => {
      let oauth = null;
      try { oauth = err ? null : JSON.parse(stdout).claudeAiOauth; } catch { /* not JSON */ }
      if (!oauth?.accessToken) keychainFailedAt = Date.now();
      resolve(oauth);
    });
  });
}

const expired = (oauth) => !!oauth?.expiresAt && oauth.expiresAt < Date.now();

async function readOauth() {
  let oauth;
  try {
    oauth = JSON.parse((await fs.promises.readFile(CREDENTIALS_FILE, 'utf8')).replace(/^\uFEFF/, '')).claudeAiOauth;
  } catch { /* handled by the caller */ }
  // macOS: the Keychain is the live copy; a leftover file may hold a token that is no longer refreshed.
  if (IS_MAC && (!oauth?.accessToken || expired(oauth))) oauth = (await keychainOauth()) || oauth;
  return oauth;
}

/**
 * The access token lasts hours and only Claude Code refreshes it, so with no session running it expires. `claude mcp list`
 * refreshes it (tested on v2.1.296; `claude auth status` does not) and its result fills the home screen's MCP list anyway.
 * At most once per 10 minutes, so a broken login doesn't spawn claude on every poll.
 */
const LOGIN_RETRY_MS = 10 * 60 * 1000;
let loginRefreshAt = 0;
async function refreshLogin() {
  if (Date.now() - loginRefreshAt < LOGIN_RETRY_MS) return false;
  loginRefreshAt = Date.now();
  await mcpList(null, true);
  return true;
}

async function fetchLimits() {
  let oauth = await readOauth();
  if (expired(oauth) && (await refreshLogin())) oauth = await readOauth();
  if (!oauth?.accessToken) return { ok: false, error: 'Not signed in. Run claude and log in.' };
  if (expired(oauth)) return { ok: false, error: 'Login expired. Start a Claude session to refresh it.' };
  try {
    let res = await usageRequest(oauth);
    // Revoked before its expiry (a login elsewhere): same refresh, once.
    if (res.status === 401 && (await refreshLogin())) {
      const fresh = await readOauth();
      if (fresh?.accessToken && fresh.accessToken !== oauth.accessToken) res = await usageRequest(fresh);
    }
    if (!res.ok) {
      const ra = Number(res.headers.get('retry-after'));
      const retryAfter = Math.min(15 * 60, Math.max(30, ra > 0 ? ra : res.status === 429 ? 300 : 60));
      const error = res.status === 429
        ? `Usage rate limited, retrying in ${Math.ceil(retryAfter / 60)} min`
        : `Usage request failed (${res.status})`;
      return { ok: false, status: res.status, error, retryAfter };
    }
    const j = await res.json();
    const limits = (j.limits || []).map((l) => ({
      kind: l.kind,
      label: l.kind === 'session' ? 'Session' : l.kind === 'weekly_all' ? 'Weekly' : l.scope?.model?.display_name || 'Weekly (model)',
      percent: Math.round(l.percent),
      resetsAt: Date.parse(l.resets_at) || null,
    }));
    return { ok: true, limits, fetchedAt: Date.now() };
  } catch {
    return { ok: false, error: 'Could not reach Anthropic (offline?)', retryAfter: 30 };
  }
}

function usageRequest(oauth) {
  return fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${oauth.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(8000),
  });
}

// Cached for 2 min; overlapping calls share one request. A failure (429 above all) blocks new requests for its
// Retry-After, otherwise our own retries keep the rate limit from ever clearing. Meanwhile the last good numbers are
// served (stale) instead of an error.
let limitsGood = null;
let limitsBlockedUntil = 0;
function getLimits() {
  const now = Date.now();
  if (limitsCache.value?.ok && now - limitsCache.at < 120000) return Promise.resolve(limitsCache.value);
  if (now < limitsBlockedUntil) return Promise.resolve(limitsGood ? { ...limitsGood, stale: true } : limitsCache.value);
  if (!limitsFetch) {
    limitsFetch = fetchLimits().then((v) => {
      if (v.ok) { limitsGood = v; limitsBlockedUntil = 0; limitsCache = { at: Date.now(), value: v }; return v; }
      if (v.retryAfter) limitsBlockedUntil = Date.now() + v.retryAfter * 1000;
      limitsCache = { at: Date.now(), value: v };
      return limitsGood ? { ...limitsGood, stale: true } : v;
    }).finally(() => { limitsFetch = null; });
  }
  return limitsFetch;
}

// ---------------------------------------------------------------- update ----
// The app is installed by cloning the repo; there is no auto-update. The footer's Update button (shown when the
// branch's upstream has new commits) pulls, runs npm install (always, see applyUpdate) and restarts. A packaged build
// is locked while it runs, so it hands over to scripts/update.* and quits (startExternalUpdate).

/** stdout and stderr of a command, never rejects. */
function runFull(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim() });
    });
  });
}

// Never let git open a credential prompt or window from the background check.
const gitEnv = () => ({ ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });

/**
 * The checkout the app runs from: the app folder (npm start), or the repo above dist/ for a packaged build. A macOS
 * build moved out of the clone (install.sh puts it in ~/Applications, where Spotlight finds it) uses the clone path
 * that `npm run package:mac` wrote into its package.json (`stanzaRepo`).
 */
let repoDirCache;
function repoDir() {
  if (repoDirCache !== undefined) return repoDirCache;
  repoDirCache = null;
  const isRepo = (dir) => {
    try {
      return fs.existsSync(path.join(dir, '.git')) && JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'stanza';
    } catch { return false; } // no package.json here
  };
  let dir = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
  for (let i = 0; i < 8; i++) {
    if (isRepo(dir)) return (repoDirCache = dir);
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (IS_MAC && app.isPackaged) {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')).stanzaRepo;
      if (typeof saved === 'string' && path.isAbsolute(saved) && isRepo(saved)) repoDirCache = saved;
    } catch { /* an older build: no saved path */ }
  }
  return repoDirCache;
}

let updateCheck = null;
function checkUpdate() { // overlapping calls share one fetch
  if (updateCheck) return updateCheck;
  updateCheck = (async () => {
    const dir = repoDir();
    if (!dir) return { available: false, error: "This copy isn't a git clone, so it can't check for updates." };
    const env = gitEnv();
    const fetched = await runFull('git', ['-C', dir, 'fetch', '--quiet'], { env, timeout: 30000 });
    if (!fetched.ok) return { available: false, error: (fetched.err || fetched.out || 'git fetch failed').trim().split('\n')[0].slice(0, 160) };
    const behind = parseInt((await runFull('git', ['-C', dir, 'rev-list', '--count', 'HEAD..@{u}'], { env })).out, 10) || 0;
    // What's new, for the popup: the newest few commit subjects.
    const log = behind ? (await runFull('git', ['-C', dir, 'log', '--format=%s', '-n', '5', 'HEAD..@{u}'], { env })).out : '';
    return { available: behind > 0, behind, packaged: app.isPackaged, subjects: log ? log.split('\n').map((s) => s.trim().slice(0, 120)).filter(Boolean) : [] };
  })().finally(() => { updateCheck = null; });
  return updateCheck;
}

/**
 * A built copy is locked while it runs, so scripts/update.ps1 (update.sh on macOS) does the work after we quit: it waits
 * for the app to close, pulls, runs npm install, rebuilds and reopens the app. No window on either platform: the output
 * goes to <userData>/update.log, which opens in Notepad (TextEdit on macOS) on failure. The script runs from a temp
 * copy because git pull may rewrite it.
 */
async function startExternalUpdate(dir) {
  try {
    const name = IS_MAC ? 'update.sh' : 'update.ps1';
    const tmp = path.join(os.tmpdir(), `stanza-${name}`);
    fs.copyFileSync(path.join(dir, 'scripts', name), tmp);
    const log = path.join(app.getPath('userData'), 'update.log');
    if (IS_MAC) {
      await shellEnvReady; // git and npm from the login shell's PATH
      const bundle = path.resolve(process.execPath, '..', '..', '..'); // .../Stanza.app/Contents/MacOS/Stanza
      const child = spawn('/bin/bash', [tmp, dir, String(process.pid), bundle, log], { detached: true, stdio: 'ignore', env: process.env });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
    } else {
      // A hidden PowerShell starts the script in a console that is hidden from the start (Start-Process -WindowStyle
      // Hidden), so no window flashes. Spawned directly with detached (no console), PowerShell 5.1 exits at once, and a
      // plain child would die with the app (Node's job object); the grandchild breaks away from that job. We wait for
      // the launcher to exit before quitting. cwd outside dist\: the app's own cwd (win-unpacked, from the shortcuts)
      // would be inherited and block electron-builder's rmdir.
      const q = (s) => `'"${String(s).replace(/'/g, "''")}"'`; // a PowerShell string holding a double-quoted argument
      const script = `Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $env:TEMP -ArgumentList @(`
        + `'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ${q(tmp)}, '-Repo', ${q(dir)}, '-AppPid', '${process.pid}',`
        + ` '-Exe', ${q(process.execPath)}, '-Log', ${q(log)})`;
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore', cwd: os.tmpdir() });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('the launcher did not finish')); }, 20000);
        child.once('error', (err) => { clearTimeout(timer); reject(err); });
        child.once('exit', (code) => { clearTimeout(timer); code ? reject(new Error(`the launcher exited with code ${code}`)) : resolve(); });
      });
    }
  } catch (err) {
    return { ok: false, error: `Could not start the updater: ${err.message}\nClose the app and run git pull, then ${IS_MAC ? 'npm run package:mac' : 'npm run package'} in ${dir}.` };
  }
  // Nothing is on screen while the script works, so say why the app is gone (the toast outlives the app).
  notify({ title: 'Updating Stanza', body: 'It reopens by itself when the update is built, usually in a minute or two.' });
  forceClose = true;
  app.quit(); // before-quit ends the sessions; the script reopens the app when it is done
  return { ok: true };
}

async function applyUpdate() {
  const dir = repoDir();
  if (!dir) return { ok: false, error: 'This copy is not inside a git checkout of Stanza, so it cannot update itself.' };
  if (app.isPackaged) return startExternalUpdate(dir);
  await shellEnvReady; // macOS: npm on the login shell's PATH
  const env = gitEnv();
  // npm install rewrites the lockfile; a dirty one would make the pull abort. It is generated, so drop local changes
  // (from HEAD, so a staged copy goes too).
  await runFull('git', ['-C', dir, 'checkout', 'HEAD', '--', 'package-lock.json'], { env });
  const pull = await runFull('git', ['-C', dir, 'pull', '--ff-only'], { env, timeout: 60000 });
  if (!pull.ok) return { ok: false, error: pull.err || 'git pull failed.' };
  // Always, not only when package(-lock).json changed: an npm install that failed in an earlier update would never be
  // retried (HEAD has moved on). With nothing to change it touches no files, so the running Electron is no obstacle.
  const [file, args] = IS_MAC ? ['npm', ['install']] : ['cmd.exe', ['/d', '/c', 'npm', 'install']];
  const npm = await runFull(file, args, { cwd: dir, timeout: 600000 });
  if (!npm.ok) {
    const tail = npm.err.split('\n').slice(-4).join('\n');
    return { ok: false, error: `Pulled the update, but npm install failed. Close the app and run npm install in ${dir}.\n${tail}` };
  }
  forceClose = true;
  app.relaunch();
  app.quit(); // before-quit ends the sessions
  return { ok: true };
}

// --------------------------------------------------------------- window ----

let mainWindow = null;
let forceClose = false;

/** Saved bounds, or none when no display shows enough of them (the monitor they were on was unplugged). */
function visibleBounds(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return b;
  try {
    const wa = screen.getDisplayMatching(b).workArea;
    const w = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x);
    const h = Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y);
    if (w >= 100 && h >= 40) return b;
    return { width: Math.min(b.width, wa.width), height: Math.min(b.height, wa.height) }; // no x/y: centred on the primary display
  } catch {
    return b;
  }
}

// Appearance (settings page). The renderer's CSS follows prefers-color-scheme, which nativeTheme.themeSource drives,
// so 'system' needs no code of its own. ui.claude swaps in Claude desktop's palette for whichever scheme that resolves
// to (claude-dark / claude-light). These literals paint before CSS loads: keep them equal to --background (and
// --muted-foreground for the window buttons) of each theme (DESIGN.md sync point).
const THEMES = ['dark', 'light', 'system'];
const ACCENTS = ['blue', 'violet', 'teal', 'rose'];
const CHROME = {
  dark: { bg: '#0a0a0a', symbol: '#a1a1a1' }, light: { bg: '#ffffff', symbol: '#525252' },
  'claude-dark': { bg: '#262624', symbol: '#c2c0b6' }, 'claude-light': { bg: '#faf9f5', symbol: '#5e5d59' },
};
const chrome = () => CHROME[(state.ui.claude ? 'claude-' : '') + (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')];
// Window zoom (ui.zoom, Settings > Appearance / Ctrl+= outside a terminal). The window buttons are sized in screen
// pixels, not page pixels, so they follow it: the overlay stays 1 px short of the zoomed 40 px top bar.
const zoom = () => Math.min(2, Math.max(0.5, Number(state.ui.zoom) || 1));
const overlayH = () => Math.round(40 * zoom()) - 1;

function applyTheme() {
  if (state.ui.theme === 'claude') Object.assign(state.ui, { theme: 'dark', claude: true }); // a short-lived theme id
  if (!THEMES.includes(state.ui.theme)) state.ui.theme = 'dark';
  if (!ACCENTS.includes(state.ui.accent)) state.ui.accent = 'blue';
  if (nativeTheme.themeSource !== state.ui.theme) nativeTheme.themeSource = state.ui.theme;
  applyChrome();
}

/** Window background and (Windows) the title bar buttons' colors for the resolved theme. */
function applyChrome() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const c = chrome();
  try {
    mainWindow.setBackgroundColor(c.bg);
    if (!IS_MAC) mainWindow.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: overlayH() });
  } catch { /* older Electron or no overlay: cosmetic only */ }
}

function applyZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.setZoomFactor(zoom());
  applyChrome();
  if (IS_MAC) {
    try { mainWindow.setWindowButtonPosition({ x: 14, y: Math.round(13 + 20 * (zoom() - 1)) }); } catch { /* cosmetic only */ }
  }
}

function createWindow() {
  const b = visibleBounds(state.bounds);
  mainWindow = new BrowserWindow({
    width: b?.width ?? 1440,
    height: b?.height ?? 900,
    x: b?.x,
    y: b?.y,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: chrome().bg, // = --background (DESIGN.md sync point)
    title: 'Stanza',
    icon: ICON,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 14, y: Math.round(13 + 20 * (zoom() - 1)) } } // centred in the 40 px top row; #brand leaves room (body.mac in styles.css)
      : { titleBarOverlay: { color: chrome().bg, symbolColor: chrome().symbol, height: overlayH() } }), // sits on the top bar (--background), 1 px short so the bar's border-bottom (row 40) runs under it to the edge
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: zoom(),
      additionalArguments: state.ui.claude ? ['--stanza-claude'] : [], // preload's initialClaude: first paint in Claude colors
    },
  });
  if (state.maximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // External links open in the real browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  mainWindow.webContents.on('before-input-event', (e, input) => {
    const devtools = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')
      || (IS_MAC && input.meta && input.alt && input.code === 'KeyI');
    if (devtools && input.type === 'keyDown') mainWindow.webContents.toggleDevTools();
  });

  const rememberBounds = () => {
    if (mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    state.maximized = mainWindow.isMaximized();
    if (!state.maximized) state.bounds = mainWindow.getBounds();
  };

  mainWindow.on('close', (e) => {
    rememberBounds();
    saveState();
    if (forceClose || sessions.size === 0) return;
    const wc = mainWindow.webContents;
    if (wc.isCrashed() || wc.isLoading()) return; // nobody to ask
    // The renderer knows what is actually busy; it replies with `app:quit` if it is fine to go.
    e.preventDefault();
    send('app:close-request');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  // Full screen hides the traffic lights, so #brand gives back the room it keeps for them (body.fullscreen, styles.css)
  if (IS_MAC) {
    mainWindow.on('enter-full-screen', () => send('win:fullscreen', true));
    mainWindow.on('leave-full-screen', () => send('win:fullscreen', false));
  }
}

// A background session needs input or finished (the renderer decides when). Clicking brings the window to the front on
// that tab. (Toast-XML launch arguments + Notification.handleActivation, for clicks in Notification Center after the
// toast is gone, delivered no clicks at all in testing, so this sticks to the plain click event.)
const liveNotes = new Set(); // shown notifications stay referenced: a garbage-collected one loses its click handler

/** Show, un-minimize and focus the window, then switch to the tab (if it still exists). */
function showFromNotification(tabId) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  if (IS_MAC) {
    app.focus({ steal: true });
  } else {
    // Windows may refuse focus() to a background window and flash the taskbar instead; topmost for a moment wins.
    win.setAlwaysOnTop(true);
    win.focus();
    win.setAlwaysOnTop(false);
  }
  win.focus();
  if (tabId) send('notify:click', tabId);
}

function notify(msg) {
  try {
    if (!Notification.isSupported()) return;
    const title = String(msg?.title || '').slice(0, 120);
    const body = String(msg?.body || '').slice(0, 240);
    const tabId = typeof msg?.tabId === 'string' ? msg.tabId : '';
    const n = new Notification({ title, body });
    const drop = () => liveNotes.delete(n);
    liveNotes.add(n);
    n.on('click', () => { drop(); showFromNotification(tabId); });
    n.on('close', drop);
    n.on('failed', (_e, err) => { drop(); console.error('Notification failed:', err); });
    n.show();
  } catch (err) {
    console.error('Notification failed:', err); // e.g. macOS permission denied: never break the app over it
  }
}

/** Code.exe: the per-user or system install, else next to the `code.cmd` shim on PATH (it lives in <install>\bin). */
function findVsCode() {
  const dirs = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code'),
    path.join(process.env.ProgramFiles || '', 'Microsoft VS Code'),
    ...(process.env.PATH || '').split(';').filter((d) => d && fs.existsSync(path.join(d, 'code.cmd'))).map((d) => path.dirname(d)),
  ];
  return dirs.map((d) => path.join(d, 'Code.exe')).find((f) => fs.existsSync(f)) || null;
}

/** A NUL byte in the first 8 KB = binary (image, video, PDF, Office...), the same test git uses. */
function isBinaryFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8192);
    return buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).includes(0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* already closed */ }
  }
}

/**
 * Open a text file in VS Code at a line (`code -g file:line:col`); binary files (photos, videos, PDFs...) and text files
 * without VS Code go to the default app. Windows: Code.exe takes the same arguments as the code.cmd shim. macOS: the
 * `code` CLI from the login shell's PATH, else `open -a` (no line), else open.
 */
async function openFileAt(file, line, col) {
  try {
    if (typeof file !== 'string' || !fs.statSync(file).isFile()) return { ok: false, error: 'File not found' };
  } catch {
    return { ok: false, error: 'File not found' };
  }
  if (isBinaryFile(file)) {
    const err = await shell.openPath(file);
    return err ? { ok: false, error: err } : { ok: true };
  }
  const n = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const target = [file, n(line), n(line) && n(col)].filter(Boolean).join(':');
  const start = (exe, args) => new Promise((resolve) => {
    // No windowsHide (see shell:openInCode): VS Code's first window would start hidden.
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('spawn', () => { child.unref(); resolve(true); });
  });
  if (IS_MAC) {
    await shellEnvReady;
    const ok = await new Promise((resolve) => execFile('code', ['-g', target], (err) => resolve(!err)));
    if (ok) return { ok: true };
    const opened = await new Promise((resolve) => execFile('/usr/bin/open', ['-a', 'Visual Studio Code', file], (err) => resolve(!err)));
    if (opened) return { ok: true };
  } else {
    const exe = findVsCode();
    if (exe && (await start(exe, ['-g', target]))) return { ok: true };
  }
  const err = await shell.openPath(file);
  return err ? { ok: false, error: err } : { ok: true };
}

// A folder passed on the command line: `stanza.exe C:\some\project`.
// In dev the app's own folder ("electron .") is also an argument, so skip that one.
function pathFromArgv(argv) {
  const self = path.resolve(app.getAppPath()).toLowerCase();
  const candidates = argv.slice(1).filter(
    (a) => !a.startsWith('-') && isDir(a) && path.resolve(a).toLowerCase() !== self
  );
  return candidates[candidates.length - 1];
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const p = pathFromArgv(argv);
    if (p) send('open-path', addProject(p));
  });

  app.whenReady().then(async () => {
    loadState();
    if (firstRun) { // a new user starts with their recent Claude Code projects (and so their sessions), the newest open
      const recent = await recentProjects().catch(() => []);
      recent.forEach(addProject);
      if (recent.length) { state.ui.expanded = [recent[0]]; saveState(); }
    }
    registerIpc();
    if (!IS_MAC) registerToastIdentity();
    // macOS: Electron's default menu binds Cmd+W, Cmd+R and Cmd+=/- (our shortcuts). Keep Quit/Hide and the Edit roles,
    // which give Cmd+C/V/A to the terminal and to inputs. Windows keeps its default menu (hidden with the title bar).
    if (IS_MAC) Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
    applyTheme(); // before the window, so its first paint and the page's prefers-color-scheme are right
    nativeTheme.on('updated', applyChrome); // 'system' follows the OS switching light/dark
    createWindow();
    const p = pathFromArgv(process.argv);
    if (p) {
      const abs = addProject(p);
      mainWindow.webContents.once('did-finish-load', () => send('open-path', abs));
    }
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (e) => {
  // macOS Cmd+Q / Dock Quit call app.quit() with the window still open: close it first, so its 'close' handler asks the
  // renderer (busy tabs) and only a confirmed quit (forceClose) ends the sessions; ending them here first left "Keep open" with dead tabs
  if (!forceClose && sessions.size && mainWindow && !mainWindow.isDestroyed()) {
    e.preventDefault();
    mainWindow.close();
    return;
  }
  for (const s of sessions.values()) endSession(s);
  remote?.close();
});

// ------------------------------------------------------- markdown reader ----
// The right sidebar's markdown tabs (renderer.js parses with lib/md.js and builds the page). Reads only .md / .markdown
// files, images only by image extension; the renderer never gets anything else from these. Open files are watched
// through their folder (editors and Claude may replace a file, which ends a watch on the file itself); a change is
// sent as `md:changed` after 150 ms of quiet, and the renderer re-reads the file. The editor writes back (md:write) only
// to a markdown file that already exists.
const MD_RE = /\.(?:md|markdown)$/i;
const MD_MAX = 2 * 1024 * 1024;
const DOC_IMAGE_MAX = 10 * 1024 * 1024;
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };

async function readDoc(file) {
  if (typeof file !== 'string' || !MD_RE.test(file)) return { ok: false, error: 'Not a markdown file' };
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile()) return { ok: false, error: 'File not found' };
    if (st.size > MD_MAX) return { ok: false, error: `Too large to show here (${(st.size / 1048576).toFixed(1)} MB). Open it in VS Code instead.` };
    return { ok: true, text: await fs.promises.readFile(file, 'utf8') };
  } catch {
    return { ok: false, error: 'File not found' };
  }
}

/** The editor's autosave: only an existing markdown file, written in place (keeps its mode, and works while another editor has it open). */
async function writeDoc(file, text) {
  if (typeof file !== 'string' || !MD_RE.test(file) || typeof text !== 'string') return { ok: false, error: 'Not a markdown file' };
  if (Buffer.byteLength(text) > MD_MAX) return { ok: false, error: 'Too large to save here' };
  try {
    if (!(await fs.promises.stat(file)).isFile()) return { ok: false, error: 'File not found' };
    await fs.promises.writeFile(file, text, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.code === 'ENOENT' ? 'File not found' : `Could not save (${e.code || e.message})` };
  }
}

/** A link or image path in a markdown file -> the absolute path it names (relative to that file's folder), else null. */
function docTarget(base, href) {
  if (typeof base !== 'string' || typeof href !== 'string' || !href || href.length > 2000) return null;
  try {
    let p = href;
    if (/^file:/i.test(p)) p = require('url').fileURLToPath(p);
    else try { p = decodeURIComponent(p); } catch { /* keep it as written */ }
    return path.resolve(path.dirname(base), p);
  } catch {
    return null;
  }
}

async function resolveDocLink(base, href) {
  const abs = docTarget(base, href);
  return abs && (await fs.promises.stat(abs).then((st) => st.isFile(), () => false)) ? abs : null;
}

async function docImage(base, src) {
  const abs = docTarget(base, src);
  const type = abs && IMAGE_TYPES[path.extname(abs).slice(1).toLowerCase()];
  if (!type) return null;
  try {
    const st = await fs.promises.stat(abs);
    if (!st.isFile() || st.size > DOC_IMAGE_MAX) return null;
    return `data:${type};base64,${(await fs.promises.readFile(abs)).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The Docs section: markdown files this session wrote or edited (newest first, still on disk), and the project's top-level ones. */
async function docsList(cwd, sessionId) {
  const out = { session: [], project: [] };
  if (typeof cwd !== 'string') return out;
  try {
    const file = sessionFile(cwd, sessionId);
    const st = file && (await scanImages(file));
    if (st) {
      const list = [...st.docs.keys()].reverse().map((f) => path.resolve(cwd, f));
      const ok = await Promise.all(list.map((f) => fs.promises.stat(f).then((s) => s.isFile(), () => false)));
      out.session = list.filter((_, i) => ok[i]);
    }
  } catch { /* no transcript yet */ }
  try {
    const rank = (n) => (/^claude\.md$/i.test(n) ? 0 : /^readme\.md$/i.test(n) ? 1 : 2);
    out.project = (await fs.promises.readdir(cwd, { withFileTypes: true }))
      .filter((d) => d.isFile() && MD_RE.test(d.name)).map((d) => d.name)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .slice(0, 30).map((n) => path.join(cwd, n));
  } catch { /* folder gone */ }
  return out;
}

const docWatchers = new Map(); // folder (lower case) -> { watcher, names: Map(lower-case file name -> path), timers: Map(path -> timeout) }
function watchDocs(files) {
  const want = new Map();
  for (const f of (Array.isArray(files) ? files : []).slice(0, 1000)) {
    if (typeof f !== 'string' || !MD_RE.test(f)) continue;
    const dir = path.dirname(f);
    const k = dir.toLowerCase();
    if (!want.has(k)) want.set(k, { dir, names: new Map() });
    want.get(k).names.set(path.basename(f).toLowerCase(), f);
  }
  for (const [k, w] of docWatchers) {
    if (want.has(k)) continue;
    w.watcher.close();
    for (const t of w.timers.values()) clearTimeout(t);
    docWatchers.delete(k);
  }
  for (const [k, { dir, names }] of want) {
    const w = docWatchers.get(k);
    if (w) { w.names = names; continue; }
    try {
      const watcher = fs.watch(dir, { persistent: false }, (_ev, name) => docChanged(k, name));
      watcher.on('error', () => { watcher.close(); docWatchers.delete(k); });
      docWatchers.set(k, { watcher, names, timers: new Map() });
    } catch { /* folder gone: nothing to watch */ }
  }
}
function docChanged(k, name) {
  const w = docWatchers.get(k);
  if (!w) return;
  // macOS may report no file name: then every open file in that folder is re-read
  const files = name ? [w.names.get(String(name).toLowerCase())].filter(Boolean) : [...w.names.values()];
  for (const f of files) {
    clearTimeout(w.timers.get(f));
    w.timers.set(f, setTimeout(() => { w.timers.delete(f); send('md:changed', f); }, 150));
  }
}

// ------------------------------------------------------------------ ipc ----

function registerIpc() {
  ipcMain.handle('state:get', () => ({ projects: state.projects, remotes: state.remotes, remoteStatuses, ui: state.ui, restore: restorableTabs(), docs: restorableDocs(), chat: chatInfo(), user: userName() }));
  ipcMain.handle('remote:add', async (_e, value) => {
    try {
      const endpoint = remoteTarget(value?.target, value?.port);
      const device = { ...endpoint, id: crypto.randomUUID(), name: deviceName(value.name || value.target), enabled: true };
      const info = await checkRemoteDevice(device);
      Object.assign(device, { home: info.home, user: info.user, hostname: info.hostname });
      state.remotes.push(device); saveState();
      return { ok: true, remotes: state.remotes, device, info };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('remote:update', async (_e, id, value) => {
    try {
      const d = state.remotes.find((d) => d.id === id);
      if (!d) throw Error('Remote device not found');
      if (value?.name !== undefined) d.name = deviceName(value.name);
      if (typeof value?.enabled === 'boolean') {
        d.enabled = value.enabled;
        saveState(); // persist off before stopping SSH so polling cannot reconnect it
        if (!d.enabled) {
          remoteManager().disconnect(d);
          for (const s of sessions.values()) if (s.remoteId === id) endSession(s);
        } else {
          await checkRemoteDevice(d, true);
        }
      }
      saveState();
      return { ok: true, remotes: state.remotes, remoteStatuses };
    } catch (e) { return { ok: false, error: e.message, remotes: state.remotes, remoteStatuses }; }
  });
  ipcMain.handle('remote:dirs', async (_e, id, folder) => {
    try {
      const device = state.remotes.find((d) => d.id === id);
      if (!device) throw Error('Remote device not found');
      return { ok: true, ...await deviceCall(device, 'dirs', { path: folder }) };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('remote:project', async (_e, id, folder, name) => {
    try {
      const device = state.remotes.find((d) => d.id === id);
      if (!device) throw Error('Remote device not found');
      const value = await deviceCall(device, 'dirs', { path: folder });
      const key = remoteKey(id, value.path);
      if (!state.projects.some((p) => p.path === key)) state.projects.push({ path: key, remoteId: id, remotePath: value.path, name: String(name || path.posix.basename(value.path) || value.path).slice(0, 120) });
      saveState(); return { ok: true, projects: state.projects, added: [key] };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('remote:mkdir', async (_e, id, folder, name) => {
    try {
      const device = state.remotes.find((d) => d.id === id);
      if (!device) throw Error('Remote device not found');
      return { ok: true, ...await deviceCall(device, 'mkdir', { path: folder, name }) };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('remote:reconnect', async (_e, id) => {
    try {
      const d = state.remotes.find((d) => d.id === id);
      if (!d) throw Error('Remote device not found');
      const info = await checkRemoteDevice(d, true);
      return { ok: true, info };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('remote:runtime', async (_e, key, handle, action) => {
    try {
      if (!UUID.test(handle)) throw Error('Invalid runtime');
      if (action === 'end') return { ok: true, ...await remoteCall(key, 'terminate', { handle }) };
      const rows = await remoteCall(key, 'live');
      return { ok: true, runtime: rows.find((r) => r.handle === handle) || null };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.on('tabs:set', (_e, payload) => saveTabs(payload));
  ipcMain.on('docs:set', (_e, payload) => saveDocs(payload));

  ipcMain.handle('projects:add', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Add a project folder',
      properties: ['openDirectory', 'multiSelect'],
    });
    const added = r.canceled ? [] : r.filePaths.map(addProject).filter(Boolean);
    return { projects: state.projects, added };
  });

  ipcMain.handle('projects:chat', () => chatProject());
  ipcMain.handle('chat:pickDir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Folder for chats', defaultPath: chatDir(), properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : setChatDir(r.filePaths[0]);
  });
  ipcMain.handle('chat:resetDir', () => setChatDir(null));

  ipcMain.handle('projects:reorder', (_e, paths) => {
    if (!Array.isArray(paths)) return state.projects;
    const rank = (p) => { const i = paths.findIndex((x) => typeof x === 'string' && samePath(x, p.path)); return i < 0 ? Infinity : i; };
    state.projects = state.projects.map((p, i) => [p, i]).sort((a, b) => !!b[0].chat - !!a[0].chat || rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([p]) => p);
    saveState();
    return state.projects;
  });

  ipcMain.handle('projects:remove', (_e, p) => {
    state.projects = state.projects.filter((x) => !samePath(x.path, p));
    saveState();
    return state.projects;
  });

  ipcMain.handle('ui:set', (_e, patch) => {
    for (const k of Object.keys(defaults.ui)) {
      if (k !== 'expanded' && k !== 'collapsed' && k !== 'keys' && typeof patch?.[k] === typeof defaults.ui[k]) state.ui[k] = patch[k];
    }
    if (patch?.keys && typeof patch.keys === 'object' && !Array.isArray(patch.keys)) {
      const keys = {};
      for (const [id, list] of Object.entries(patch.keys).slice(0, 50)) {
        if (/^[A-Za-z]{1,40}$/.test(id) && Array.isArray(list)) {
          keys[id] = list.filter((c) => typeof c === 'string' && c.length <= 60).slice(0, 8);
        }
      }
      state.ui.keys = keys;
    }
    if (Array.isArray(patch?.collapsed)) {
      state.ui.collapsed = patch.collapsed.filter((k) => typeof k === 'string').slice(0, 20);
    }
    if (Array.isArray(patch?.expanded)) {
      state.ui.expanded = patch.expanded.filter((p) => typeof p === 'string').slice(0, 200);
    }
    state.ui.fontSize = Math.min(24, Math.max(10, Math.round(state.ui.fontSize) || 14));
    state.ui.rsideDocPct = Math.min(75, Math.max(20, Math.round(state.ui.rsideDocPct * 10) / 10 || 40));
    state.ui.zoom = zoom();
    if (patch?.theme || patch?.accent || typeof patch?.claude === 'boolean') applyTheme();
    if (patch?.zoom) applyZoom();
    saveState();
  });

  ipcMain.handle('pty:create', (_e, opts) => isRemote(opts?.cwd) ? createRemoteSession(opts) : (IS_MAC ? shellEnvReady.then(() => createSession(opts)) : createSession(opts)));
  ipcMain.handle('pty:detach', async (_e, id) => {
    const s = sessions.get(id);
    if (!s?.remoteId) return { ok: true };
    endSession(s);
    let timer;
    const ok = await Promise.race([s.closed.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), 5000); })]);
    clearTimeout(timer); return { ok, error: ok ? null : 'SSH attachment did not close. Try again.' };
  });
  const live = (id) => { const s = sessions.get(id); return s && !s.ending ? s : null; }; // not one endSession is closing
  ipcMain.on('pty:write', (_e, id, data) => live(id)?.pty.write(data));
  ipcMain.on('pty:resize', (_e, id, cols, rows) => {
    try { live(id)?.pty.resize(Math.max(cols, 2), Math.max(rows, 2)); } catch { /* exited */ }
  });
  ipcMain.on('pty:kill', (_e, id) => {
    const s = sessions.get(id);
    if (s) endSession(s);
  });

  ipcMain.handle('git:status', async (_e, paths) => {
    const entries = await Promise.all((paths || []).map(async (p) => [p, await gitStatus(p).catch(() => undefined)]));
    return Object.fromEntries(entries);
  });
  ipcMain.handle('git:diffstat', (_e, p) => (typeof p === 'string' ? diffStat(p) : { ok: false }));
  ipcMain.handle('git:diff', (_e, p, have) => (typeof p === 'string' ? gitDiff(p, typeof have === 'string' ? have : null) : { ok: false }));

  ipcMain.handle('sessions:list', async (_e, paths) => {
    const entries = await Promise.all((paths || []).map(async (p) => [p, await listSessions(p).catch(() => undefined)]));
    return Object.fromEntries(entries);
  });
  ipcMain.handle('sessions:live', async (_e, ids) => {
    const local = await liveSessions(ids);
    const groups = new Map();
    for (const id of ids || []) { const s = sessions.get(id); if (s?.remoteId) { if (!groups.has(s.cwd)) groups.set(s.cwd, []); groups.get(s.cwd).push([id, s.runtimeId]); } }
    await Promise.all([...groups].map(async ([key, entries]) => {
      const rows = await remoteCall(key, 'live').catch(() => []);
      for (const [id, handle] of entries) { const r = rows.find((r) => r.handle === handle); if (r?.sessionId) local[id] = r.sessionId; }
    }));
    return local;
  });
  ipcMain.handle('session:info', (_e, cwd, sessionId, tabId) => sessionInfo(cwd, sessionId, tabId));
  ipcMain.handle('mcp:list', (_e, cwd) => isRemote(cwd) ? { ok: false, servers: [] } : mcpList(cwd));
  ipcMain.handle('agents:defined', (_e, cwd) => isRemote(cwd) ? [] : definedAgents(cwd));
  ipcMain.handle('agents:prompt', (_e, cwd, sessionId, name) => isRemote(cwd) ? null : agentPrompts(cwd, sessionId, name));
  ipcMain.handle('images:list', (_e, cwd, sessionId) => isRemote(cwd) ? { items: [] } : imagesList(cwd, sessionId));
  ipcMain.handle('images:thumb', (_e, cwd, sessionId, id) => imageThumb(cwd, sessionId, id));
  ipcMain.handle('images:full', (_e, cwd, sessionId, id) => imageFull(cwd, sessionId, id));
  ipcMain.handle('images:reveal', (_e, cwd, sessionId, id) => revealImage(cwd, sessionId, id));
  ipcMain.handle('usage:get', () => getLimits());
  ipcMain.handle('stats:get', (_e, today) => getStats(today));
  ipcMain.handle('update:check', () => checkUpdate());
  ipcMain.handle('update:apply', () => applyUpdate());

  ipcMain.handle('ports:list', () => listPorts());

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle('shell:showInFolder', (_e, p) => {
    if (!isRemote(p) && isDir(p)) return shell.openPath(p);
  });

  ipcMain.handle('shell:openInCode', (_e, p) => {
    if (isRemote(p)) return { ok: false, error: 'Remote editor integration is not available yet. Copy the remote path instead.' };
    if (!isDir(p)) return { ok: false, error: 'Folder not found' };
    if (IS_MAC) {
      return new Promise((resolve) => {
        execFile('/usr/bin/open', ['-a', 'Visual Studio Code', p], (err) => resolve(err ? { ok: false, error: 'Could not start VS Code' } : { ok: true }));
      });
    }
    const exe = findVsCode();
    if (!exe) return { ok: false, error: 'VS Code not found' };
    return new Promise((resolve) => {
      // No windowsHide: it puts SW_HIDE in STARTUPINFO, and Windows applies that to VS Code's first window,
      // so a cold start ran with no visible window at all.
      const child = spawn(exe, [p], { detached: true, stdio: 'ignore' });
      child.on('error', () => resolve({ ok: false, error: 'Could not start VS Code' }));
      child.on('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
  });

  // File links in the terminal: which of these candidate paths (absolute, or relative to the tab's folder) are files.
  ipcMain.handle('files:resolve', (_e, cwd, list) => {
    if (typeof cwd !== 'string' || isRemote(cwd) || !Array.isArray(list)) return [];
    return list.slice(0, 50).map((f) => {
      if (typeof f !== 'string' || !f || f.length > 1000) return null;
      try {
        const abs = path.resolve(cwd, f);
        return fs.statSync(abs).isFile() ? abs : null;
      } catch {
        return null;
      }
    });
  });
  ipcMain.handle('shell:openFile', (_e, file, line, col) => openFileAt(file, line, col));

  ipcMain.handle('md:read', (_e, file) => readDoc(file));
  ipcMain.handle('md:write', (_e, file, text) => writeDoc(file, text));
  ipcMain.handle('md:resolve', (_e, base, href) => resolveDocLink(base, href));
  ipcMain.handle('md:image', (_e, base, src) => docImage(base, src));
  ipcMain.handle('md:reveal', (_e, file) => {
    if (typeof file === 'string' && MD_RE.test(file) && isFile(file)) shell.showItemInFolder(path.normalize(file));
  });
  ipcMain.on('md:watch', (_e, files) => watchDocs(files));
  ipcMain.handle('docs:list', (_e, cwd, sessionId) => isRemote(cwd) ? { session: [], project: [] } : docsList(cwd, sessionId));

  ipcMain.handle('clipboard:read', () => clipboard.readText());
  ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

  ipcMain.on('app:quit', () => {
    forceClose = true;
    mainWindow?.close();
  });

  ipcMain.on('notify', (_e, msg) => notify(msg));
  ipcMain.handle('peek:hold', (_e, zones) => {
    const zone = (z) => (Array.isArray(z) ? [Number(z[0]) || 0, Number(z[1]) || 0, z[2] === true] : null);
    return peekHold({ left: zone(zones?.left), right: zone(zones?.right), bar: Number(zones?.bar) || 0 });
  });
  ipcMain.on('peek:release', (_e, side) => stopPeekWatch(side === 'left' || side === 'right' ? side : undefined));

  ipcMain.on('win:flash', () => {
    if (!mainWindow || mainWindow.isFocused()) return;
    mainWindow.flashFrame(true);
    mainWindow.once('focus', () => mainWindow.flashFrame(false));
  });
}
