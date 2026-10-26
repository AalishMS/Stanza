'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { sshArgs, quote } = require('./lib/remote');

// Install a small versioned bundle from the first stdin line, then use stdin for RPC.
// Keeping sources off argv avoids Windows' command-line size limit.
const bootstrap = `let b='';function install(d){b+=d;let n=b.indexOf('\\n');if(n<0)return;process.stdin.removeListener('data',install);process.stdin.pause();const fs=require('fs'),p=require('path'),o=require('os'),x=JSON.parse(b.slice(0,n));const base=p.join(o.homedir(),'.local/share/stanza/remote',x.version);fs.mkdirSync(base,{recursive:true,mode:448});for(const [name,text]of Object.entries(x.files)){const f=p.join(base,name),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,text,{mode:384});fs.renameSync(tmp,f);}require(p.join(base,'bridge.js'));process.stdin.resume();}process.stdin.setEncoding('utf8');process.stdin.on('data',install);`;
let bundle;
function sources() {
  if (!bundle) {
    const files = {};
    for (const [name, rel] of [['bridge.js', 'remote/bridge.js'], ['tmux.conf', 'remote/tmux.conf'], ['remote.js', 'lib/remote.js'], ['parse.js', 'lib/parse.js'], ['diff.js', 'lib/diff.js']]) files[name] = fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
    bundle = { files, version: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16) };
  }
  return bundle;
}

class Remote {
  constructor(client, changed) { this.client = client; this.changed = changed; this.connections = new Map(); }
  state(device, status, error) { this.changed(device.id, { status, error: error || null }); }
  async connect(device, force = false) {
    if (device.enabled === false) throw Error('Connection is off. Turn it on in Settings > Connections.');
    let c = this.connections.get(device.id);
    if (force && c) { c.stop(); this.connections.delete(device.id); c = null; }
    if (c?.ready) return c.ready;
    if (c && Date.now() < c.retryAt) throw Error(c.error || 'Remote is offline; try Reconnect');
    this.state(device, 'connecting');
    c = { pending: new Map(), next: 0, child: null, error: null, retryAt: 0 };
    this.connections.set(device.id, c);
    c.ready = new Promise((resolve, reject) => {
      let stdout = ''; let stderr = ''; let settled = false;
      const timer = setTimeout(() => fail(Error('SSH setup timed out. Check SSH access and remote Node.js.')), 15000);
      const fail = (err) => {
        if (c.failed) return;
        c.failed = true; c.error = err.message; c.retryAt = Date.now() + 10000; c.ready = null;
        clearTimeout(timer);
        c.child?.kill();
        for (const r of c.pending.values()) { clearTimeout(r.timer); r.reject(err); }
        c.pending.clear();
        if (this.connections.get(device.id) === c) this.state(device, 'offline', err.message);
        if (!settled) { settled = true; reject(err); }
      };
      c.stop = () => fail(Error('Disconnected'));
      const command = `/bin/bash -lc ${quote(`exec node -e ${quote(bootstrap)}`)}`;
      const child = c.child = spawn(process.platform === 'darwin' ? '/usr/bin/ssh' : 'ssh.exe', sshArgs(device, command), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.on('error', fail);
      child.stdin.on('error', fail);
      child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
      child.on('exit', () => fail(Error(stderr.trim() || 'SSH connection ended')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        if (c.failed) return;
        stdout += d;
        if (stdout.length > 32 * 1024 * 1024) { fail(Error('Remote response is too large')); return; }
        let end;
        while ((end = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, end); stdout = stdout.slice(end + 1);
          if (!line.startsWith('STANZA:')) continue; // login banners cannot corrupt the protocol
          let msg; try { msg = JSON.parse(line.slice(7)); } catch { fail(Error('Invalid remote response')); return; }
          if (msg.ready === 1 && !settled) {
            settled = true; clearTimeout(timer); this.state(device, 'connected'); resolve(c); continue;
          }
          const req = c.pending.get(msg.id);
          if (!req) continue;
          c.pending.delete(msg.id); clearTimeout(req.timer);
          if (msg.error) req.reject(Error(msg.error)); else req.resolve(msg.result);
        }
      });
      child.stdin.write(JSON.stringify(sources()) + '\n');
    });
    return c.ready;
  }
  async call(device, op, params = {}) {
    const c = await this.connect(device);
    if (this.connections.get(device.id) !== c || c.failed) throw Error('Connection changed; retry');
    if (op !== 'hello' && device.home && (!c.info || c.info.home !== device.home || c.info.user !== device.user || c.info.hostname !== device.hostname)) throw Error('Remote identity is unverified or changed. Reconnect before retrying.');
    return new Promise((resolve, reject) => {
      const id = ++c.next;
      const timer = setTimeout(() => { c.pending.delete(id); reject(Error(`Remote ${op} timed out`)); }, 25000);
      c.pending.set(id, { resolve, reject, timer });
      c.child.stdin.write(JSON.stringify({ id, op, params: { ...params, client: this.client } }) + '\n');
    });
  }
  async check(device, force = false) {
    if (force) await this.connect(device, true);
    const connection = await this.connect(device);
    if (connection.info) return connection.info;
    const info = await this.call(device, 'hello');
    if (info.protocol !== 1 || info.platform !== 'linux') throw Error('This release requires an Ubuntu/Linux remote');
    if (parseInt(info.node, 10) < 20) throw Error('Install Node.js 20 or newer on the remote server');
    if (!info.tmux) throw Error('Install tmux on the remote server first');
    if (!info.flock) throw Error('Install util-linux (flock) on the remote server first');
    connection.info = info;
    return info;
  }
  attach(device, handle) {
    if (device.enabled === false) throw Error('Connection is off. Turn it on in Settings > Connections.');
    const { UUID } = require('./lib/remote');
    if (!UUID.test(handle)) throw Error('Invalid runtime');
    const command = ['tmux', '-L', `stanza-${this.client}`, 'attach-session', '-t', `stanza-${handle}`].map(quote).join(' ');
    return { file: process.platform === 'darwin' ? '/usr/bin/ssh' : 'ssh.exe', argv: sshArgs(device, command, true) };
  }
  disconnect(device, error) {
    const c = this.connections.get(device.id);
    this.connections.delete(device.id);
    c?.stop?.();
    this.state(device, device.enabled === false ? 'disabled' : 'offline', error);
  }
  close() { for (const c of this.connections.values()) c.stop?.(); this.connections.clear(); }
}
module.exports = { Remote };
