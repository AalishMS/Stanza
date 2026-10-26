'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { repositorySource, cloneFolder, githubOwner } = require('./lib/repository');

const CLONE_TIMEOUT = 120000;
const commands = new Set();
function command(file, args, timeout = 20000, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let stopped = false;
    function stop() {
      if (stopped) return;
      stopped = true;
      // gh starts git/ssh children: stop the owned tree, not just its launcher.
      if (process.platform === 'win32') {
        if (child.pid) execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => child.kill());
      } else {
        // macOS and the Ubuntu helper each use an isolated process group.
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
    const child = execFile(file, args, { windowsHide: true, detached: process.platform !== 'win32', maxBuffer: 4 * 1024 * 1024,
      cwd: os.homedir(), env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1',
        SSH_ASKPASS_REQUIRE: 'never', ...extraEnv } }, (err, stdout, stderr) => {
      clearTimeout(timer);
      commands.delete(stop);
      if (stopped) return reject(Error(timedOut ? 'Repository operation timed out.' : 'Repository operation cancelled.'));
      if (!err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(Error(`Install ${file === 'gh' ? 'GitHub CLI (gh) and run gh auth login' : 'Git'} on the selected device first.`));
      reject(Error((stderr || err.message).trim()));
    });
    commands.add(stop);
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    child.stdin.on('error', () => {});
    child.stdin.end(); // no invisible prompts; authentication belongs in the user's terminal
  });
}

async function githubRepositories(owner) {
  const account = githubOwner(owner);
  const out = await command('gh', ['repo', 'list', ...(account ? [account] : []), '--limit', '100', '--json', 'nameWithOwner']);
  const rows = JSON.parse(out);
  if (!Array.isArray(rows)) throw Error('Invalid GitHub response.');
  return rows.map((r) => ({ name: repositorySource(r.nameWithOwner, 'github') }));
}

async function cloneRepository(value) {
  const source = repositorySource(value?.source, value?.kind);
  const name = cloneFolder(value?.name);
  if (typeof value.parent !== 'string' || !path.isAbsolute(value.parent) || /[\0\r\n]/.test(value.parent)) throw Error('Choose an absolute destination folder.');
  const parent = await fs.promises.realpath(value.parent);
  if (!(await fs.promises.stat(parent)).isDirectory()) throw Error('Destination is not a folder.');
  // Preserve Git's configured SSH identity/client. Only supply a batch-mode default when none is configured.
  const customSsh = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH || process.env.GIT_SSH_VARIANT
    || (await command('git', ['config', '--default', '', '--get', 'core.sshCommand'])).trim();
  const sshEnv = customSsh ? {} : { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' };
  const destination = path.join(parent, name);
  try { await fs.promises.mkdir(destination); }
  catch (err) { if (err.code === 'EEXIST') throw Error('A file or folder with that name already exists. Choose a new folder name.', { cause: err }); throw err; }
  try {
    if (value.kind === 'github') await command('gh', ['repo', 'clone', source, destination], CLONE_TIMEOUT, sshEnv);
    else await command('git', ['clone', '--', source, destination], CLONE_TIMEOUT, sshEnv);
  } catch (err) {
    throw Error(`${err.message}\nClone destination: ${destination}\nThe folder may contain partial files. Choose a new folder name or remove it before retrying.`, { cause: err });
  }
  return { path: destination };
}

const stopRepositoryCommands = () => { for (const stop of commands) stop(); };
module.exports = { cloneRepository, githubRepositories, stopRepositoryCommands };
