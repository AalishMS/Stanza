'use strict';

// Pure parsers for the Changes tab (main.js gitDiff / diffStat): text from `git diff`, `git status` and `git ls-files`
// in, plain data out. No Electron, no fs, so `npm test` runs them on plain Node (test/diff.test.js).

const LINES_MAX = 5000; // hunk lines kept per file; the rest is only counted (`cut`), the renderer says so

/** A path as git prints it: plain, or C-quoted ("a\tb", octal bytes for non-ASCII while core.quotepath is on). */
function unquotePath(s) {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return s;
  const ESC = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  const parts = [];
  let run = '';
  const body = s.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') { run += body[i]; continue; }
    if (run) { parts.push(Buffer.from(run)); run = ''; }
    const c = body[i + 1] ?? '';
    const oct = /^[0-7]{1,3}/.exec(body.slice(i + 1, i + 4));
    if (oct) { parts.push(Buffer.from([parseInt(oct[0], 8) & 255])); i += oct[0].length; } else { parts.push(Buffer.from(c in ESC ? [ESC[c]] : c)); i++; }
  }
  if (run) parts.push(Buffer.from(run));
  return Buffer.concat(parts).toString('utf8');
}

/** One path from a ---/+++ line: "/dev/null" -> null, else without its a/ or b/ prefix and git's trailing tab. */
function sidePath(s) {
  const p = unquotePath(s.replace(/\t$/, ''));
  return p === '/dev/null' ? null : p.replace(/^[ab]\//, '');
}

/** "diff --git a/x b/y" -> [x, y]. Unquoted names with spaces are only split when both sides are the same path. */
function headerPaths(rest) {
  const token = (s) => {
    if (s[0] !== '"') return null;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === '\\') i++;
      else if (s[i] === '"') return [s.slice(0, i + 1), s.slice(i + 2)];
    }
    return null;
  };
  let a;
  let b;
  const q = token(rest);
  if (q) [a, b] = q;
  else if (rest.endsWith('"')) {
    const at = rest.lastIndexOf(' "');
    a = rest.slice(0, at);
    b = rest.slice(at + 1);
  } else {
    const n = (rest.length - 5) / 2; // "a/" + X + " b/" + X
    if (Number.isInteger(n) && rest.slice(2, 2 + n) === rest.slice(5 + n)) return [rest.slice(2, 2 + n), rest.slice(5 + n)];
    const at = rest.indexOf(' b/');
    if (at < 0) return [null, null];
    a = rest.slice(0, at);
    b = rest.slice(at + 1);
  }
  return [sidePath(a), sidePath(b)];
}

/**
 * `git diff` (unified, a/ and b/ prefixes) -> [{ path, old, status, binary, mode, added, removed, cut, hunks }].
 * status: 'M' | 'A' | 'D' | 'R'; old = the path before a rename, else null; mode = "100644 → 100755" for a mode change.
 * Hunks are { head: the text after the second @@, o: first old line, n: first new line, lines }, each line keeping git's
 * first character (' ', '+', '-', or '\' for "No newline at end of file"). Past LINES_MAX lines a file's lines are only
 * counted: `cut` says how many were left out.
 */
