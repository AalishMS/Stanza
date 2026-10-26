'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { repositorySource, cloneFolder, githubOwner, cloneProgress } = require('./lib/repository');

const CLONE_IDLE_TIMEOUT = 5 * 60 * 1000;
const commands = new Set();
function command(file, args, timeout = 20000, extraEnv = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    let failure = null;
    let stopped = false;
    let stdout = '';
    let stderr = '';
    let timer;
    let progressTimer;
    let pendingProgress;
    let lastProgress = '';
    function stop(reason = Error('Repository operation cancelled.')) {
      if (stopped) return;
      stopped = true; failure = reason;
      // gh starts git/ssh children: stop the owned tree, not just its launcher.
      if (process.platform === 'win32') {
        if (child.pid) execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => child.kill());
      } else {
        // macOS and the Ubuntu helper each use an isolated process group.
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
    function armTimeout() {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(() => stop(Error(onProgress ? 'No clone output for 5 minutes. The clone was stopped.' : 'Repository operation timed out.')), timeout);
    }
    function flushProgress() {
      clearTimeout(progressTimer); progressTimer = null;
      if (pendingProgress && !stopped) onProgress(pendingProgress);
      pendingProgress = null;
    }
    const child = spawn(file, args, { windowsHide: true, detached: process.platform !== 'win32',
      cwd: os.homedir(), env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1',
        SSH_ASKPASS_REQUIRE: 'never', ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
    commands.add(stop); armTimeout();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      if (stopped) return;
      if (onProgress) { armTimeout(); stdout = (stdout + data).slice(-16384); }
      else { stdout += data; if (stdout.length > 4 * 1024 * 1024) stop(Error('Repository response is too large.')); }
    });
    child.stderr.on('data', (data) => {
      if (stopped) return;
      stderr = (stderr + data).slice(-16384);
      if (!onProgress) return;
      armTimeout();
      const progress = cloneProgress(stderr);
      const key = JSON.stringify(progress);
      if (!progress || key === lastProgress) return;
      lastProgress = key; pendingProgress = progress;
      if (!progressTimer) progressTimer = setTimeout(flushProgress, 100);
    });
    child.on('error', (err) => {
      failure = err.code === 'ENOENT' ? Error(`Install ${file === 'gh' ? 'GitHub CLI (gh) and run gh auth login' : 'Git'} on the selected device first.`) : err;
    });
    child.on('close', (code) => {
      clearTimeout(timer); flushProgress(); commands.delete(stop);
      if (failure) reject(failure);
      else if (code !== 0) reject(Error((stderr || `Repository command exited (${code}).`).trim()));
      else resolve(stdout);
    });
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

async function cloneRepository(value, onProgress = () => {}) {
  const source = repositorySource(value?.source, value?.kind);
  const name = cloneFolder(value?.name);
  if (typeof value.parent !== 'string' || !path.isAbsolute(value.parent) || /[\0\r\n]/.test(value.parent)) throw Error('Choose an absolute destination folder.');
  const parent = await fs.promises.realpath(value.parent);
  if (!(await fs.promises.stat(parent)).isDirectory()) throw Error('Destination is not a folder.');
  onProgress({ text: 'Preparing clone…', percent: null });
  // Preserve Git's configured SSH identity/client. Only supply a batch-mode default when none is configured.
  const customSsh = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH || process.env.GIT_SSH_VARIANT
    || (await command('git', ['config', '--default', '', '--get', 'core.sshCommand'])).trim();
  const sshEnv = customSsh ? {} : { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' };
  const destination = path.join(parent, name);
  try { await fs.promises.mkdir(destination); }
  catch (err) { if (err.code === 'EEXIST') throw Error('A file or folder with that name already exists. Choose a new folder name.', { cause: err }); throw err; }
  try {
    onProgress({ text: 'Connecting to repository…', percent: null });
    if (value.kind === 'github') await command('gh', ['repo', 'clone', source, destination, '--', '--progress'], CLONE_IDLE_TIMEOUT, sshEnv, onProgress);
    else await command('git', ['clone', '--progress', '--', source, destination], CLONE_IDLE_TIMEOUT, sshEnv, onProgress);
  } catch (err) {
    throw Error(`${err.message}\nClone destination: ${destination}\nThe folder may contain partial files. Choose a new folder name or remove it before retrying.`, { cause: err });
  }
  return { path: destination };
}

const stopRepositoryCommands = () => { for (const stop of commands) stop(); };
module.exports = { cloneRepository, githubRepositories, stopRepositoryCommands };
