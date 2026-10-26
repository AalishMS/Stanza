'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ui = require('../src/lib/ui');

test('projectToFront: stable project order for Windows, macOS and remote paths, without mutating the list', () => {
  const all = [
    { path: 'C:\\code\\app', name: 'app' },
    { path: '/Users/test/app', name: 'app' },
    { path: 'ssh://00000000-0000-4000-8000-000000000001/home/test/app', name: 'app', remoteId: 'device' },
  ];
  const before = all.slice();
  const remote = ui.projectToFront(all, all[2].path);
  assert.deepEqual(remote, [all[2], all[0], all[1]]);
  assert.deepEqual(ui.projectToFront(remote, all[1].path), [all[1], all[2], all[0]]);
  assert.deepEqual(ui.projectToFront(remote, all[0].path), [all[0], all[2], all[1]]);
  assert.deepEqual(all, before);
});

test('projectToFront: Chats stays pinned and repeat use does not cause another save', () => {
  const chat = { path: '/Users/test/Claude Chats', chat: true };
  const a = { path: '/a' }, b = { path: '/b' };
  const all = [chat, a, b];
  const next = ui.projectToFront(all, b.path);
  assert.deepEqual(next, [chat, b, a]);
  assert.equal(ui.projectToFront(next, b.path), next);
  assert.equal(ui.projectToFront(all, chat.path), all);
  assert.equal(ui.projectToFront([a, b], a.path)[0], a);
});

test('projectToFront: absent or removed projects are not re-added', () => {
  const all = [{ path: '/a' }];
  assert.equal(ui.projectToFront(all, '/removed'), all);
  assert.deepEqual(ui.projectToFront([], '/removed'), []);
});

test('renderer.js declares only names lib/ui.js defines', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  const decl = /\/\* global ([^*]+?) -- lib\/ui\.js \*\//.exec(src);
  assert.ok(decl, 'the /* global ... -- lib/ui.js */ line is missing in renderer.js');
  for (const name of decl[1].split(',').map((s) => s.trim())) {
    assert.equal(typeof ui[name], 'function', `${name} is not exported by lib/ui.js`);
  }
});

test('contextWindow: 1M for Opus/Sonnet 4.6+, Haiku 5+, Fable, Mythos, [1m] or past 200k; else 200k', () => {
  const M = 1000000;
  const K = 200000;
  for (const [model, want] of [
    ['claude-opus-4-6-20260101', M],
    ['claude-opus-4-6', M],
    ['Opus 4.6', M],
    ['claude-opus-5-5', M],
    ['claude-opus-4-5-20251101', K],
    ['claude-opus-4-20250514', K], // the date is not a minor version
    ['claude-sonnet-5-5', M],
    ['claude-sonnet-5', M],
    ['claude-sonnet-4-6', M],
    ['Sonnet 5.5', M],
    ['claude-sonnet-4-5-20250929', K],
    ['claude-sonnet-4-5[1m]', M],
    ['claude-fable-5-1', M],
    ['Mythos', M],
    ['claude-haiku-5-5', M],
    ['Haiku 5.5', M],
    ['claude-haiku-4-5-20251001', K],
    ['Haiku 4.5', K],
    ['claude-3-opus-20240229', K], // old-style id: the date is not a version
    ['claude-3-5-sonnet-20241022', K],
    [null, K],
  ]) assert.equal(ui.contextWindow(model, 0), want, String(model));
  assert.equal(ui.contextWindow('claude-haiku-4-5', 250000), M);
});

test('normCombo puts modifiers in canonical order', () => {
  assert.equal(ui.normCombo('Shift+Ctrl+KeyT'), 'Ctrl+Shift+KeyT');
  assert.equal(ui.normCombo('Cmd+Alt+Backslash'), 'Alt+Cmd+Backslash');
  assert.equal(ui.normCombo('F5'), 'F5');
});

