'use strict';

// Opt-in integration check: node scripts/remote-smoke.js user@host
// Uses its own tmux socket and /tmp directory. Never runs as part of npm test.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const pty = require('@lydell/node-pty');
const { Remote } = require('../src/remote');
const { remoteTarget, quote } = require('../src/lib/remote');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const device = { id: crypto.randomUUID(), ...remoteTarget(process.argv[2] || 'aalish@g5-server') };
  const client = new Remote(crypto.randomUUID(), () => {});
  const handle = crypto.randomUUID();
  const folder = `/tmp/stanza-smoke-${handle}`;
  let terminal; let output = '';
  const waitFor = async (test) => { for (let i = 0; i < 150; i++) { if (test()) return; await pause(100); } throw Error('Timed out waiting for remote terminal: ' + output.slice(-1500)); };
  const attach = () => {
    const launch = client.attach(device, handle);
    output = '';
    terminal = pty.spawn(launch.file, launch.argv, { name: 'xterm-256color', cols: 90, rows: 30, cwd: os.homedir(), env: { ...process.env, TERM: 'xterm-256color' } });
    terminal.onData((d) => { output += d; });
    return terminal;
  };
  const command = async (text, marker) => {
    output = ''; terminal.write(text + '\r');
    const needed = text.includes(marker) ? 2 : 1;
    // eslint-disable-next-line no-control-regex -- real terminal output contains ESC cursor-control sequences
    await waitFor(() => output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(marker).length - 1 >= needed);
  };
  try {
    const info = await client.check(device);
    assert.equal(info.platform, 'linux'); assert.ok(info.tmux);
    Object.assign(device, { home: info.home, user: info.user, hostname: info.hostname });
    console.log('Readiness:', info.hostname, info.node, info.tmux);
    assert.equal((await client.call(device, 'dirs', { path: '/tmp' })).path, '/tmp');
    const r = await client.call(device, 'prepare', { handle, cwd: '/tmp', kind: 'shell', cols: 90, rows: 30 });
    assert.ok(r.processStart); assert.ok(r.alive);
    assert.equal((await client.call(device, 'prepare', { handle, cwd: '/tmp', kind: 'shell' })).pid, r.pid);
    await assert.rejects(client.call(device, 'prepare', { handle, cwd: '/', kind: 'shell' }), /another project/);
    attach(); await pause(800);
    await command("printf '\\n__STANZA_TERMINAL_OK__\\n'", '__STANZA_TERMINAL_OK__');
    terminal.resize(101, 33); await pause(300);
    await command('stty size', '33 101');
    await command(`mkdir ${quote(folder)} && git -C ${quote(folder)} init -q && printf 'hello\\n' > ${quote(folder + '/hello.txt')} && printf '\\n__GIT_READY__\\n'`, '__GIT_READY__');
    const status = await client.call(device, 'status', { cwd: folder });
    assert.equal(status.untracked, 1);
    const diff = await client.call(device, 'diff', { cwd: folder });
    assert.equal(diff.ok, true); assert.equal(diff.files[0].path, 'hello.txt'); assert.equal(diff.added, 1);
    const same = await client.call(device, 'diff', { cwd: folder, have: diff.id }); assert.equal(same.same, true);
    const exited = new Promise((resolve) => terminal.onExit(resolve)); terminal.kill(); terminal = null; await exited;
    await pause(500);
    const kept = (await client.call(device, 'live')).find((x) => x.handle === handle);
    assert.equal(kept.alive, true); assert.equal(kept.pid, r.pid);
    await client.call(device, 'prepare', { handle, cwd: '/tmp', kind: 'shell' });
    attach(); await pause(600);
    await command("printf '\\n__STANZA_REATTACHED__\\n'", '__STANZA_REATTACHED__');
    await assert.rejects(client.call(device, 'prepare', { handle, cwd: '/tmp', kind: 'shell' }), /already attached/);
    await command(`rm -rf -- ${quote(folder)}; printf '\\n__CLEANED__\\n'`, '__CLEANED__');
    await client.call(device, 'terminate', { handle, cwd: '/tmp' });
    assert.ok(!(await client.call(device, 'runtimes')).some((x) => x.handle === handle));
    const peer = new Remote(crypto.randomUUID(), () => {});
    const handles = [crypto.randomUUID(), crypto.randomUUID()];
    try {
      await peer.check(device);
      // Shells with a synthetic resume UUID exercise the same reservation without Claude login.
      const resumeId = crypto.randomUUID();
      const results = await Promise.allSettled([client.call(device, 'prepare', { handle: handles[0], cwd: '/tmp', kind: 'shell', resumeId }), peer.call(device, 'prepare', { handle: handles[1], cwd: '/tmp', kind: 'shell', resumeId })]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.match(results.find((r) => r.status === 'rejected').reason.message, /another Stanza/);
    } finally {
      await client.call(device, 'terminate', { handle: handles[0], cwd: '/tmp' }).catch(() => {});
      await peer.call(device, 'terminate', { handle: handles[1], cwd: '/tmp' }).catch(() => {});
      peer.close();
    }
    // Inject a pause only into a temporary helper copy, then disconnect at the transaction gap.
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'stanza-remote-fault-'));
    const resolved = path.resolve(copy);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'stanza-remote-fault-')) throw Error('Unsafe temporary test path');
    const faultId = crypto.randomUUID(); const faultHandle = crypto.randomUUID();
    let fault; let inspector;
    try {
      for (const rel of ['remote.js', 'remote/bridge.js', 'remote/tmux.conf', 'lib/remote.js', 'lib/parse.js', 'lib/diff.js']) {
        const destination = path.join(copy, rel); fs.mkdirSync(path.dirname(destination), { recursive: true });
        let text = fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');
        if (rel === 'remote/bridge.js') {
          const before = text;
          text = text.replace('  const pane = (await tmux', "  process.stdout.write('__STANZA_FAULT_WINDOW__\\n');\n  await new Promise(r => setTimeout(r, 1500));\n  const pane = (await tmux");
          assert.notEqual(text, before);
        }
        fs.writeFileSync(destination, text);
      }
      const FaultRemote = require(path.join(copy, 'remote.js')).Remote;
      fault = new FaultRemote(faultId, () => {}); await fault.check(device);
      let seen = '';
      const window = new Promise((resolve) => fault.connections.get(device.id).child.stdout.on('data', (d) => { seen += d; if (seen.includes('__STANZA_FAULT_WINDOW__')) resolve(); }));
      const starting = fault.call(device, 'prepare', { handle: faultHandle, cwd: '/tmp', kind: 'shell' }).catch(() => null);
      let timeout;
      await Promise.race([window, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Fault window not reached')), 15000); })]); clearTimeout(timeout);
      fault.close(); await starting; await pause(2200);
      inspector = new Remote(faultId, () => {}); await inspector.check(device);
      assert.ok((await inspector.call(device, 'runtimes')).find((r) => r.handle === faultHandle)?.alive, 'Interrupted startup must remain discoverable');
    } finally {
      fault?.close();
      if (inspector) { await inspector.call(device, 'terminate', { handle: faultHandle, cwd: '/tmp' }).catch(() => {}); inspector.close(); }
      fs.rmSync(resolved, { recursive: true, force: true });
    }
    console.log('PASS: shell, resize, Git/diff, detach/reattach, conflict/identity guards, termination, concurrent reservation, interrupted startup recovery.');
  } finally {
    terminal?.kill();
    await client.call(device, 'terminate', { handle, cwd: '/tmp' }).catch(() => {});
    client.close();
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