function parseDiff(text, max = LINES_MAX) {
  const files = [];
  let f = null;
  let h = null; // the hunk being read, while it still expects lines
  let kept = 0;
  let oldMode = null;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('diff --git ')) {
      const [a, b] = headerPaths(line.slice(11));
      f = { path: b ?? a ?? '', old: a && b && a !== b ? a : null, status: 'M', binary: false, mode: null, added: 0, removed: 0, cut: 0, hunks: [] };
      if (f.old) f.status = 'R';
      files.push(f);
      h = null;
      kept = 0;
      oldMode = null;
      continue;
    }
    if (!f) continue;
    if (h && (h.oLeft > 0 || h.nLeft > 0 || line.startsWith('\\'))) {
      const c = line[0] ?? ' '; // a blank line inside a hunk is an empty context line whose space was lost
      if (c === '+') { f.added++; h.nLeft--; } else if (c === '-') { f.removed++; h.oLeft--; } else if (c !== '\\') { h.oLeft--; h.nLeft--; }
      if (kept < max) { h.lines.push(c === ' ' && !line ? ' ' : line); kept++; } else if (c !== '\\') f.cut++;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(line);
    if (m) {
      h = { head: m[5], o: +m[1], n: +m[3], lines: [], oLeft: m[2] == null ? 1 : +m[2], nLeft: m[4] == null ? 1 : +m[4] };
      f.hunks.push(h);
      continue;
    }
    if (f.hunks.length) continue; // trailing text after the last hunk
    if (line.startsWith('new file mode')) f.status = 'A';
    else if (line.startsWith('deleted file mode')) f.status = 'D';
    else if (line.startsWith('old mode ')) oldMode = line.slice(9);
    else if (line.startsWith('new mode ') && oldMode) f.mode = `${oldMode} → ${line.slice(9)}`;
    else if (line.startsWith('rename from ')) { f.old = unquotePath(line.slice(12)); f.status = 'R'; } else if (line.startsWith('rename to ')) f.path = unquotePath(line.slice(10));
    else if (line.startsWith('Binary files ') || line === 'GIT binary patch') f.binary = true;
    else if (line.startsWith('--- ')) {
      const p = sidePath(line.slice(4));
      if (p == null) f.status = 'A';
      else if (f.status !== 'A' && f.status !== 'D' && p !== f.path) f.old = p;
    } else if (line.startsWith('+++ ')) {
      const p = sidePath(line.slice(4));
      if (p == null) f.status = 'D';
      else f.path = p;
      if (f.old && f.old !== f.path && f.status === 'M') f.status = 'R';
    }
  }
  for (const x of files) for (const k of x.hunks) { delete k.oLeft; delete k.nLeft; }
  return files;
}

/** `git diff --numstat -z` -> [{ path, added, removed }]; a binary file counts null lines. Renames name the new path. */
function parseNumstat(out) {
  const list = [];
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(parts[i]);
    if (!m) continue;
    let p = m[3];
    if (p === '') { p = parts[i + 2] ?? ''; i += 2; } // a rename: "\0old\0new"
    list.push({ path: p, added: m[1] === '-' ? null : +m[1], removed: m[2] === '-' ? null : +m[2] });
  }
  return list;
}

/** The paths `git status --porcelain=v2` lists (changed, renamed (both names), unmerged, untracked), relative to the repo. */
function statusPaths(out) {
  const paths = [];
  for (const line of out.split('\n')) {
    const skip = line.startsWith('1 ') ? 8 : line.startsWith('2 ') ? 9 : line.startsWith('u ') ? 10 : line.startsWith('? ') ? 1 : 0;
    if (!skip) continue;
    const rest = line.split(' ').slice(skip).join(' ').replace(/\r$/, '');
    if (line[0] === '2') paths.push(...rest.split('\t').map(unquotePath));
    else paths.push(unquotePath(rest));
  }
  return paths;
}

/** `git ls-files -z` -> paths. */
const zList = (out) => (out || '').split('\0').filter(Boolean);

/** Lines in a text file's contents (a last line without a newline counts). */
function lineCount(text) {
  if (!text) return 0;
  let n = 0;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  return text.endsWith('\n') ? n : n + 1;
}

/** A new, untracked file as parseDiff would show it: one hunk adding every line. */
function addedFile(path, text, max = LINES_MAX) {
  const f = { path, old: null, status: 'A', binary: false, mode: null, added: 0, removed: 0, cut: 0, hunks: [] };
  if (!text) return f;
  const lines = text.split('\n');
  const eol = text.endsWith('\n');
  if (eol) lines.pop();
  f.added = lines.length;
  const shown = lines.slice(0, max).map((l) => `+${l.endsWith('\r') ? l.slice(0, -1) : l}`);
  f.cut = lines.length - shown.length;
  if (!eol && !f.cut) shown.push('\\ No newline at end of file');
  f.hunks.push({ head: '', o: 0, n: 1, lines: shown });
  return f;
}

module.exports = { parseDiff, parseNumstat, statusPaths, unquotePath, zList, lineCount, addedFile, LINES_MAX };