test('matchShortcut: exact combos win over patterns, patterns pass the digit / direction', () => {
  const key = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  const list = [
    { id: 'goto', pattern: 'Digits' },
    { id: 'first', },
    { id: 'focus', pattern: 'Arrows' },
    { id: 'close' },
  ];
  const keymap = { goto: ['Alt+Digits'], first: ['Alt+Digit1'], focus: ['Alt+Arrows'], close: ['Ctrl+KeyW', 'Ctrl+Shift+KeyW'] };
  const hit = (e) => { const r = ui.matchShortcut(list, keymap, e); return r && [r.s.id, r.arg]; };
  assert.deepEqual(hit(key('Digit1', { altKey: true })), ['first', undefined]);
  assert.deepEqual(hit(key('Digit7', { altKey: true })), ['goto', 7]);
  assert.deepEqual(hit(key('ArrowLeft', { altKey: true })), ['focus', 'left']);
  assert.deepEqual(hit(key('KeyW', { ctrlKey: true, shiftKey: true })), ['close', undefined]);
  assert.equal(hit(key('Digit0', { altKey: true })), null); // Digits is 1..9
  assert.equal(hit(key('KeyW', { altKey: true })), null);
  assert.equal(hit(key('ArrowLeft', { altKey: true, shiftKey: true })), null);
});

test('distinctParent names the fewest parent folders that tell same-name projects apart', () => {
  const proj = (p) => ({ path: p, name: p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() });
  const all = [proj('C:\\code\\clients\\app'), proj('C:\\code\\internal\\app'), proj('C:\\x\\other'),
    proj('D:\\a\\x\\tool'), proj('D:\\b\\x\\tool\\')];
  assert.equal(ui.distinctParent(all[0], all), 'clients');
  assert.equal(ui.distinctParent(all[1], all), 'internal');
  assert.equal(ui.distinctParent(all[2], all), '');
  assert.equal(ui.distinctParent(all[3], all), 'a/x');
  assert.equal(ui.distinctParent(all[4], all), 'b/x');
  assert.equal(ui.distinctParent(proj('/Users/me/App'), [proj('/Users/me/App'), proj('/tmp/app')]), 'me');
});

/** A fake xterm buffer of text lines. */
const buffer = (lines) => ({ length: lines.length, getLine: (i) => ({ translateToString: () => lines[i] }) });

test('dialogOpen: "Esc to cancel" within the bottom 3 non-empty lines', () => {
  assert.equal(ui.dialogOpen(buffer(['Allow edit?', '❯ 1. Yes', '  2. No', 'Esc to cancel · Tab to amend', '', ''])), true);
  assert.equal(ui.dialogOpen(buffer(['Esc to cancel', 'a', 'b', 'c'])), false);
  assert.equal(ui.dialogOpen(buffer(['Esc to cancel', '', 'b', '   ', 'c'])), true);
  assert.equal(ui.dialogOpen(buffer([])), false);
});

test('lineCells maps characters to cells, wide characters take two', () => {
  const cell = (chars, width) => ({ getChars: () => chars, getWidth: () => width });
  const cells = [cell('a', 1), cell('中', 2), cell('', 0), cell('b', 1), cell('', 1)];
  const term = { buffer: { active: { getLine: (y) => (y === 0 ? { length: cells.length, getCell: (x) => cells[x] } : undefined) } } };
  assert.deepEqual(ui.lineCells(term, 0), { text: 'a中b ', col: [0, 1, 3, 4] });
  assert.equal(ui.lineCells(term, 1), null);
});

test('fileMatches finds paths with line and column, not inside URLs', () => {
  const found = ui.fileMatches('see src/main.js:123 and C:\\x\\y.ts:4:2, ./README.md or https://example.com/a.js');
  assert.deepEqual(found.map((f) => [f.file, f.m[1], f.m[2]]), [
    ['src/main.js', '123', undefined],
    ['C:\\x\\y.ts', '4', '2'],
    ['./README.md', undefined, undefined],
  ]);
  assert.equal(found[0].m.index, 4);
  assert.deepEqual(ui.fileMatches('version 1.2.3, no files'), []);
  assert.equal(ui.fileMatches(Array.from({ length: 30 }, (_, i) => `f${i}.js`).join(' ')).length, 20);
});

