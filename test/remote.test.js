'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { remoteKey, remoteTarget, quote, sshArgs, runtimeRecord } = require('../src/lib/remote');
const id = '12345678-1234-1234-1234-123456789abc';
test('remote identities preserve POSIX case and distinguish devices and special paths', () => {
  assert.notEqual(remoteKey(id, '/a/Test'), remoteKey(id, '/a/test'));
  assert.notEqual(remoteKey(id, '/a'), remoteKey(id.replace('abc', 'def'), '/a'));
  assert.equal(remoteKey(id, '/a #/你好'), `ssh://${id}/a%20%23/%E4%BD%A0%E5%A5%BD`);
  assert.throws(() => remoteKey(id, 'relative'));
  assert.throws(() => remoteKey(id, '/a\ncommand'));
});
test('SSH targets reject flags, shell commands, control characters and invalid ports', () => {
  for (const target of ['-oProxyCommand=evil', 'a;whoami', 'user@host\n', 'ssh user@host', 'a$(cmd)']) assert.throws(() => remoteTarget(target));
  assert.deepEqual(remoteTarget('aalish@g5-server', 22), { target: 'aalish@g5-server', port: 22 });
  assert.throws(() => remoteTarget('host', 65536));
  const args = sshArgs({ target: 'g5-server' }, 'echo hello', true);
  assert.equal(args[0], '-tt');
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.deepEqual(args.slice(-2), ['g5-server', 'echo hello']);
});
test('POSIX arguments remain single quoted through apostrophes and metacharacters', () => {
  assert.equal(quote("a'b; $(x)"), "'a'\"'\"'b; $(x)'");
});
test('remote live identity ignores old reused child PIDs and noninteractive nested agents', () => {
  const current = { pid: 10, kind: 'interactive', startedAt: 20000, sessionId: id };
  const stale = { pid: 11, kind: 'interactive', startedAt: 100, sessionId: id.replace('abc', 'def') };
  const nested = { pid: 12, kind: 'sdk', startedAt: 19000, sessionId: id.replace('abc', '123') };
  assert.equal(runtimeRecord([stale, nested, current], [10, 11, 12], 20000), current);
  assert.equal(runtimeRecord([stale], [11], 20000), null);
  assert.equal(runtimeRecord([current], [13], 20000), null);
});
