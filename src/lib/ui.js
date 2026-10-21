'use strict';

// Pure helpers for renderer.js: no DOM, no `api`. index.html loads this with a <script> tag before renderer.js (classic
// scripts share one global scope); `npm test` requires it (test/ui.test.js). Everything is inside a function, so only the
// exported helpers become globals and a same-named const in renderer.js can't clash with a private one here.

(() => {
  // ------------------------------------------------------------- context ----
  // The window size is not stored in transcripts, so it is derived from the model. Current models have 1M by default:
  // Opus and Sonnet 4.6+, Haiku 5+, Fable, Mythos. Older ones (Haiku 4.5, Opus/Sonnet up to 4.5, Claude 2/3) and
  // unknown names are 200k unless chosen with "[1m]" (main.js re-attaches it from settings or /model, since
  // transcripts drop it) or a session has gone past it.
  const CONTEXT_WINDOW = 200000;
  const CONTEXT_WINDOW_LARGE = 1000000;
  const LARGE_FROM = { opus: 4.6, sonnet: 4.6, haiku: 5 };
  function contextWindow(model, used) {
    const m = String(model || '').toLowerCase();
    if (used > CONTEXT_WINDOW || m.includes('[1m]')) return CONTEXT_WINDOW_LARGE;
    if (/\b(fable|mythos)\b/.test(m)) return CONTEXT_WINDOW_LARGE;
    // "claude-sonnet-4-6-20260101", "Sonnet 4.6", "claude-haiku-5-5"; the (?!\d) keeps a date out of the version, so
    // old-style ids ("claude-3-opus-20240229") don't match at all
    const v = /(opus|sonnet|haiku)[- ]?(\d{1,2})(?!\d)(?:[-.](\d)(?!\d))?/.exec(m);
    if (v && Number(v[2]) + Number(v[3] || 0) / 10 >= LARGE_FROM[v[1]]) return CONTEXT_WINDOW_LARGE;
    return CONTEXT_WINDOW;
  }

  // ----------------------------------------------------------- shortcuts ----

  const MODS = ['Ctrl', 'Alt', 'Shift', 'Cmd']; // canonical order (macOS shows ⌃⌥⇧⌘)
  const normCombo = (c) => { const p = c.split('+'); const key = p.pop(); return [...MODS.filter((m) => p.includes(m)), key].join('+'); };
  const comboOf = (e, key = e.code) =>
    [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Cmd', key].filter(Boolean).join('+');

  /**
   * The action bound to this key event, as { s, arg } (arg = the digit or arrow direction for pattern actions), or null.
   * Exact combos win over Digits / Arrows patterns.
   */
  function matchShortcut(list, keymap, e) {
    const patterns = [];
    if (/^Digit[1-9]$/.test(e.code)) patterns.push(comboOf(e, 'Digits'));
    if (e.code.startsWith('Arrow')) patterns.push(comboOf(e, 'Arrows'));
    const exact = comboOf(e);
    const s = list.find((x) => keymap[x.id].includes(exact))
      || list.find((x) => x.pattern && keymap[x.id].some((c) => patterns.includes(c)));
    if (!s) return null;
    const arg = s.pattern === 'Digits' ? Number(e.code.slice(5)) : s.pattern === 'Arrows' ? e.code.slice(5).toLowerCase() : undefined;
    return { s, arg };
  }

  // ------------------------------------------------------------ projects ----

  /**
   * The parent folders that tell project `p` apart from the others in `all` with the same folder name ("clients" for
   * C:\code\clients\app), else ''.
   */
  function distinctParent(p, all) {
    const same = all.filter((x) => x.path !== p.path && x.name.toLowerCase() === p.name.toLowerCase());
    if (!same.length) return '';
    const up = (q) => q.path.replace(/[\\/]+$/, '').split(/[\\/]/).slice(0, -1).reverse(); // nearest parent first
    const mine = up(p);
    for (let k = 1; k <= mine.length; k++) {
      const tail = mine.slice(0, k).join('/').toLowerCase();
      if (same.every((x) => up(x).slice(0, k).join('/').toLowerCase() !== tail)) return mine.slice(0, k).reverse().join('/');
    }
    return p.path;
  }

  // -------------------------------------------------------------- screen ----

  /**
   * Is one of Claude's input dialogs open at the bottom of this xterm buffer? Permission prompts, AskUserQuestion and the
   * folder trust dialog all end in an "Esc to cancel" footer within the bottom 3 non-empty lines.
   */
  function dialogOpen(b) {
    for (let i = b.length - 1, seen = 0; i >= 0 && seen < 3; i--) {
      const s = b.getLine(i)?.translateToString(true).trim();
      if (!s) continue;
      seen++;
      if (s.includes('Esc to cancel')) return true;
    }
    return false;
  }

  // File links: paths Claude prints (src/main.js:123, C:\x\y.ts:4:2, ./README.md). One buffer line at a time, so a path
  // wrapped over two rows is not a link. URLs are left to the web-links addon.
  const FILE_RE = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\w.@+-]+[\\/])*[\w@+-][\w.@+-]*\.[A-Za-z][A-Za-z0-9]{0,11}(?::(\d+)(?::(\d+))?)?/g;
  const URL_RE = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

  /** The line's text plus the cell column of each character (wide characters take two cells). */
  function lineCells(term, y) {
    const line = term.buffer.active.getLine(y);
    if (!line) return null;
    let text = '';
    const col = [];
    for (let x = 0; x < line.length; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue; // second half of a wide character
      const ch = cell.getChars() || ' ';
      for (let i = 0; i < ch.length; i++) col.push(x);
      text += ch;
    }
    return { text, col };
  }

  /** File-like matches in a line of text, outside URLs, at most 20: [{ m (the match: index, [1] line, [2] col), file }]. */
  function fileMatches(text) {
    const urls = [...text.matchAll(URL_RE)].map((m) => [m.index, m.index + m[0].length]);
    return [...text.matchAll(FILE_RE)]
      .filter((m) => !urls.some(([a, b]) => m.index < b && m.index + m[0].length > a))
      .slice(0, 20)
      .map((m) => ({ m, file: m[0].replace(/(?::\d+){1,2}$/, '') }));
  }

  // Claude's fullscreen view shows this pill above the prompt only while it is scrolled up: "Jump to bottom" or
  // "3 new messages", then " (ctrl+End) ↓", " (click) ↓" or ": fn+↓ to scroll" (Claude Code v2.1.299).
  const PILL_RE = /(?:Jump to bottom|\d+ new messages?)(?: \(|: )/;

  /**
   * True if Claude's "scrolled up" pill is in these bottom screen lines: in the 2 rows above the prompt box (its
   * upper `───` border, the second border from the bottom), so a reply or the typed prompt quoting it doesn't count.
   */
  function jumpPill(lines) {
    const top = promptBox(lines);
    return top > 0 && lines.slice(Math.max(0, top - 2), top).some((l) => PILL_RE.test(l));
  }

  /** Row of the upper `───` border of Claude's prompt box (the second border from the bottom), or -1. */
  function promptBox(lines) {
    let found = 0;
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith('───') && ++found === 2) return i;
    return -1;
  }

  /**
   * How many rows the text moved down from `prev` to `cur` (two snapshots of the same screen area): > 0 = the view
   * scrolled up. Only non-blank rows count; the shift needs 3+ of them to match and 4x more matches than
   * mismatches, the smallest such shift wins a tie. null = no match (moved more than a screen, or redrawn).
   */
  function lineShift(prev, cur) {
    const n = Math.min(prev.length, cur.length);
    let best = null;
    let bestSame = 0;
    for (let k = -(n - 3); k <= n - 3; k++) {
      let same = 0;
      let diff = 0;
      for (let i = Math.max(0, -k); i < n && i + k < n; i++) {
        if (!prev[i].trim()) continue;
        if (prev[i] === cur[i + k]) same++;
        else diff++;
      }
      if (same < 3 || same < 4 * diff) continue;
      if (same > bestSame || (same === bestSame && Math.abs(k) < Math.abs(best))) {
        best = k;
        bestSame = same;
      }
    }
    return best;
  }

  /** True if Claude's start banner (logo + "Claude Code v2.1.299") is in these lines: its fullscreen view is at the top. */
  function claudeBanner(lines) {
    return lines.some((l) => /[▐▛▜▌▝▘].*Claude Code v\d/.test(l));
  }

  /**
   * The wheel report xterm 6 sends for a wheel event in mouse-tracking mode: -1 up, 1 down, 0 none (a small
   * touchpad delta still adding up). Mirrors CoreMouseService.consumeWheelEvent; `acc.partial` carries the remainder.
   */
  function wheelNotch(acc, e, cellH) {
    if (!e.deltaY || e.shiftKey) return 0;
    if (e.deltaMode !== 0) return Math.sign(e.deltaY); // lines or pages
    if (!cellH) return 0;
    let r = e.deltaY / cellH;
    if (e.altKey || e.ctrlKey) r *= 5; // xterm's default fastScrollSensitivity
    if (Math.abs(e.deltaY) < 50) r *= 0.3;
    acc.partial += r;
    const n = Math.trunc(acc.partial);
    acc.partial %= 1;
    return Math.sign(n);
  }

  /**
   * Thumb offset on the alternate screen: `off` wheel notches above the bottom, the top `max` notches up
   * (0 = not reached yet, then `guess`), `room` = track height minus thumb height. Bottom = `room`.
   */
  function altThumbTop(off, max, room, guess) {
    if (off <= 0) return room;
    return room * (1 - off / Math.max(off, max || guess));
  }

  /**
   * Which transcript each Claude tab shows. `tabs`: Claude tabs in tab order, `{ id, project, sessionId, fork, running,
   * working, startedAt, enters, live }` (`enters` = times an Enter was typed in it; `live` = the session its Claude
   * says it is on, from ~/.claude/sessions, else null); `sessionsBy`: project path -> `[{ id, birth, mtime }]`;
   * `retired`: ids a tab let go of (closed, restarted as new, left by /clear), never handed to another tab. Returns
   * `[{ id, sessionId, followed }]` for the tabs whose transcript changes.
   * A tab with a `live` id takes it as soon as its transcript is listed (exact; the only way to follow /resume, which
   * keeps writing to the old session's file), and lets go of its old one (`sessionId: null`) while it isn't (/new,
   * /clear: listed after the first reply). Such tabs are left out of the guessing below, which covers Claude versions
   * without that record.
   * Claude creates a transcript when a prompt is sent (a session's first, or the first after /clear), so an Enter was
   * typed in its tab just before the file was born: each free file goes to the tab whose Enter came last before it.
   * Candidates: fresh and forked tabs still without a transcript (an Enter up to 60 s before, so a prompt typed while
   * Claude was starting counts; a fork may write its copy as it starts, before anything is typed), and tabs whose own
   * transcript had gone quiet when the file was born (/clear; an Enter up to 10 s before). A tab nothing was typed in
   * gets nothing, so two new tabs typed into in either order each get their own. If the winner is still working, the
   * file waits for a later call.
   */
  function matchSessions(tabs, sessionsBy, retired) {
    const claimed = new Set(retired);
    for (const t of tabs) for (const id of [t.sessionId, t.live]) if (id) claimed.add(id);
    const out = [];
    const changed = new Set();
    for (const t of tabs) {
      if (!t.running || !t.live || t.live === t.sessionId) continue;
      const list = sessionsBy[t.project];
      if (!list) continue; // not listed yet at all (launch)
      if (list.some((s) => s.id === t.live)) out.push({ id: t.id, sessionId: t.live, followed: !!t.sessionId });
      // /new or /clear: Claude lists the transcript only after a reply, so until then the tab is a new session, not the old one
      else if (t.sessionId) out.push({ id: t.id, sessionId: null, followed: true });
    }
    // the last Enter typed in `t` (since it started) up to `ms` before file `s` was born
    const lastEnter = (t, s, ms) => Math.max(-Infinity,
      ...(t.enters || []).filter((e) => e >= t.startedAt && e >= s.birth - ms && e <= s.birth + 250));
    const guessed = tabs.filter((t) => t.running && !t.live).sort((a, b) => a.startedAt - b.startedAt);
    for (const project of new Set(guessed.map((t) => t.project))) {
      const list = sessionsBy[project] || [];
      for (const s of list.filter((x) => !claimed.has(x.id)).sort((a, b) => a.birth - b.birth)) {
        let best = null;
        let bestAt = -Infinity;
        for (const t of guessed) {
          if (t.project !== project || changed.has(t.id)) continue;
          let at;
          if (!t.sessionId) {
            if (s.birth < t.startedAt - 1000) continue;
            at = Math.max(lastEnter(t, s, 60000), t.fork && s.birth <= t.startedAt + 15000 ? t.startedAt : -Infinity);
          } else {
            const cur = list.find((x) => x.id === t.sessionId);
            if (!cur || s.birth < t.startedAt || s.birth < cur.mtime - 2000 || s.mtime <= cur.mtime) continue;
            at = lastEnter(t, s, 10000);
          }
          if (at > bestAt) { best = t; bestAt = at; }
        }
        if (!best || (best.sessionId && best.working)) continue;
        claimed.add(s.id);
        changed.add(best.id);
        out.push({ id: best.id, sessionId: s.id, followed: !!best.sessionId });
      }
    }
    return out;
  }

  // ------------------------------------------------------- markdown edit ----
  // A textarea turns every CRLF into LF, so the markdown editor saves with the file's own line ending (else a CRLF
  // file would be rewritten whole). A file with any CRLF counts as CRLF.
  const eolOf = (text) => (/\r\n/.test(text) ? '\r\n' : '\n');
  const withEol = (text, eol) => (eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'));

  // -------------------------------------------------------- home activity ----
  /**
   * The home screen's activity map: `weeks` columns of 7 days (Monday first), the last one holding `today`
   * ("YYYY-MM-DD"). Cells: { date, n, level 0-4 } (level on a square-root scale of the busiest day shown, so one huge
   * day doesn't wash out the rest), null for days after today.
   */
  function activityGrid(days, today, weeks) {
    const dayMs = 86400000;
    const ord = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / dayMs;
    const iso = (o) => new Date(o * dayMs).toISOString().slice(0, 10);
    const t = ord(today);
    const start = t - ((new Date(t * dayMs).getUTCDay() + 6) % 7) - (weeks - 1) * 7;
    const count = new Map((days || []).map((d) => [d.date, d.messages || 0]));
    let max = 0;
    for (let o = start; o <= t; o++) max = Math.max(max, count.get(iso(o)) || 0);
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const o = start + w * 7 + d;
        if (o > t) { col.push(null); continue; }
        const n = count.get(iso(o)) || 0;
        col.push({ date: iso(o), n, level: n && max ? Math.max(1, Math.ceil(4 * Math.sqrt(n / max))) : 0 });
      }
      out.push(col);
    }
    return out;
  }

  /**
   * Month labels over the activity map: { col, month: "YYYY-MM" } for each week column holding a month's 1st, plus the
   * first column's month. Labels need 3 columns of room: a closer older one is dropped, and none starts in the last
   * column (it would run past the map).
   */
  function monthLabels(grid) {
    const out = [];
    grid.forEach((col, i) => {
      const first = col.find((c) => c && c.date.endsWith('-01')) || (i === 0 ? col[0] : null);
      if (!first || i > grid.length - 2) return;
      if (out.length && i - out[out.length - 1].col < 3) out.pop();
      out.push({ col: i, month: first.date.slice(0, 7) });
    });
    return out;
  }

  // ---------------------------------------------------------------- diff ----
  /**
   * What changed inside a removed line `a` that the added line `b` replaced: { pre, suf } = the lengths both share at the
   * start and at the end, so a[pre, a.length - suf) and b[pre, b.length - suf) are the changed parts. A replaced part
   * grows to whole words ("bar" -> "baz", not "r" -> "z"); text only inserted (or only removed) could often sit in several
   * places and is put where it starts after a space or punctuation ("b, " in "a, b, c", not ", b"). Null when they share
   * under a third of the longer line: then marking the middle would mark nearly all of it.
   */
  function inlineChange(a, b) {
    const max = Math.min(a.length, b.length);
    let pre = 0;
    while (pre < max && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < max - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    if (pre && /[\ud800-\udbff]/.test(a[pre - 1])) pre--; // never split a surrogate pair
    if (suf && /[\udc00-\udfff]/.test(a[a.length - suf])) suf--;
    if (pre + suf === a.length && pre + suf === b.length) return null; // the same line
    const word = (c) => c != null && /[\p{L}\p{N}_$]/u.test(c);
    if (pre < a.length - suf && pre < b.length - suf) {
      while (pre > 0 && word(a[pre - 1]) && (word(a[pre]) || word(b[pre]))) pre--;
      while (suf > 0 && word(a[a.length - suf]) && (word(a[a.length - suf - 1]) || word(b[b.length - suf - 1]))) suf--;
    } else {
      const s = a.length > b.length ? a : b; // the side with the extra text, s[pre, pre + len)
      const len = s.length - pre - suf;
      let lo = pre;
      while (lo > 0 && s[lo - 1] === s[lo - 1 + len]) lo--; // as far left as the same text could sit
      // each place scores for starting and for ending at a space (or the line's edge), less for a word's edge
      const space = (c) => c == null || /\s/.test(c);
      const edge = (x, y) => x == null || y == null || word(x) !== word(y);
      const score = (q) => (space(s[q - 1]) ? 3 : 0) + (edge(s[q - 1], s[q]) ? 1 : 0) + (space(s[q + len]) ? 3 : 0) + (edge(s[q + len - 1], s[q + len]) ? 1 : 0);
      let best = pre; // ties keep git's choice, the rightmost
      for (let q = pre - 1; q >= lo; q--) if (score(q) > score(best)) best = q;
      suf += pre - best;
      pre = best;
    }
    return (pre + suf) * 3 >= Math.max(a.length, b.length) ? { pre, suf } : null;
  }

  /**
   * Pairs of a hunk's lines to compare with inlineChange: each run of removed lines followed directly by as many added
   * lines (line i of one with line i of the other). `lines` keep git's first character; returns [removed, added] indexes.
   */
  function linePairs(lines) {
    const out = [];
    for (let i = 0; i < lines.length;) {
      if (lines[i][0] !== '-') { i++; continue; }
      let j = i;
      while (j < lines.length && lines[j][0] === '-') j++;
      let k = j;
      while (k < lines.length && lines[k][0] === '+') k++;
      if (k - j === j - i) for (let n = 0; n < j - i; n++) out.push([i + n, j + n]);
      i = k;
    }
    return out;
  }

  const helpers = {
    contextWindow, normCombo, comboOf, matchShortcut, distinctParent, dialogOpen, lineCells, fileMatches,
    jumpPill, promptBox, lineShift, claudeBanner, wheelNotch, altThumbTop, matchSessions, eolOf, withEol, activityGrid,
    monthLabels, inlineChange, linePairs,
  };
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  else Object.assign(globalThis, helpers);
})();