test('jumpPill finds Claude\'s scrolled-up pill in its variants (v2.1.299), not plain text', () => {
  const row = (s) => ['', s, '─────', '> ', '─────'];
  assert.ok(ui.jumpPill(row('  every file" prompts. The finished sp Jump to bottom (ctrl+End) ↓ inutes.')));
  assert.ok(ui.jumpPill(row('3 new messages (ctrl+End) ↓')));
  assert.ok(ui.jumpPill(row('1 new message (click) ↓')));
  assert.ok(ui.jumpPill(row('Jump to bottom: fn+↓ to scroll')));
  assert.ok(!ui.jumpPill(row('✻ Churned for 14s · done Tuesday 10:41 PM')));
  assert.ok(!ui.jumpPill(row('we discussed the Jump to bottom pill')));
});

test('wheelNotch: one report per line/page event, touchpad pixels add up like xterm', () => {
  const acc = { partial: 0 };
  assert.equal(ui.wheelNotch(acc, { deltaY: -1, deltaMode: 1 }, 17), -1);
  assert.equal(ui.wheelNotch(acc, { deltaY: 3, deltaMode: 2 }, 17), 1);
  assert.equal(ui.wheelNotch(acc, { deltaY: 100, deltaMode: 0 }, 17), 1); // a mouse notch
  assert.equal(ui.wheelNotch(acc, { deltaY: 100, deltaMode: 0, shiftKey: true }, 17), 0);
  const pad = { partial: 0 };
  const sent = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(() => ui.wheelNotch(pad, { deltaY: 10, deltaMode: 0 }, 17));
  assert.equal(sent.filter((n) => n === 1).length, 1); // 10 x (10 / 17 * 0.3) = 1.76 lines
  assert.ok(sent.every((n) => n === 0 || n === 1));
});

test('altThumbTop: bottom at 0, top once the known top is reached, guess until then', () => {
  assert.equal(ui.altThumbTop(0, 0, 100, 60), 100);
  assert.equal(ui.altThumbTop(30, 0, 100, 60), 50);
  assert.equal(ui.altThumbTop(90, 0, 100, 60), 0);
  assert.equal(ui.altThumbTop(55, 220, 100, 60), 75);
  assert.equal(ui.altThumbTop(220, 220, 100, 60), 0);
});

test('claudeBanner spots the start banner at the top of Claude\'s view', () => {
  assert.ok(ui.claudeBanner(['', ' ▐▛███▜▌   Claude Code v2.1.299', '▝▜█████▛▘  Haiku 5.5 with high effort']));
  assert.ok(!ui.claudeBanner(['● The real Stanza app is already running', 'Claude Code is a CLI']));
});

test('jumpPill only reads the rows above the prompt box, not the prompt or older lines', () => {
  assert.ok(!ui.jumpPill(['', '', '─────', '> Jump to bottom (ctrl+End) ↓', '─────'])); // typed in the prompt
  assert.ok(!ui.jumpPill(['Jump to bottom: fn+↓ to scroll', 'reply', 'text', '', '─────', '> ', '─────']));
  assert.ok(!ui.jumpPill(['Jump to bottom (ctrl+End) ↓'])); // no prompt box on screen
});

test('claudeBanner needs the logo, not a version quoted in a reply', () => {
  assert.ok(!ui.claudeBanner(['  (tested on Claude Code v2.1.296)']));
});

test('wheelNotch: Alt/Ctrl touchpad deltas add up 5x faster, like xterm', () => {
  const plain = { partial: 0 }, fast = { partial: 0 };
  const e = { deltaY: 10, deltaMode: 0 };
  assert.equal(ui.wheelNotch(plain, e, 17), 0);
  assert.equal(ui.wheelNotch(fast, { ...e, altKey: true }, 17), 0); // 10 / 17 * 5 * 0.3 = 0.88
  assert.equal(ui.wheelNotch(fast, { ...e, altKey: true }, 17), 1);
});

test('promptBox finds the upper border of Claude\'s prompt box', () => {
  assert.equal(ui.promptBox(['text', '────────', 'more', '', '────────', '> ', '────────', '  ⏵⏵ auto mode on']), 4);
  assert.equal(ui.promptBox(['text', '> ', '────────']), -1);
});

