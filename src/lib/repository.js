'use strict';

// Shared validation for the desktop and Ubuntu helper; never send input through a shell.
function repositorySource(value, kind) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source || source.length > 2048 || /\s/.test(source) || [...source].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw Error('Enter a repository URL or owner/repository.');
  if (kind === 'github') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(source) || /\/(?:\.|\.\.)(?:\.git)?$/.test(source)) throw Error('Enter a GitHub repository as owner/repository.');
    return source;
  }
  if (kind !== 'git') throw Error('Invalid repository source.');
  if (/^(?:https?|ssh|git):\/\//i.test(source)) {
    let url;
    try { url = new URL(source); } catch { throw Error('Enter a valid HTTPS or SSH Git URL.'); }
    if (!url.hostname || !url.pathname || url.pathname === '/' || url.search || url.hash || url.password) throw Error('Enter a Git URL without passwords, query parameters or fragments.');
  } else if (source.includes('://') || !/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*:[^:].*$/.test(source) || /^[a-z]:/i.test(source)) {
    throw Error('Enter an HTTPS or SSH Git URL.');
  }
  return source;
}

function cloneFolder(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  // Use the same portable child name on Windows, macOS and Ubuntu.
  if (!name || name.length > 120 || Buffer.byteLength(name, 'utf8') > 255 || /[<>:"/\\|?*]/.test(name) || [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || /[. ]$/.test(name)
      || name === '.' || name === '..' || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error('Enter a folder name without paths or reserved characters.');
  return name;
}

function githubOwner(value) {
  const owner = typeof value === 'string' ? value.trim() : '';
  if (owner && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner)) throw Error('Enter a GitHub user or organization name.');
  return owner;
}

// Git rewrites progress with carriage returns, including when --progress is piped.
function cloneProgress(output) {
  const lines = String(output).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'), '').split(/[\r\n]/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = /^(?:remote:\s*)?(Enumerating objects|Counting objects|Compressing objects|Receiving objects|Resolving deltas|Updating files|Checking out files|Filtering content|Downloading LFS objects):\s*(.*)$/i.exec(lines[i].trim());
    if (!match) continue;
    const percent = /^(\d{1,3})%/.exec(match[2]);
    return { text: `${match[1]}: ${match[2]}`.slice(0, 240), percent: percent ? Math.min(100, Number(percent[1])) : null };
  }
  return null;
}

module.exports = { repositorySource, cloneFolder, githubOwner, cloneProgress };
