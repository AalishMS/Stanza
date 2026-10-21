'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/lib/diff');

// `git -c core.quotepath=false diff HEAD --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ -M` from a scratch repo
// (git 2.47, Windows), with core.quotepath left on for the quoted name.
const SAMPLE = [
  'diff --git a/bin.dat b/bin.dat',
  'deleted file mode 100644',
  'index d5d0b8b..0000000',
  'Binary files a/bin.dat and /dev/null differ',
  'diff --git "a/h\\303\\251llo w\\303\\266rld.txt" "b/h\\303\\251llo w\\303\\266rld.txt"',
  'new file mode 100644',
  'index 0000000..3e75765',
  '--- /dev/null',
  '+++ "b/h\\303\\251llo w\\303\\266rld.txt"\t',
  '@@ -0,0 +1 @@',
  '+new',
  'diff --git a/my file.txt b/my file.txt',
  'index de98044..a7bc997 100644',
  '--- a/my file.txt\t',
  '+++ b/my file.txt\t',
  '@@ -1,3 +1,4 @@ function top() {',
  ' a',
  '-b',
  '+B',
  ' c',
  '+d',
  'diff --git a/old.txt b/new.txt',
  'similarity index 100%',
  'rename from old.txt',
  'rename to new.txt',
  'diff --git a/noeol.txt b/noeol.txt',
  'index 814f4a4..9ed40b4 100644',
  '--- a/noeol.txt',
  '+++ b/noeol.txt',
  '@@ -1,2 +1,2 @@',
  ' one',
  '-two',
  '+two',
  '\\ No newline at end of file',
  '',
].join('\n');

test('parseDiff: statuses, quoted and spaced names, renames, binary files, hunks and counts', () => {
  const files = d.parseDiff(SAMPLE);
  assert.deepEqual(files.map((f) => [f.path, f.old, f.status, f.binary, f.added, f.removed]), [
    ['bin.dat', null, 'D', true, 0, 0],
    ['héllo wörld.txt', null, 'A', false, 1, 0],
    ['my file.txt', null, 'M', false, 2, 1],
    ['new.txt', 'old.txt', 'R', false, 0, 0],
    ['noeol.txt', null, 'M', false, 1, 1],
  ]);
  assert.deepEqual(files[2].hunks, [{ head: 'function top() {', o: 1, n: 1, lines: [' a', '-b', '+B', ' c', '+d'] }]);
  assert.deepEqual(files[1].hunks[0], { head: '', o: 0, n: 1, lines: ['+new'] });
  assert.deepEqual(files[4].hunks[0].lines, [' one', '-two', '+two', '\\ No newline at end of file']);
});

test('parseDiff: CRLF lines, blank context lines, lines that look like headers, mode changes', () => {
  const text = [
    'diff --git a/x.js b/x.js',
    'old mode 100644',
    'new mode 100755',
    'index 1..2',
    '--- a/x.js',
    '+++ b/x.js',
    '@@ -1,4 +1,4 @@',
    ' a\r',
    '',
    '---- not a header',
    '+++ added',
    ' z',
    'diff --git a/run.sh b/run.sh',
    'old mode 100644',
    'new mode 100755',
  ].join('\n');
  const [x, run] = d.parseDiff(text);
  assert.deepEqual(x.hunks[0].lines, [' a', ' ', '---- not a header', '+++ added', ' z']);
  assert.deepEqual([x.added, x.removed, x.mode], [1, 1, '100644 → 100755']);
  assert.deepEqual([run.path, run.status, run.mode, run.hunks.length], ['run.sh', 'M', '100644 → 100755', 0]);
});