test('lineShift measures how far the transcript rows moved between two repaints', () => {
  const doc = Array.from({ length: 60 }, (_, i) => (i % 4 === 3 ? '' : `line ${i}: some reply text`));
  const at = (top) => doc.slice(top, top + 20); // a 20-row view starting at row `top`
  assert.equal(ui.lineShift(at(30), at(30)), 0);
  assert.equal(ui.lineShift(at(30), at(25)), 5); // scrolled up 5
  assert.equal(ui.lineShift(at(30), at(36)), -6); // scrolled down 6
  assert.equal(ui.lineShift(at(30), at(14)), 16); // little overlap is enough
  assert.equal(ui.lineShift(at(40), at(0)), null); // more than a screen
  const fresh = at(30).map((l) => l && `${l} (redrawn)`);
  assert.equal(ui.lineShift(at(30), fresh), null);
  const streaming = [...at(30).slice(0, 18), 'new line', 'another']; // the bottom rows changed, the rest stayed
  assert.equal(ui.lineShift(at(30), streaming), 0);
});

test('matchSessions: a fresh tab gets the transcript born right after an Enter typed in it', () => {
  const tab = (id, startedAt, enters) => ({ id, project: 'P', sessionId: null, running: true, working: false, startedAt, enters });
  const sessionsBy = { P: [
    { id: 'old', birth: 500, mtime: 600 },
    { id: 's2', birth: 3500, mtime: 3600 },
    { id: 's1', birth: 3000, mtime: 3700 },
  ] };
  assert.deepEqual(ui.matchSessions([tab('b', 2900, [3450]), tab('a', 2000, [2950])], sessionsBy, new Set()), [
    { id: 'a', sessionId: 's1', followed: false },
    { id: 'b', sessionId: 's2', followed: false },
  ]);
  // typed into the newer tab first: each still gets its own (the older tab used to take the first file)
  assert.deepEqual(ui.matchSessions([tab('b', 2900, [2990]), tab('a', 2000, [3480])], sessionsBy, new Set()), [
    { id: 'b', sessionId: 's1', followed: false },
    { id: 'a', sessionId: 's2', followed: false },
  ]);
  // a tab nothing was typed in takes nobody's transcript
  assert.deepEqual(ui.matchSessions([tab('a', 2000, []), tab('b', 2900, [3450])], sessionsBy, new Set()),
    [{ id: 'b', sessionId: 's2', followed: false }]);
  // a's own file isn't listed yet (no reply): b's file still goes to b, whose Enter came last
  const later = { P: [{ id: 's2', birth: 3500, mtime: 3600 }] };
  assert.deepEqual(ui.matchSessions([tab('a', 2000, [2950]), tab('b', 2900, [3450])], later, new Set()),
    [{ id: 'b', sessionId: 's2', followed: false }]);
  // an exited tab is not matched
  assert.deepEqual(ui.matchSessions([{ ...tab('a', 1000, [2950]), running: false }], sessionsBy, new Set()), []);
});

test('matchSessions: a fork may write its transcript as it starts, before anything is typed', () => {
  const fork = { id: 'f', project: 'P', sessionId: null, fork: true, running: true, working: false, startedAt: 1000, enters: [] };
  assert.deepEqual(ui.matchSessions([fork], { P: [{ id: 'copy', birth: 4000, mtime: 4100 }] }, new Set()),
    [{ id: 'f', sessionId: 'copy', followed: false }]);
  // but not a file born long after with no Enter typed in it
  assert.deepEqual(ui.matchSessions([fork], { P: [{ id: 'other', birth: 60000, mtime: 61000 }] }, new Set()), []);
});

