'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { repositorySource, cloneFolder, githubOwner, cloneProgress } = require('../src/lib/repository');

test('Git clone accepts HTTPS, SSH URLs and scp-style sources', () => {
  for (const url of ['https://github.com/owner/repo.git', 'ssh://git@host:2222/team/repo.git', 'git@github.com:owner/repo.git', 'host:team/repo', 'host:/srv/team/repo.git', 'git://host/repo']) {
    assert.equal(repositorySource(` ${url} `, 'git'), url);
  }
});

test('Git sources reject options, local paths, helpers, prompts and embedded credentials', () => {
  for (const url of ['', null, '-u', '--upload-pack=evil', '/tmp/repo', 'C:\\repo', 'C:/repo', '../repo', 'file:///tmp/repo',
    'ext::sh', 'helper://host/repo', 'https://host/', 'https://host/repo?token=secret', 'https://user:secret@host/repo', 'https://host/repo#branch', 'host:repo\ncommand', 'ssh://host/repo path']) {
    assert.throws(() => repositorySource(url, 'git'), String(url));
  }
  assert.throws(() => repositorySource('https://host/repo', 'other'));
});

test('GitHub repository and account inputs cannot become flags or paths', () => {
  assert.equal(repositorySource(' org-name/my.repo-1 ', 'github'), 'org-name/my.repo-1');
  assert.equal(githubOwner(' organization-name '), 'organization-name');
  assert.equal(githubOwner(''), '');
  for (const value of ['--help', 'org', 'org/repo/extra', '../repo', 'owner/..', 'owner/.', 'https://github.com/org/repo', 'org/repo\n--help']) {
    assert.throws(() => repositorySource(value, 'github'));
  }
  for (const value of ['--help', 'user/repo', 'user name', 'user\nname']) assert.throws(() => githubOwner(value));
});

test('clone destination is one portable child name on all three devices', () => {
  assert.equal(cloneFolder(' My project '), 'My project');
  assert.equal(cloneFolder('नयाँ-project'), 'नयाँ-project');
  for (const name of [null, '', '.', '..', '../outside', '/absolute', 'C:\\folder', 'a/b', 'a\\b', 'repo.', 'con', 'NUL.txt', 'com1', 'LPT9.md', 'a\0b', 'a\nb', 'a?b', 'a'.repeat(121), 'न'.repeat(100)]) {
    assert.throws(() => cloneFolder(name), String(name));
  }
});

test('clone progress follows Git carriage-return stages and retains transfer details', () => {
  assert.deepEqual(cloneProgress('remote: Counting objects: 100% (14/14), done.\nReceiving objects:  42% (42/100), 2.10 MiB | 1.20 MiB/s\rReceiving objects:  43% (43/100), 2.20 MiB | 1.30 MiB/s\r'),
    { text: 'Receiving objects: 43% (43/100), 2.20 MiB | 1.30 MiB/s', percent: 43 });
  assert.deepEqual(cloneProgress('Resolving deltas: 100% (12/12), done.\nUpdating files:  15% (3/20)\r'), { text: 'Updating files: 15% (3/20)', percent: 15 });
  assert.deepEqual(cloneProgress('\x1b[2Kremote: Enumerating objects: 900, done.\r'), { text: 'Enumerating objects: 900, done.', percent: null });
  assert.equal(cloneProgress("Cloning into '/tmp/repo'...\nfatal: Authentication failed"), null);
  assert.equal(cloneProgress('unrecognized output'), null);
  assert.equal(cloneProgress('Receiving objects: 999%').percent, 100);
});
