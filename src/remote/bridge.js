'use strict';

// Runs on Ubuntu over SSH. Its only transport is stdin/stdout; tmux owns terminal processes.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');
const { UUID, quote, runtimeRecord } = require('./remote');
const { parseGitStatus, parseTail, oneLine, firstPrompt, usageTokens, descendantPids, parsePs } = require('./parse');
const { parseDiff, addedFile, zList, statusPaths } = require('./diff');
const home = os.homedir();
const cache = new Map();
const locks = new Map();
const gitOutputs = new Map();
const diffCache = new Map();
const tasks = new Set();
let closing = false;
let draining = false;
const send = (v) => { if (!closing) process.stdout.write(`STANZA:${JSON.stringify(v)}\n`); };
process.stdout.on('error', () => { closing = true; }); // SSH may go away while a startup transaction completes
const run = (file, args, opts = {}) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    if (err) reject(Error((stderr || err.message).trim())); else resolve(stdout);
  });
});
const dir = async (p) => {
  if (typeof p !== 'string' || !p.startsWith('/') || /[\0\r\n]/.test(p)) throw Error('Invalid folder');
  const real = await fs.promises.realpath(p);
  if (!(await fs.promises.stat(real)).isDirectory()) throw Error('Not a directory');
  return real;
};
const readJson = async (file) => { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { return null; } };
const projectDir = (cwd) => path.join(home, '.claude/projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
async function range(file, start, size) {
  const fh = await fs.promises.open(file, 'r');
  try { const b = Buffer.alloc(size); const r = await fh.read(b, 0, size, start); return b.toString('utf8', 0, r.bytesRead); }
  finally { await fh.close(); }
}
async function summary(file) {
  const st = await fs.promises.stat(file);
  const sig = `${st.mtimeMs}:${st.size}`;
  if (cache.get(file)?.sig === sig) return cache.get(file).value;
  const tail = async (n) => { const start = Math.max(0, st.size - n); const s = await range(file, start, Math.min(n, st.size)); return start ? s.slice(s.indexOf('\n') + 1) : s; };
  let t = parseTail(await tail(65536));
  if (!t.usage && st.size > 65536) t = parseTail(await tail(1024 * 1024));
  let value = null;
  if (t.title || t.custom || t.usage || st.size > 1024 * 1024) {
    const head = await range(file, 0, Math.min(st.size, 16384));
    value = { id: path.basename(file, '.jsonl'), title: oneLine(t.custom || parseTail(head).custom || t.title || firstPrompt(head) || t.prompt) || 'Untitled session',
      last: t.last || Math.round(st.mtimeMs), mtime: Math.round(st.mtimeMs), birth: Math.round(st.birthtimeMs), model: t.model, ctx: t.compacted ?? usageTokens(t.usage) };
  }
  cache.set(file, { sig, value });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return value;
}
async function history(cwd) {
  let names;
  try { names = await fs.promises.readdir(projectDir(cwd)); } catch { return []; }
  const rows = [];
  for (const n of names.filter((n) => UUID.test(n.slice(0, -6)) && n.endsWith('.jsonl'))) {
    try { const s = await summary(path.join(projectDir(cwd), n)); if (s) rows.push(s); } catch { /* removed meanwhile */ }
  }
  return rows.sort((a, b) => b.last - a.last).slice(0, 200);
}
function tmux(client, args) {
  if (!UUID.test(client)) throw Error('Invalid client');
  return run('tmux', ['-L', `stanza-${client}`, '-f', path.join(__dirname, 'tmux.conf'), ...args]);
}
const target = (h) => { if (!UUID.test(h)) throw Error('Invalid runtime'); return `stanza-${h}`; };
async function runtimes(client) {
  let out;
  try { out = await tmux(client, ['list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t#{@stanza}\t#{session_attached}']); }
  catch (e) { if (/no server running|no sessions|error connecting/.test(e.message)) return []; throw e; }
  const rows = [];
  for (const line of out.trim().split('\n')) {
    const [name, pid, dead, code, raw, attached] = line.split('\t');
    if (!name?.startsWith('stanza-') || !raw) continue;
    try {
      const meta = JSON.parse(Buffer.from(raw, 'base64').toString());
      if (UUID.test(meta.handle) && name === `stanza-${meta.handle}`) rows.push({ ...meta, pid: +pid, alive: dead !== '1', exitCode: +code || 0, attached: +attached || 0 });
    } catch { /* not ours */ }
  }
  return rows;
}
async function live(client) {
  const rows = await runtimes(client);
  const names = await fs.promises.readdir(path.join(home, '.claude/sessions')).catch(() => []);
  const records = (await Promise.all(names.filter((n) => /^\d+\.json$/.test(n)).map((n) => readJson(path.join(home, '.claude/sessions', n))))).filter(Boolean);
  const ps = records.length ? parsePs(await run('/bin/ps', ['-axww', '-o', 'pid=,ppid=,etime=,args=']), new Map(), Date.now()) : [];
  for (const r of rows) {
    if (!r.alive || r.kind !== 'claude') continue;
    const pids = new Set(descendantPids(ps, r.pid));
    pids.add(r.pid);
    const record = runtimeRecord(records, pids, r.startedAt);
    r.sessionId = record?.sessionId || r.resumeId || null;
  }
  return rows;
}

async function reserved(p, work) {
  if (!p.resumeId || p.fork) return work();
  // flock serializes helpers/profiles, while owner metadata survives helper/SSH exits.
  const base = path.join(__dirname, '..', 'reservations');
  await fs.promises.mkdir(base, { recursive: true, mode: 0o700 });
  const prefix = path.join(base, p.resumeId.toLowerCase());
  const child = spawn('flock', ['-x', '-w', '10', `${prefix}.lock`, '/bin/sh', '-c', 'printf "LOCKED\\n"; cat >/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let error = '';
  child.stderr.on('data', (d) => { error = (error + d).slice(-1000); });
  child.stdin.on('error', () => {});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.stdin.end(); child.kill(); reject(Error('Conversation is being opened by another client. Retry shortly.')); }, 12000);
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('exit', (code) => { clearTimeout(timer); reject(Error(error || `Reservation failed (${code})`)); });
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    const owner = await readJson(`${prefix}.json`);
    if (UUID.test(owner?.client) && UUID.test(owner?.handle)) {
      const runtime = (await live(owner.client)).find((r) => r.handle === owner.handle);
      if (runtime?.alive && (runtime.sessionId || runtime.resumeId) === p.resumeId) throw Error('This conversation is running in another Stanza session. Reopen it there or end it first.');
      if (!runtime) {
        const exists = await tmux(owner.client, ['has-session', '-t', target(owner.handle)]).then(() => true, () => false);
        if (exists) throw Error('This conversation has an unfinished startup in another Stanza session.');
      }
    }
    const tmp = `${prefix}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify({ client: p.client, handle: p.handle }), { mode: 0o600 });
    await fs.promises.rename(tmp, `${prefix}.json`);
    return await work();
  } finally { child.stdin.end(); }
}

async function prepare(p) {
  if (p.kind !== 'claude' && p.kind !== 'shell') throw Error('Invalid terminal kind');
  if (!UUID.test(p.handle) || (p.resumeId != null && !UUID.test(p.resumeId))) throw Error('Invalid session');
  const cwd = await dir(p.cwd);
  // The per-client queue below makes lookup + creation atomic for history opens and reconnect.
  const rows = await live(p.client);
  const existing = rows.find((r) => r.handle === p.handle)
    || (!p.fork && p.resumeId && rows.find((r) => r.alive && r.cwd === cwd && r.kind === p.kind && r.sessionId === p.resumeId));
  if (existing && (existing.cwd !== cwd || existing.kind !== p.kind)) throw Error('Runtime belongs to another project or terminal kind');
  if (existing?.alive) {
    if (existing.attached) throw Error('That remote session is already attached. Wait for the previous connection to close, then reconnect.');
    return existing;
  }
  if (existing) await tmux(p.client, ['kill-session', '-t', target(existing.handle)]);
  return reserved(p, async () => {
  if (p.resumeId && !p.fork) {
    const names = await fs.promises.readdir(path.join(home, '.claude/sessions')).catch(() => []);
    for (const n of names.filter((n) => /^\d+\.json$/.test(n))) {
      const record = await readJson(path.join(home, '.claude/sessions', n));
      if (record?.kind === 'interactive' && record.sessionId === p.resumeId) {
        const running = await proc(record.pid);
        if (!running || ['Z', 'X'].includes(running.state)) continue;
        const age = await run('/bin/ps', ['-p', String(record.pid), '-o', 'etimes=']).then((s) => Number(s.trim()), () => NaN);
        if (Number.isFinite(age) && Math.abs(Date.now() - age * 1000 - record.startedAt) < 5000) throw Error('This conversation is running in another terminal. Close it there before resuming.');
      }
    }
  }
  const args = p.resumeId ? ['--resume', p.resumeId, ...(p.fork ? ['--fork-session'] : [])] : [];
  if (p.skipPerms === true) args.push('--dangerously-skip-permissions');
  const env = ['env', '-u', 'CLAUDECODE', '-u', 'CLAUDE_PID', '-u', 'CLAUDE_CODE_SESSION_ID', '-u', 'CLAUDE_CODE_ENTRYPOINT', 'COLORTERM=truecolor', 'TERM_PROGRAM=Stanza'];
  const cmd = p.kind === 'claude' ? [...env, 'claude', ...args].map(quote).join(' ') : `${quote(process.env.SHELL || '/bin/bash')} -l`;
  const launch = `/bin/bash -lc ${quote(`exec ${cmd}`)}`;
  await tmux(p.client, ['new-session', '-d', '-s', `stanza-${p.handle}`, '-c', cwd, '-x', String(Math.max(2, Math.min(500, +p.cols || 80))), '-y', String(Math.max(2, Math.min(300, +p.rows || 24))), launch]);
  try {
  const pane = (await tmux(p.client, ['display-message', '-p', '-t', target(p.handle), '#{pane_pid}\t#{pane_dead}'])).trim().split('\t');
  const identity = pane[1] === '0' ? await proc(+pane[0]) : null;
  const meta = { handle: p.handle, cwd, kind: p.kind, resumeId: p.fork ? null : p.resumeId || null, skipPerms: p.skipPerms === true, startedAt: Date.now(), processStart: identity?.start || null };
  await tmux(p.client, ['set-option', '-t', target(p.handle), '@stanza', Buffer.from(JSON.stringify(meta)).toString('base64')]);
  return (await runtimes(p.client)).find((r) => r.handle === p.handle) || meta;
  } catch (err) {
    await tmux(p.client, ['kill-session', '-t', target(p.handle)]).catch(() => {});
    throw err;
  }
  });
}
// Read /proc starttime along with the PID, so a shutdown escalation cannot hit a recycled PID.
async function proc(pid) {
  try { const s = await fs.promises.readFile(`/proc/${pid}/stat`, 'utf8'); const v = s.slice(s.lastIndexOf(')') + 2).split(' '); return { pid, parent: +v[1], state: v[0], start: v[19] }; }
  catch { return null; }
}
async function terminate(p) {
  const r = (await runtimes(p.client)).find((r) => r.handle === p.handle);
  if (!r) return { ended: true };
  if (p.cwd && r.cwd !== p.cwd) throw Error('Runtime belongs to another project');
  if (!r.alive) { await tmux(p.client, ['kill-session', '-t', target(p.handle)]); return { ended: true }; }
  const processes = (await Promise.all((await fs.promises.readdir('/proc')).filter((n) => /^\d+$/.test(n)).map((n) => proc(+n)))).filter(Boolean);
  if (!r.processStart || processes.find((x) => x.pid === r.pid)?.start !== r.processStart) throw Error('Remote process identity could not be verified. Relaunch cancelled.');
  const owned = new Set([r.pid]);
  for (let i = 0; i < 40; i++) { let changed = false; for (const x of processes) if (owned.has(x.parent) && !owned.has(x.pid)) { owned.add(x.pid); changed = true; } if (!changed) break; }
  const tracked = processes.filter((x) => owned.has(x.pid));
  const remains = async () => (await Promise.all(tracked.map(async (x) => { const now = await proc(x.pid); return now?.start === x.start && !['Z', 'X'].includes(now.state) ? x : null; }))).filter(Boolean);
  // HUP lets Claude clean up its fullscreen state before tmux is removed.
  for (const x of await remains()) { try { process.kill(x.pid, 'SIGHUP'); } catch { /* gone */ } }
  for (let i = 0; i < 20 && (await remains()).length; i++) await new Promise((r) => setTimeout(r, 100));
  for (const x of await remains()) { try { process.kill(x.pid, 'SIGKILL'); } catch { /* gone */ } }
  for (let i = 0; i < 20 && (await remains()).length; i++) await new Promise((r) => setTimeout(r, 100));
  if ((await remains()).length) throw Error('Remote process exit could not be confirmed. Relaunch cancelled.');
  await tmux(p.client, ['kill-session', '-t', target(p.handle)]).catch(() => {});
  return { ended: true };
}
const git = (cwd, args) => run('git', ['-C', cwd, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
async function changes(cwd) {
  const status = gitOutputs.get(cwd) || await git(cwd, ['status', '--porcelain=v2', '--branch']).catch(() => null);
  if (status == null) return { ok: false, noRepo: true };
  const stamps = await Promise.all(statusPaths(status).slice(0, 1000).map(async (p) => { try { const st = await fs.promises.stat(path.resolve(cwd, p)); return `${st.mtimeMs}:${st.size}`; } catch { return '-'; } }));
  const key = `${status}\n${stamps.join(',')}`;
  const cached = diffCache.get(cwd);
  if (cached?.key === key && Date.now() - cached.at < 20000) return cached.value;
  let root;
  try { root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim(); } catch { return { ok: false, noRepo: true }; }
  const base = await git(root, ['rev-parse', '--verify', 'HEAD']).then(() => 'HEAD', () => '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  const patch = await git(root, ['-c', 'core.quotepath=false', 'diff', base, '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-M']);
  const files = parseDiff(patch);
  const others = zList(await git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  let budget = 8 * 1024 * 1024;
  for (const rel of others.slice(0, 300)) {
    const f = addedFile(rel.replace(/\/$/, ''), ''); f.untracked = true;
    try {
      const st = await fs.promises.lstat(path.join(root, rel));
      if (!st.isFile() || st.isSymbolicLink()) f.skip = true;
      else if (st.size > 512 * 1024 || st.size > budget) f.big = st.size;
      else { const b = await fs.promises.readFile(path.join(root, rel)); budget -= b.length; if (b.includes(0)) f.binary = true; else Object.assign(f, addedFile(rel, b.toString())); }
    } catch { f.skip = true; }
    files.push(f);
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const f of files) f.id = crypto.createHash('sha1').update(JSON.stringify(f)).digest('hex').slice(0, 16);
  const value = { ok: true, root, files, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0), more: Math.max(0, others.length - 300) };
  value.id = crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
  diffCache.set(cwd, { key, at: Date.now(), value });
  if (diffCache.size > 8) diffCache.delete(diffCache.keys().next().value);
  return value;
}
const operations = {
  hello: async () => ({ protocol: 1, home, user: os.userInfo().username, hostname: os.hostname(), platform: process.platform, node: process.versions.node,
    claude: await run('/bin/bash', ['-lc', 'command -v claude']).then((s) => s.trim(), () => null),
    loggedIn: await run('/bin/bash', ['-lc', 'claude auth status']).then((s) => { try { return JSON.parse(s).loggedIn === true; } catch { return null; } }, () => null),
    tmux: await run('tmux', ['-V']).then((s) => s.trim(), () => null),
    flock: await run('flock', ['--version']).then((s) => s.trim(), () => null) }),
  dirs: async (p) => { const cwd = await dir(p.path || home); const entries = await fs.promises.readdir(cwd, { withFileTypes: true });
    return { path: cwd, parent: path.dirname(cwd), entries: entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort().slice(0, 1000) }; },
  prepare, live: (p) => live(p.client), runtimes: (p) => runtimes(p.client), terminate,
  history: async (p) => history(await dir(p.cwd)),
  status: async (p) => { const cwd = await dir(p.cwd); try { const s = await git(cwd, ['status', '--porcelain=v2', '--branch']); gitOutputs.set(cwd, s); return parseGitStatus(s); } catch { gitOutputs.delete(cwd); return null; } },
  diff: async (p) => { const v = await changes(await dir(p.cwd)); return p.have && v.id === p.have ? { same: true } : v; },
};
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (closing) return;
  if (line.length > 1024 * 1024) { process.exitCode = 1; input.close(); return; }
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (!Number.isSafeInteger(m.id) || !Object.hasOwn(operations, m.op)) return;
  const key = ['prepare', 'terminate'].includes(m.op) ? m.params?.client : null;
  const task = (key ? locks.get(key) || Promise.resolve() : Promise.resolve()).catch(() => {}).then(() => operations[m.op](m.params || {}));
  tasks.add(task);
  task.finally(() => tasks.delete(task)).catch(() => {});
  if (key) { locks.set(key, task); task.finally(() => { if (locks.get(key) === task) locks.delete(key); }).catch(() => {}); }
  task.then((result) => send({ id: m.id, result }), (err) => send({ id: m.id, error: err.message }));
});
async function drain() {
  if (draining) return;
  draining = true; closing = true;
  const timeout = setTimeout(() => process.exit(1), 35000);
  await Promise.allSettled([...tasks]); clearTimeout(timeout); process.exit();
}
input.on('close', drain);
process.on('SIGHUP', drain);
process.on('SIGTERM', drain);
send({ ready: 1 });