test('matchSessions: Claude\'s own record wins, so /resume to an old transcript is followed', () => {
  // /resume keeps writing to the resumed session's file, born long before the tab: no birth rule can match it
  const sessionsBy = { P: [{ id: 'old', birth: 100, mtime: 9000 }, { id: 'cur', birth: 2000, mtime: 3000 }] };
  const tab = { id: 'a', project: 'P', sessionId: 'cur', running: true, working: true, startedAt: 1000, enters: [8000] };
  assert.deepEqual(ui.matchSessions([{ ...tab, live: 'old' }], sessionsBy, new Set()),
    [{ id: 'a', sessionId: 'old', followed: true }]);
  // a "New session" tab that resumed before its first prompt, and a retired id resumed again
  assert.deepEqual(ui.matchSessions([{ ...tab, sessionId: null, live: 'old' }], sessionsBy, new Set(['old'])),
    [{ id: 'a', sessionId: 'old', followed: false }]);
  // no transcript for the live id yet (fresh tab): wait, and don't guess for this tab either
  assert.deepEqual(ui.matchSessions([{ ...tab, sessionId: null, live: 'new', enters: [1900] }], sessionsBy, new Set()), []);
  // /new or /clear: Claude lists the new transcript only after a reply, so the tab lets go of the old one at once
  assert.deepEqual(ui.matchSessions([{ ...tab, live: 'new' }], sessionsBy, new Set()),
    [{ id: 'a', sessionId: null, followed: true }]);
  // ...but not before its project's sessions were listed at all (launch)
  assert.deepEqual(ui.matchSessions([{ ...tab, live: 'new' }], {}, new Set()), []);
  // already on it, or exited
  assert.deepEqual(ui.matchSessions([{ ...tab, live: 'cur' }], sessionsBy, new Set()), []);
  assert.deepEqual(ui.matchSessions([{ ...tab, live: 'old', running: false }], sessionsBy, new Set()), []);
  // a tab without a record never takes another tab's live session by guessing
  const fresh = { id: 'b', project: 'P', sessionId: null, running: true, working: false, startedAt: 1900, enters: [1990] };
  assert.deepEqual(ui.matchSessions([fresh, { ...tab, sessionId: null, live: 'cur' }], sessionsBy, new Set()),
    [{ id: 'a', sessionId: 'cur', followed: false }]);
});

test('matchSessions: a retired transcript (closed split pane) is never adopted', () => {
  // A idles since 1000; B (closed) wrote s-b from 5000 on; Claude's exit bumped it last
  const a = { id: 'a', project: 'P', sessionId: 's-a', running: true, working: false, startedAt: 0, enters: [900] };
  const sessionsBy = { P: [{ id: 's-a', birth: 100, mtime: 1000 }, { id: 's-b', birth: 5000, mtime: 9000 }] };
  assert.deepEqual(ui.matchSessions([a], sessionsBy, new Set(['s-b'])), []);
  // nor by a fresh tab waiting for its first transcript
  const fresh = { id: 'x', project: 'P', sessionId: null, running: true, working: false, startedAt: 4800, enters: [] };
  assert.deepEqual(ui.matchSessions([fresh], sessionsBy, new Set(['s-b'])), []);
});

test('matchSessions: /clear is followed only by the tab it was typed in', () => {
  const sessionsBy = { P: [
    { id: 's-c', birth: 1000, mtime: 10000 },
    { id: 's-a', birth: 2000, mtime: 50000 },
    { id: 's-new', birth: 60000, mtime: 80000 },
  ] };
  const c = { id: 'c', project: 'P', sessionId: 's-c', running: true, working: false, startedAt: 0, enters: [9000] };
  const a = { id: 'a', project: 'P', sessionId: 's-a', running: true, working: false, startedAt: 0, enters: [40000, 59000] };
  // C comes first in tab order and idled longer, but A got the Enter
  assert.deepEqual(ui.matchSessions([c, a], sessionsBy, new Set()), [{ id: 'a', sessionId: 's-new', followed: true }]);
  // no Enter near the new file: nobody follows (a closed pane's transcript before it is retired)
  assert.deepEqual(ui.matchSessions([c, { ...a, enters: [40000] }], sessionsBy, new Set()), []);
  // still working: wait
  assert.deepEqual(ui.matchSessions([c, { ...a, working: true }], sessionsBy, new Set()), []);
});