test('parseDiff: a rename with edits, and a renamed file whose names have spaces', () => {
  const text = [
    'diff --git a/src/a b.js b/lib/c d.js',
    'similarity index 90%',
    'rename from src/a b.js',
    'rename to lib/c d.js',
    'index 1..2 100644',
    '--- a/src/a b.js\t',
    '+++ b/lib/c d.js\t',
    '@@ -2 +2 @@',
    '-x',
    '+y',
  ].join('\n');
  const [f] = d.parseDiff(text);
  assert.deepEqual([f.path, f.old, f.status, f.added, f.removed], ['lib/c d.js', 'src/a b.js', 'R', 1, 1]);
  assert.deepEqual(f.hunks[0], { head: '', o: 2, n: 2, lines: ['-x', '+y'] });
});

test('parseDiff: past the line limit a file only counts', () => {
  const body = Array.from({ length: 10 }, (_, i) => `+l${i}`);
  const [f] = d.parseDiff(['diff --git a/big b/big', '--- a/big', '+++ b/big', '@@ -0,0 +1,10 @@', ...body].join('\n'), 4);
  assert.deepEqual([f.added, f.cut, f.hunks[0].lines.length], [10, 6, 4]);
});

test('parseNumstat: counts, binary files, renames (-z)', () => {
  const out = '-\t-\tbin.dat\0' + '1\t0\théllo wörld.txt\0' + '2\t1\tmy file.txt\0' + '0\t0\t\0old.txt\0new.txt\0' + '1\t1\tnoeol.txt\0';
  assert.deepEqual(d.parseNumstat(out), [
    { path: 'bin.dat', added: null, removed: null },
    { path: 'héllo wörld.txt', added: 1, removed: 0 },
    { path: 'my file.txt', added: 2, removed: 1 },
    { path: 'new.txt', added: 0, removed: 0 },
    { path: 'noeol.txt', added: 1, removed: 1 },
  ]);
  assert.deepEqual(d.parseNumstat(''), []);
});

test('statusPaths: every path porcelain v2 lists, quoted ones decoded', () => {
  const out = [
    '# branch.oid 78130549ad4f8a3bdca307cc740e53514d5c077b',
    '# branch.head master',
    '1 D. N... 100644 000000 000000 d5d0 0000 bin.dat',
    '1 A. N... 000000 100644 100644 0000 3e75 "h\\303\\251llo w\\303\\266rld.txt"',
    '1 .M N... 100644 100644 100644 de98 de98 my file.txt',
    '2 R. N... 100644 100644 100644 2fa9 2fa9 R100 new.txt\told.txt',
    'u UU N... 100644 100644 100644 100644 h1 h2 h3 both.txt',
    '? new dir/',
    '! ignored.log',
    '',
  ].join('\n');
  assert.deepEqual(d.statusPaths(out), ['bin.dat', 'héllo wörld.txt', 'my file.txt', 'new.txt', 'old.txt', 'both.txt', 'new dir/']);
});

test('unquotePath: C escapes and octal UTF-8 bytes; plain paths pass through', () => {
  assert.equal(d.unquotePath('"a\\tb\\"c\\\\d"'), 'a\tb"c\\d');
  assert.equal(d.unquotePath('"\\346\\227\\245.md"'), '日.md');
  assert.equal(d.unquotePath('plain "name".txt'), 'plain "name".txt');
});

test('addedFile: an untracked file as one added hunk; lineCount', () => {
  assert.deepEqual(d.addedFile('n.txt', 'a\r\nb\n').hunks, [{ head: '', o: 0, n: 1, lines: ['+a', '+b'] }]);
  const f = d.addedFile('n.txt', 'a\nb');
  assert.deepEqual([f.status, f.added, f.hunks[0].lines], ['A', 2, ['+a', '+b', '\\ No newline at end of file']]);
  assert.deepEqual(d.addedFile('e.txt', '').hunks, []);
  assert.equal(d.addedFile('n.txt', 'a\nb\nc\n', 2).cut, 1);
  assert.deepEqual([d.lineCount(''), d.lineCount('a'), d.lineCount('a\n'), d.lineCount('a\nb')], [0, 1, 1, 2]);
  assert.deepEqual(d.zList('a\0b c\0'), ['a', 'b c']);
});
