'use strict';

// Shared by the desktop and the uploaded helper. No Electron or filesystem access.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const isRemote = (key) => typeof key === 'string' && key.startsWith('ssh://');
function remoteKey(id, dir) {
  if (!UUID.test(id) || typeof dir !== 'string' || !dir.startsWith('/') || /[\0\r\n]/.test(dir)) throw Error('Invalid remote folder');
  return `ssh://${id}${dir.split('/').map(encodeURIComponent).join('/')}`;
}
function remoteTarget(target, port) {
  if (typeof target !== 'string' || !/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(target) || target.length > 250) throw Error('Use an SSH alias or user@hostname');
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw Error('Invalid SSH port');
  return { target, ...(port ? { port } : {}) };
}
const quote = (s) => "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
function folderName(name) {
  if (typeof name !== 'string' || !name.trim() || name === '.' || name === '..' || /[\\/]/.test(name)
      || [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      || Buffer.byteLength(name, 'utf8') > 255) throw Error('Enter a folder name, without a path or special control characters');
  return name;
}
function sshArgs(device, command, tty = false) {
  remoteTarget(device.target, device.port);
  return [tty ? '-tt' : '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
    '-o', 'ForwardAgent=no', '-e', 'none', ...(device.port ? ['-p', String(device.port)] : []), device.target, command];
}
function runtimeRecord(records, pids, startedAt) {
  const mine = new Set(pids);
  return records.filter((r) => r && mine.has(r.pid) && r.kind === 'interactive' && UUID.test(r.sessionId) && Number(r.startedAt) >= startedAt - 5000)
    .sort((a, b) => a.startedAt - b.startedAt)[0] || null;
}
module.exports = { UUID, isRemote, remoteKey, remoteTarget, quote, sshArgs, runtimeRecord, folderName };