test('matchSessions: a fresh tab nothing was typed in doesn\'t hold back /clear follow', () => {
  const sessionsBy = { P: [{ id: 's-a', birth: 200, mtime: 50000 }, { id: 's-new', birth: 60000, mtime: 80000 }] };
  const a = { id: 'a', project: 'P', sessionId: 's-a', running: true, working: false, startedAt: 0, enters: [59900] };
  const fresh = { id: 'n', project: 'P', sessionId: null, running: true, working: false, startedAt: 1000, enters: [] };
  assert.deepEqual(ui.matchSessions([fresh, a], sessionsBy, new Set()), [{ id: 'a', sessionId: 's-new', followed: true }]);
  assert.deepEqual(ui.matchSessions([{ ...fresh, running: false }, a], sessionsBy, new Set()), [{ id: 'a', sessionId: 's-new', followed: true }]);
  // a fresh tab whose first prompt was sent earlier (its own file not listed yet) loses it to the later Enter
  assert.deepEqual(ui.matchSessions([{ ...fresh, enters: [30000] }, a], sessionsBy, new Set()), [{ id: 'a', sessionId: 's-new', followed: true }]);
  // ...and while the /clear tab is still working on it, the file waits instead of going to the fresh tab
  assert.deepEqual(ui.matchSessions([{ ...fresh, enters: [30000] }, { ...a, working: true }], sessionsBy, new Set()), []);
  // with no Enter in the /clear tab, the fresh tab that typed takes it
  assert.deepEqual(ui.matchSessions([{ ...fresh, enters: [30000] }, { ...a, enters: [] }], sessionsBy, new Set()),
    [{ id: 'n', sessionId: 's-new', followed: false }]);
});

test('eolOf / withEol: the editor saves with the file\'s own line ending', () => {
  assert.equal(ui.eolOf('a\nb'), '\n');
  assert.equal(ui.eolOf('a\r\nb'), '\r\n');
  assert.equal(ui.eolOf('a\nb\r\nc'), '\r\n');
  assert.equal(ui.eolOf(''), '\n');
  assert.equal(ui.withEol('a\nb\n', '\r\n'), 'a\r\nb\r\n');
  assert.equal(ui.withEol('a\r\nb\n', '\r\n'), 'a\r\nb\r\n');
  assert.equal(ui.withEol('a\r\nb\n', '\n'), 'a\nb\n');
  assert.equal(ui.withEol('', '\r\n'), '');
});

test('activityGrid: Monday-first weeks ending on today, levels on a square-root scale, future days null', () => {
  const g = ui.activityGrid([{ date: '2026-10-20', messages: 100 }, { date: '2026-10-12', messages: 25 }, { date: '2026-01-01', messages: 999 }], '2026-10-20', 2);
  assert.equal(g.length, 2);
  assert.equal(g[0][0].date, '2026-10-12'); // a Monday
  assert.deepEqual([g[0][0].n, g[0][0].level], [25, 2]); // ceil(4 * sqrt(0.25))
  assert.equal(g[0][1].level, 0);
  assert.equal(g[1][1].date, '2026-10-20'); // today is a Tuesday
  assert.equal(g[1][1].level, 4);
  assert.equal(g[1][2], null);
  assert.equal(ui.activityGrid([], '2026-10-20', 1)[0][0].level, 0);
});

test('monthLabels: a label at each month start, too-close ones give way, none in the last column', () => {
  const g = ui.activityGrid([], '2026-10-21', 18); // starts Monday Jun 22; Jul 1 is in column 1
  assert.deepEqual(ui.monthLabels(g), [
    { col: 1, month: '2026-07' }, { col: 5, month: '2026-08' }, { col: 10, month: '2026-09' }, { col: 14, month: '2026-10' },
  ]);
  assert.deepEqual(ui.monthLabels(ui.activityGrid([], '2026-11-03', 3)), [{ col: 1, month: '2026-11' }]);
  assert.deepEqual(ui.monthLabels(ui.activityGrid([], '2026-10-20', 1)), []);
});

test('inlineChange: the changed middle of a replaced line, null when little is shared', () => {
  const mid = (a, b) => { const c = ui.inlineChange(a, b); return c && [a.slice(c.pre, a.length - c.suf), b.slice(c.pre, b.length - c.suf)]; };
  assert.deepEqual(ui.inlineChange('const a = 1;', 'const a = 2;'), { pre: 10, suf: 1 });
  assert.deepEqual(mid('foo()', 'foo(x)'), ['', 'x']); // nothing removed, "x" added
  assert.equal(ui.inlineChange('foo(1)', 'bar(2)'), null);
  assert.equal(ui.inlineChange('same', 'same'), null);
  assert.deepEqual(ui.inlineChange('a😀b', 'a😃b'), { pre: 1, suf: 1 }); // never inside a surrogate pair
  assert.deepEqual(mid('aaa', 'aaaa'), ['', 'a']); // prefix and suffix never overlap
});

test('inlineChange: whole words replaced, inserted text placed after a space or punctuation', () => {
  const mid = (a, b) => { const c = ui.inlineChange(a, b); return c && [a.slice(c.pre, a.length - c.suf), b.slice(c.pre, b.length - c.suf)]; };
  assert.deepEqual(mid('call(bar, 1)', 'call(baz, 1)'), ['bar', 'baz']);
  assert.deepEqual(mid('x = oldName + 1', 'x = newName + 1'), ['oldName', 'newName']);
  assert.deepEqual(mid('#a[h], #b-doc[h], #b-pill[h]', '#a[h], #b-doc[h], #b-diff[h], #b-pill[h]'), ['', '#b-diff[h], ']);
  assert.deepEqual(mid('f(a, c)', 'f(a, b, c)'), ['', 'b, ']);
  assert.deepEqual(mid('.dot.enter { x }', '.dot.enter, .diff.enter { x }'), ['', ', .diff.enter']);
  assert.deepEqual(mid('one two three', 'one three'), ['two ', '']); // removed text the same way
  assert.deepEqual(mid('ab', 'abab'), ['', 'ab']);
});

test('inlineMarks: each changed word run of a replaced line, near ones joined', () => {
  const marks = (a, b) => { const m = ui.inlineMarks(a, b); return m && [m.a.map(([s, e]) => a.slice(s, e)), m.b.map(([s, e]) => b.slice(s, e))]; };
  assert.deepEqual(marks("const config = { port: 3000, host: 'localhost', debug: false };", "const config = { port: 8080, host: 'localhost', debug: true };"),
    [['3000', 'false'], ['8080', 'true']]);
  assert.deepEqual(marks('call(bar, 1)', 'call(baz, 1)'), [['bar'], ['baz']]);
  assert.deepEqual(marks('f(a, c)', 'f(a, b, c)'), [[], ['b, ']]); // only inserted
  assert.deepEqual(marks('a.b.c = 1;', 'x.y.z = 1;'), [['a.b.c'], ['x.y.z']]); // under 3 characters apart: one mark
  assert.deepEqual(marks('one two three four five', 'one 2 three 4 five'), [['two', 'four'], ['2', '4']]);
  assert.equal(ui.inlineMarks('foo(1)', 'bar(2)'), null);
  assert.equal(ui.inlineMarks('same', 'same'), null);
});

test('linePairs: removed lines and the added lines right after them that look alike, in order', () => {
  assert.deepEqual(ui.linePairs([' a', '-const b = 1;', '-const c = 1;', '+const b = 2;', '+const c = 2;', ' d', '-f(e)', '+f(E)']),
    [[1, 3], [2, 4], [6, 7]]);
  assert.deepEqual(ui.linePairs(['+const a = 1;', '-const a = 2;', ' c']), []); // added before removed: not a replacement
  assert.deepEqual(ui.linePairs(['-foo(1)', '+bar(2)']), []); // too little in common
});

test('linePairs: runs of different lengths pair the lines that look alike', () => {
  // 3 removed, 4 added (the diff of src/mod.js that showed no marks while only equal runs were paired)
  assert.deepEqual(ui.linePairs([
    '-const list = [alpha, beta];', '-// one', '-module.exports = { greet };',
    '+const list = [alpha, delta];', '+// uno', '+// cuatro', '+module.exports = { greet, list };',
  ]), [[0, 3], [1, 4], [2, 6]]);
  // the first removed line is gone for good and the last added one is new: the middle two still pair
  assert.deepEqual(ui.linePairs(['-// gone entirely', '-const a = 1;', '+const a = 2;', '+let fresh = true;']), [[1, 2]]);
  // a run too big to compare every pair falls back to line i with line i when the counts match
  const big = Array.from({ length: 60 }, (_, i) => `-x${i}`).concat(Array.from({ length: 60 }, (_, i) => `+y${i}`));
  assert.deepEqual(ui.linePairs(big)[59], [59, 119]);
  assert.deepEqual(ui.linePairs(big.slice(1)), []);
});
