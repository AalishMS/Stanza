# Stanza

Desktop wrapper around the real `claude` CLI (Windows first, macOS best effort). Electron + xterm.js + `@lydell/node-pty`
(ConPTY on Windows).
Each tab is a genuine Claude Code session, so never re-implement CLI features (slash commands, permissions,
model switching). The app only adds what the terminal lacks: a project sidebar, tabs, live git status per
project, and a running-servers panel.

Personal tool for one user on Windows 11, also run on macOS by a friend (never tested here). No Linux, no telemetry,
no auto-update (only a manual Update button for git clones, see "Update").

**Every change must work on both Windows and macOS.** Any new feature or fix that touches processes, paths, shells,
keys, window chrome or fonts needs a Mac path too: a small `IS_MAC` branch next to the Windows code (which stays as it
is), fail-soft so a Mac-only failure never breaks Windows or crashes the app. Shortcuts go through `mod(e)` and their
text through `kbd()`; user-facing "PowerShell" / "Explorer" through `SHELL_LABEL` / `FILES_APP`. Update the macOS
notes below and the README's macOS section in the same change, and tell the user what to test on a Mac.

## Commands

```
npm start            # run from source (fastest loop)
npm run check        # lint + tests; the pre-commit hook runs them too
npm run package      # build dist\win-unpacked\Stanza.exe (fails if that exe is running)
npm run package:mac  # macOS only: dist/mac-*/Stanza.app (unsigned)
npm run shortcut     # Desktop + Start menu shortcuts -> packaged exe
```

The logo master is `assets/icon-source.png` (1024 px, transparent outside the rounded tile); `assets/icon.png` (512 px), the multi-size `assets/icon.ico` (mark scaled 1.12x inside the tile so it isn't small on the taskbar) and the macOS `assets/icon-mac.png` (tile at 824 px on a 1024 transparent canvas, Apple's grid) are derived from it. There is no `npm run icon` generator.

`npm run lint` (ESLint, bug rules only, no style) and `npm test` (`node:test`, no framework) must pass. Tests cover the
pure code in `src/lib/`; anything touching the UI, ptys or processes still needs a run of the real app (see "Testing").
CI (`.github/workflows/check.yml`) runs `npm run check` on Windows and macOS for every push (`npm ci --ignore-scripts`:
no Electron, no node-pty), so keep `src/lib/` and the tests free of both. Test paths must suit both platforms.
The pre-commit hook (`.githooks/pre-commit`, enabled once per clone with `git config core.hooksPath .githooks`) runs the
same lint + tests and refuses the commit if they fail. It calls eslint and `node --test` directly (2 s instead of npm's
7 s on Windows), so keep it in step with `check` in package.json; it checks the working tree, not only what is staged.

## Principles: minimal and fast

- **Keep it small.** No bundler, no framework, no TypeScript, no CSS preprocessor. Plain CommonJS in main/preload
  and a plain browser script in the renderer. xterm is loaded from `node_modules` with `<script>` tags.
  Add a dependency only when the alternative is clearly worse.
- **Fast to start, cheap to run.** No work while the window is hidden (`document.hidden` pauses polling).
  Terminal output is coalesced (6 ms) before IPC. Git/port polling skip overlapping runs. Only re-render DOM
  when data actually changed (`lastSidebarKey`, `JSON.stringify` diffs).
- **Terminal first.** The terminal gets the space and the focus. Chrome around it stays quiet.
- **Don't fight Claude Code.** Our shortcuts mostly avoid keys it uses (`Ctrl+B/W/J`...); `Ctrl+T` (new session), `Ctrl+S` (sidebar), `Ctrl+W` (close session; costs Claude's delete-word) and `Ctrl+K` (search sessions; costs Claude's kill-to-end-of-line) are deliberate exceptions. The defaults are `Ctrl+T`, `Ctrl+S`, `Ctrl+W` (also `Ctrl+Shift+W`), `Ctrl+K` (also `Ctrl+Shift+F`), `Ctrl+Shift+S` (servers),
  `Ctrl+Tab`, `Alt+1..9`, `Ctrl+,` (settings), and for split view `Ctrl+Shift+→` (new session beside), `Ctrl+Shift+↓` (new session below), `Ctrl+Shift+↑` (new session above), `Ctrl+Shift+/` (take the focused pane out of the split, only while split), `Ctrl+Shift+\` (unsplit),
  `Alt+arrows` (move pane focus) and `Ctrl+Alt+arrows` (move the divider), `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (terminal text size while a terminal has focus, else window zoom). The two arrow shortcuts only act while split; otherwise the keys reach the terminal.
  On macOS the same shortcuts use Cmd (`⌘1..9` / `⌘arrows` for `Alt+1..9` / `Alt+arrows`), so Ctrl stays entirely Claude's; `Ctrl+Tab` stays.
  All of them are editable on the settings page (see "Shortcuts"); never add a hard-coded app shortcut, add a `SHORTCUTS` entry.
- Prefer the smallest change that works. No speculative settings screens, plugin systems or abstractions.

## Design rules

The UI follows **shadcn/ui** (dark theme, neutral base) with a few deliberate tweaks. **`DESIGN.md` is the source of
truth: read it before any UI change** and update it in the same change when a rule moves. shadcn is copied as CSS
tokens and component recipes, never installed (no React/Tailwind/Radix).

- Tokens use shadcn names (`--background #0a0a0a`, `--sidebar #030303` = the darker left frame, `--foreground`, `--muted`, `--accent` = neutral hover surface,
  `--border`, `--input`, `--ring`, `--sidebar`...) as CSS variables at the top of `src/styles.css`. Change tokens,
  not scattered values. **Two themes** plus Claude colors: color tokens live in `:root, [data-theme="dark"]`, `[data-theme="light"]`,
  `[data-theme="claude-dark"]` and `[data-theme="claude-light"]`; every UI change must look right in all four (check light too).
- **`--primary` is the single accent variable**, chosen in Settings > Appearance (`ui.accent`: blue `#2850a5` default,
  violet, teal, rose; `--hue-*` + `[data-accent]` rules in styles.css). Hover and ring tints derive from it with
  `color-mix()`. Never hard-code an accent hue anywhere else.
- Color otherwise only carries meaning (`--success` running, `--warning` dirty/busy, `--destructive`). No badges,
  gradients or decorative color. Git info is plain text.
- Buttons are `.btn` + `primary|outline|ghost|destructive` + `sm|icon` (rounded-md, no pills). There is no tab
  strip: sidebar session rows are the tabs. Sidebar rows are flat 32 px rounded rows with no borders or boxes.
- Terminal typography and the ANSI palette rules are in DESIGN.md section 5. `xtermTheme()` reads `--background`;
  main.js's `CHROME` literals (window background, title bar buttons) must match each theme's `--background`.

## Architecture

```
src/main.js      window, ptys, git status, port scan, persistence, IPC handlers
src/preload.js   window.api bridge (contextIsolation on, sandbox on, no nodeIntegration)
src/renderer.js  all UI: tabs (as sidebar rows), sidebar, servers panel, status bar, dialogs, polling
src/lib/parse.js pure parsers for main (git, netstat, lsof/ps, transcripts, mcp list, split remap); no Electron, no fs
src/lib/images.js  transcript image index (scanImages) for main, plus the .md files a session wrote (`docs`); fs only
src/lib/md.js    markdown -> plain data (parseMarkdown) for the reader; a <script> before renderer.js like lib/ui.js
src/lib/ui.js    pure renderer helpers (contextWindow, shortcuts matching, distinctParent, dialogOpen, file links);
                 a <script> before renderer.js (shared globals, listed in renderer.js's `/* global ... -- lib/ui.js */`)
test/            node:test files, one per lib module
src/index.html   shell + CSP (script-src 'self'); src/styles.css (tokens on :root, see DESIGN.md)
DESIGN.md        design system (shadcn/ui + tweaks): tokens, component recipes, terminal palette rules
scripts/         create-shortcut.ps1, update.ps1 / update.sh (rebuild a packaged copy, see "Update"), rename-handoff.js (see "State"),
                 install.ps1 / install.sh (the README's one-line install, see "Install")
site/            the product page (static, open index.html or serve the folder; not packaged). css/ + js/ in small files, the UI
                 mockups are js/mock/ (markup drawn live and scaled); css/tailwind.css is generated from their classes, see
                 site/README.md. No external requests (system fonts, no CDN). Linted as browser scripts like renderer.js.
                 Copy claims come from the README / this file, not from memory.
```

- **State** lives in `%APPDATA%\stanza\state.json`, on macOS in Electron's userData under `~/Library/Application Support` (projects, ui flags incl. sidebar widths, theme, accent and shortcut overrides, window bounds). Written
  synchronously via tmp file + rename. The app used to be "Claude Bench" and before that "Claude Terminal": if no state
  exists yet, the loader reads `%APPDATA%\claude-bench\state.json`, else `claude-terminal\state.json`, once (`legacyStateFile`, a sibling of userData, so a `--user-data-dir` test instance never loads the real state and resumes its tabs).
  The rename to Stanza (package name `stanza`, appId `com.local.stanza`) also left: `registerToastIdentity` deleting the
  old `com.local.claudebench` key, `create-shortcut.ps1` removing "Claude Bench.lnk", and the install scripts reusing an
  existing `Programs\claude-bench` / `~/.claude-bench` clone and swapping the old `~/Applications` link. An old build's
  updater (copied before the pull) reopens the old exe/.app path, which the new build doesn't produce, but it runs the
  new `npm run package[:mac]`: that wraps electron-builder in `scripts/rename-handoff.js before|after`, which, only when
  a Claude Bench build was in `dist/` (a marker file survives a failed build for the retry), deletes it, re-runs
  `create-shortcut.ps1` if a "Claude Bench.lnk" starts this clone's old exe (Mac: swaps the `~/Applications` link if it
  points into this `dist/`) and opens the new build unless a Claude Bench still runs anywhere (`oldRunning`). Remove it once no Claude Bench builds are left.
- **Restore tabs**: only the tabs on screen (`visibleIds()`: the active tab, or its split group) are saved, so sessions
  left open in the background don't all relaunch; they stay in the sidebar's session lists. `state.tabs`
  (`{ project, kind, sessionId }` in tab order) + `state.activeTab`, sent by the renderer's
  `saveTabs` (key-diffed; called from `activate`, `closeTab`, `assignSessions`, `toFront`), never on a timer. Claude tabs
  without a transcript yet are not saved; quitting on the home screen restores nothing. At launch `state:get` returns `restore` = `restorableTabs()` (drops entries whose
  project is gone or whose `<uuid>.jsonl` is missing, one try/catch per entry); `restoreTabs` creates all tabs, starts the
  active one first, then the panes on screen with it, then the rest 400 ms apart (Claude tabs via `--resume <uuid>`, shells fresh).
  Split groups are saved with them: `state.splits` = `[{ tabs: [index into state.tabs], cx, ry, v }]` (sent in the same
  `saveTabs` payload; also saved at the end of a divider drag, `nudgeSplit`, `unsplit`). `restorableTabs` remaps the indices
  past dropped tabs and keeps groups that still have two members; colors are reassigned.
- **Sessions**: `cmd.exe /d /c claude [--resume <uuid>]` for Claude tabs (resolves `claude.cmd` and
  `claude.exe`), `powershell.exe -NoLogo` for shell tabs.
  main builds the Claude argv itself from `resumeId` / `fork` (no args from the renderer). Never a bare `--continue`:
  Claude picks the newest transcript itself, even one running in another tab (two processes appending to one file), and
  the tab could only guess which it got (it once took a newer unrelated session's title). "Continue last conversation"
  (`continueLast`) resumes the project's newest transcript by id, or focuses the tab already showing it. `fork: true` with a `resumeId` adds `--fork-session` (Fork session in a session
  row's right-click menu, `sessionMenu`, and `cloneBeside`): the tab keeps `resumeId` but starts with `sessionId` null and is
  matched to its new transcript by `assignSessions` like a fresh tab; its placeholder says "Forked session".
  Exit shows Restart / Close; a Claude tab with a transcript gets Resume (`--resume <sessionId>`, follows `/clear`) and
  New session instead (`restartTab(tab, 'resume' | 'fresh')`).
  "Relaunch, skip permissions" (last item of `sessionMenu`) sends `skipPerms` (main adds `--dangerously-skip-permissions`):
  a closed session opens with it, an open tab is relaunched on its transcript (`relaunchTab`: asks only if `isWorking`,
  ends the pty and waits for its exit, which `tab.relaunch` swallows instead of the exit overlay, then `restartTab(tab, 'resume')`).
  `tab.skipPerms` sticks for Restart/Resume and flips the item to "Relaunch with permissions"; it is not saved, so
  restored tabs come back with normal permissions. Session rows show a `…` (`.s-menu`) on hover that opens the same menu.
- **macOS** (`IS_MAC` in main.js, `IS_MAC`/`mod(e)`/`kbd()` in renderer.js; `api.platform` from preload). Windows code
  stays as is; Mac branches sit next to it and fail soft.
  - Sessions: `claude` is spawned directly, shell tabs run `$SHELL -l`. Both (and `claude mcp list`) wait for
    `shellEnvReady`: the login shell's PATH, since Finder launches get a bare PATH. Capped at 5 s because rc files can
    block (stdin closed, own process group, SIGKILLed on timeout); common folders (Homebrew, `~/.local/bin`) are appended.
  - Port scan: `lsof -F pcn` + `ps -o pid,ppid,etime,args` mapped to the Windows scan's shape (`macScan`; `T` from
    `etime`), so ownership logic and the `parentPid` guard are shared. `macDevName` maps `python3.12` -> `python.exe`
    for `DEV_PROCESSES`.
  - Usage token: Keychain item `Claude Code-credentials` (`security find-generic-password -w`) when the file token is
    missing or expired; a failed read is not retried for 10 minutes (no repeated access dialogs). An expired token is
    refreshed the same way as on Windows (`refreshLogin` = `claude mcp list` via the login PATH), then the Keychain is read again.
  - Window: traffic lights via `trafficLightPosition` (no `titleBarOverlay`); `body.mac` moves the padding to `#brand`.
    Windows uses `assets/icon.ico` for the window and taskbar; macOS uses `assets/icon-mac.png` (padded to Apple's 824/1024 grid so the Dock icon matches its neighbours).
    A minimal app menu (appMenu + editMenu) replaces Electron's default, whose Cmd+W/R/= would clash; the Edit roles
    give Cmd+C/V/A to xterm and inputs. VS Code opens via `open -a "Visual Studio Code"`.
  - File links: `openFileAt` tries `code -g` (after `shellEnvReady`), then `open -a "Visual Studio Code" <file>`, then `shell.openPath`.
  - Sidebar peek (`wirePeek` / `makePeek`, a collapsed left sidebar slides in from the left edge, a closed right one from
    the right edge; DESIGN.md "Peek" / "Right peek"): no Mac branch; the edge zones start below the top bar, so the left
    one never sits under the traffic lights. Main's `peekHold` (cursor just outside that edge keeps it out) uses
    `screen.getCursorScreenPoint` + content bounds, both in points on macOS too.
  - First-run projects (`recentProjects`): no Mac branch (same `~/.claude/projects` layout and `cwd` field).
  - Restored tabs: no Mac branch needed (same transcript paths; `samePath` lowercases, which is fine for the default
    case-insensitive APFS). Claude tabs still wait for `shellEnvReady` like any new tab.
  - Markdown tabs (right sidebar): no Mac branch. `fs.watch` on the file's folder; macOS may report no file name, then
    every open file in that folder is re-read. "Show in Finder" via `FILES_APP`, Open in VS Code via `openFileAt`.
    The editor: Cmd+S saves now (`mod(e)`), Cmd+C/V/Z come from the Edit menu roles.
  - Images (right sidebar): no Mac branch. `nativeImage` decodes the thumbnails, `shell.showItemInFolder` backs "Show in Finder"
    (label via `FILES_APP`); transcript paths are the same as on Windows.
  - Zoom: `setWindowButtonPosition` (y scaled with the zoom) keeps the traffic lights centred; `#brand`'s 72 px padding divides by `--zoom`.
  - Appearance: `nativeTheme.themeSource` also themes the traffic-light area and menus; `setTitleBarOverlay` is skipped
    (Windows only). System follows macOS appearance.
  - Notifications: plain Electron `Notification` (no registry step). An unsigned app may show as "Electron" from
    `npm start`; if the user denied permission nothing shows and `notify` swallows any error.
  - Packaged update: `/bin/bash update.sh` detached with the login shell's PATH (after `shellEnvReady`); waits on the
    pid with `kill -0` (20 s, then `kill -9` on that pid only); reopens the bundle (`execPath` three levels up) with `open`. No visible window, so the log is it.
  - Install: `install.sh` builds into `~/.stanza` and links `~/Applications/Stanza.app` to the built bundle
    (the .app must stay in the clone for `repoDir()`); a real app already at that path is left alone. Untested on a Mac.
  - Shortcuts: the `SHORTCUTS` defaults use `M` = Cmd and `JUMP` = Cmd (Windows: Ctrl / Alt); `comboText` draws ⌃⌥⇧⌘,
    and the recorder reads `e.code`, so Option's special characters don't matter. `Cmd+Alt+arrows` resizes panes.
  - Terminal: `macOptionIsMeta` (Claude's Option shortcuts), `rightClickSelectsWord: false` (right-click pastes);
    the custom Ctrl+C/V handler is skipped. Labels say "Shell" / "Finder"; tooltips go through `kbd()` (⌘ ⇧ ⌥).
- **Git**: `git status --porcelain=v2 --branch` with `GIT_OPTIONAL_LOCKS=0`, polled from the renderer: the active project every 4 s (8 s while the window is visible but unfocused, `idle()`), all projects every 20 s (and on focus).
- **Update** (people install by cloning): `repoDir()` = the app folder for `npm start`, or the repo above `dist/` for a
  packaged build (walks up to a `.git` + `package.json` named `stanza`; a `.app` copied elsewhere finds none).
  `checkUpdate` runs `git fetch` + `rev-list --count HEAD..@{u}` 10 s after start and every 30 min (and on demand via the footer's update button, `#update-slot` / `updateBtn` / `checkNow`, which
  reports "up to date" or git's error, `error` in the result, in `#update-pop`; skipped while
  hidden; `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never` so no credential prompt). If behind, the same
  button turns into download (`runUpdate`; one button, refresh or download), and `renderUpdatePop` opens `#update-pop` above it (the newest 5 subjects from
  `git log --format=%s HEAD..@{u}`; Later / Update; Update turns the popover into a confirm step (`runUpdate`) whose button runs `startUpdate`, then a progress view; no separate dialog). Dismissing records the `behind` count
  (`updateSeen`, runtime only), so it returns only when more commits arrive or after a restart. Source runs: confirm (lists working tabs), then `applyUpdate` = `git pull --ff-only`,
  `npm install` (always, see below; a no-op install touches no files, so the running Electron doesn't block it), `app.relaunch()` + quit. Any failure (local edits,
  diverged branch, npm) shows git's/npm's message and keeps the app running. Every update path (`applyUpdate`,
  `update.ps1`, `update.sh`) first runs `git checkout HEAD -- package-lock.json` (`HEAD`, so a staged copy is reset too;
  plain `checkout --` restores from the index and the pull still aborts): npm rewrites the lockfile whenever it differs
  from `package.json` (it did at `53f34ee`), and a dirty lockfile makes `git pull` abort ("local changes would be
  overwritten"). Keep the lockfile in sync when changing dependencies. A clone stuck on that error before this fix runs the
  old script (copied before the pull), so it needs `git checkout HEAD -- package-lock.json` by hand once (README "Updating"
  lists the manual steps). Packaged builds can't rebuild while running
  (the exe is locked), so `startExternalUpdate` copies `scripts/update.ps1` (`update.sh` on macOS) to the temp folder
  (git pull may rewrite it), starts it detached and quits. The script waits for the app's pid and any process of the same
  exe path to end (20 s, then it force-ends them: a copy that closed its window but never exited keeps the exe locked and
  holds the single-instance lock, so a reopen would quit at once; seen in real use, cause not reproduced; also done
  before the reopen on failure), `git pull --ff-only`, `npm install` (always: after an npm install that failed in an earlier update, HEAD has
  moved on, so a "did package(-lock).json change" check would skip it for good and the build would pack stale
  `node_modules`), `npm run package[:mac]`, then
  reopens the exe/.app (tabs restore). No window on either platform (a visible console scared users): output goes to
  `<userData>/update.log`, opened in Notepad / TextEdit on failure, then the old build reopens; an "Updating Stanza"
  notification is shown as the app quits. Hidden means no prompt can be answered: the script sets `GIT_TERMINAL_PROMPT=0`
  / `GCM_INTERACTIVE=never` and must never `Read-Host`. Test it against a scratch
  clone (junction its `node_modules`), never the real `dist\`.
- **Install** (`scripts/install.ps1` / `install.sh`, piped from raw.githubusercontent.com: `irm ... | iex` / `curl ... | bash`;
  free, no GitHub Release, needs the repo public). The product page shows the shorter
  `https://aalishms.github.io/Stanza/install.ps1` (`.sh`): copies the Pages workflow (`.github/workflows/pages.yml`)
  publishes with `site/`; the README keeps the raw URL, which works without Pages. Produces a normal git clone, so the Update button works unchanged:
  `%LOCALAPPDATA%\Programs\stanza` / `~/.stanza` (or `STANZA_DIR`). Checks git, Node 20+ (claude only
  warns), refuses a running build of that install (path match) and a non-empty folder that isn't a clone; an existing
  clone gets the update steps (lockfile reset, `pull --ff-only`). Then `npm install` (+ Electron's `install.js` if its
  `dist` is missing), `npm run package[:mac]`, Windows `npm run shortcut`, start the app. The .ps1 runs inside the
  caller's PowerShell (`iex`), so its body is a `& { }` block with `throw`/`catch` (never `exit`, which would close
  their window) and it calls `npm.cmd` (the `npm.ps1` shim fails under the default execution policy). The .sh body is
  in `main`, called on the last line, so a cut-off download runs nothing. Testing it here overwrites the real
  shortcuts: run `npm run shortcut` in the real checkout afterwards, and don't let it start the scratch exe (same
  userData and single-instance lock as the real app).
- **Shortcuts** (`SHORTCUTS` in renderer.js): each action has an id, a label, default combos and `run`. Combos name physical
  keys (`KeyboardEvent.code`, canonical modifier order Ctrl, Alt, Shift, Cmd: `"Ctrl+Shift+KeyT"`), so Shift/Option never
  change the key; `Digits` (1..9) and `Arrows` are patterns whose action gets the number / direction. `runShortcut` (the one
  capture-phase keydown handler) prefers exact combos over patterns; a `run` returning `false` lets the key through. `ui.keys`
  stores only actions that differ from the defaults (main sanitizes it). Tooltips and hints read the live bindings through
  `tip()` / `keyText()`; `keysChanged()` redraws them.
- **Appearance** (`ui.theme` dark | light | system, default dark; `ui.claude`; `ui.accent`): main's `applyTheme` validates both
  (`THEMES` / `ACCENTS`) and sets `nativeTheme.themeSource`, at startup before the window and on `ui:set`; `applyChrome`
  repaints the window background and Windows title bar buttons (`CHROME`) on every `nativeTheme` 'updated'. The renderer
  never decides the theme itself: `themeName()` = `prefers-color-scheme`, which follows `themeSource` (so System tracks
  the OS live). `data-theme` is set at the top of renderer.js (before first paint); `applyTheme()` sets `data-theme` /
  `data-accent` and restyles every terminal (`xtermTheme()`, `termWeight()`), on the media query's `change` and on an
  accent change. Claude Code's own colors follow its `/theme`, not ours. **Claude colors** (`ui.claude`, a switch
  above the theme cards) = the Claude desktop app's palettes over the resolved scheme: `themeName()` = `claude-dark` /
  `claude-light`, clay `--primary` (accent options disabled), main's `chrome()` picks `CHROME['claude-*']`. Preload's
  `initialClaude` (main's `additionalArguments`) covers first paint. `setClaude` animates the switch, then reveals the new
  palette in a circle from it (view transition + `clip-path`). An old `ui.theme: 'claude'` becomes dark + Claude colors. No Mac branch.
- **Zoom** (`ui.zoom`, `ZOOM_STEPS` 75-150 %): the `zoomIn/zoomOut/zoomReset` keys change the terminal text size when
  focus is in a `.xterm` (`inTerminal`), otherwise `setZoom` / `stepZoom`. Main applies it with `webPreferences.zoomFactor`
  at start and `applyZoom` (`setZoomFactor`) on `ui:set`. Window buttons are in screen px, so they follow it: Windows'
  overlay height = `overlayH()` (zoomed 40 px top bar - 1), macOS `setWindowButtonPosition`; the CSS paddings that leave
  room for them divide by `--zoom`. Terminals refit through their ResizeObservers.
- **Settings page** (`#settings` over `#main`, gear at the left of the sidebar footer or `Ctrl+,`; `toggleSettings` /
  `renderSettings`): a section nav (`SETTINGS_TABS`, `settingsTab`, runtime only) with Appearance (`appearanceSection`:
  theme preview cards, accent options, terminal text size, interface zoom), Chats (`chatsSection`: the chat folder, see "Chats") and Shortcuts (`shortcutsSection`, a bordered card per group).
  A re-render refocuses the control that had focus (`data-fk`). Shortcuts: clicking a chip (or +) records the next combo with Ctrl/Alt/Cmd (or an F key);
  a combo another action uses is moved over (`keysNote` says so). Esc cancels recording, then closes the page; activating
  any tab closes it too.
- **Split view** (saved with the tabs, see "Restore tabs"): `splits` = a list of groups `{ ids, cx, ry, v, color }` (newest first, a tab in at
  most one; `groupOf(id)`, `curSplit()` = the active tab's group). The group on screen shows 2-4 tabs as a grid in `#terminals`
  (2 = A|B, 3 = A|(B over C), 4 = 2x2; `v` = stacked, started by "New session below": 2 = A over B, 3 = A over (B|C), which
  `paneCell` / `cellRect` get by transposing) with draggable dividers. `focusPane(dir)` picks the nearest pane that way,
  `nudgeSplit(dir)` moves a divider by 5 %. The sidebar shows each group in a `.split-group` box (`splitGroup`): inside
  their project's list where the first member sits in tab order, or at the top of `#projects` when they come from different
  projects (rows then show the project name). With several groups each box has its color (`.g0`..`.g4` = `--primary`,
  `--group-1..4`, the lowest free index at creation); a lone group is always `.g0`. Its header shows it, its × `unsplit(g)`. `activeId` is the focused pane, so status bar, right sidebar and
  polling keep following one tab. `visibleIds()` = the active tab's group, else just the active tab (focusing a member of another group
  switches the terminal area to that group). `addToSplit` adds to the visible group or starts a new one with the active tab; a pane header's `−` (`minimizePane`) takes
  that tab out of its group (still running, focus to its neighbour);
  a tab moving in leaves its old group, and a group of one is dropped. Entry: top-bar button / `Ctrl+Shift+→` (`splitHere`, new session beside),
  Shift+click a sidebar row (`besideRow`), or drag a sidebar row onto the terminal area or the home screen: `#dropzone` (shown only while
  dragging, `rowDrag` / `wireDropZone`) previews the pane in the resulting layout (`cellRect`; the slot whose pane centre is nearest
  the pointer wins) and the drop places it (`addToSplit(id, at)`). A session already on screen is opened again beside itself (`cloneBeside`: a fork of the
  Claude session, since resuming one transcript in two processes has both append to it; or another shell). On the home screen a drop just opens it. `renderSidebar` is paused while dragging. `autoRside` hides the right sidebar while a split pane is under 100 cols and
  restores it at 106+ (predicted from the current cols), without touching `ui.servers`; opening it by hand in a split sets
  `rsideForced` until the split's membership changes. `fitActive` fits every visible pane.
- **Tab order** = order of the `tabs` Map, newest first (Ctrl+Tab, Alt+1..9, saved order). Exception: a reopened past session
  (`resumeId`, not a fork or restore) is `parked`: no `toFront`, and `renderSidebar` leaves its row in the project's session list
  at its last-message slot (never folded behind "Show N more"). `unpark` (first Enter typed in the tab, `wireTerminal`) moves it to the front;
  `addToSplit` and `restartTab` clear the flag too. `createTab` puts any other new tab
  first (`toFront`, which rebuilds the Map and calls `saveTabs`; `restoreTabs` passes `append` to keep the saved order), and
  `addToSplit` moves the whole group to the front, so a split is on top and unsplitting moves no row. Each project's list
  shows its open tabs first in that order (`tabRow`; a session open twice gets a row per tab), then its other sessions by
  last message (not file mtime, which Claude bumps on resume and exit). No drag-to-reorder. Labels ("Project 2", "PowerShell 2") number by `seq` (creation order), not by position, so they
  don't renumber when a tab opens.
- **Closing**: `Ctrl+W`, the top-bar `×` (`#close-tab`) and each pane header's `×` all call `closeTab`. It only asks "End this session?" when
  Claude is working in the tab (`isWorking`) or a dev server started from it is listening (`ports`, owner = this tab); idle tabs close silently.
- **Notifications** (`trackTab` / `notifyTab` in renderer.js, `notify` in main.js): "<project>: Needs input" or
  "<project>: Done", body = the tab's title, only when the window is unfocused or the tab is not the active one. Clicking
  (`showFromNotification`) restores/shows the window and brings it to the front (Windows: a moment of `setAlwaysOnTop`,
  since a plain `focus()` from the background may only flash the taskbar; macOS: `app.focus({ steal: true })`), then
  activates the tab (`notify:click`). Clicks in Notification Center after the toast has gone are not handled: toast XML
  with a launch argument + `Notification.handleActivation` + a `CustomActivator` delivered no clicks at all in testing. `trackTab` runs every 1.5 s even while hidden. A run = a
  stretch of `isWorking`; it is Done after 4 s idle if it lasted 10 s+. Needs input = idle title (`✳`) + an
  `Esc to cancel` footer in the bottom 3 non-empty lines (permission prompt, AskUserQuestion, trust dialog), once per
  dialog; a bell / OSC 9 / OSC 777 also counts unless that idle stretch was already announced. Each notification consumes
  the run, so one event gives one notification. No mute setting (the OS has per-app notification settings).
  Windows: `registerToastIdentity` writes `HKCU\Software\Classes\AppUserModelId\com.local.stanza` (DisplayName,
  IconUri = a copy of the icon in userData) at every launch, otherwise toasts say "Electron" under `npm start`.
  Windows caches the name at an ID's first toast: if one fired before the key existed, delete
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\com.local.stanza` to reset it.
- **Right sidebar** (`#rside`, toggled by the top-bar button or `Ctrl+Shift+S`, saved as `ui.servers`; `renderRside`): the active tab's
  **Context** (`x / yk` + %; the last reply's usage, or after a `/compact` with no reply yet the `compact_boundary` line's
  `postTokens`, `parseTail`'s `compacted`), then collapsible sections (`ui.collapsed`): **MCPs**, **Subagents**, **Running**, **Docs** (see "Markdown tabs"), **Images**. The sidebar has tabs ("Markdown tabs"); all of this is its own tab, `#rside-panel`.
  While closed (by hand, by `autoRside`, or on the home screen) it **peeks** from the right edge like the left sidebar
  (`rightPeek` = `makePeek`, `#rpeek-zone`, `body.rside-peek`; DESIGN.md "Right peek"). Closed, it is still laid out
  (fixed, off screen, hidden), not `display: none`. `rsideShown()` = in the layout (the toggle, `autoRside`);
  `rsideOnScreen()` = in the layout or peeking, which gates the polls and the tab-switch slide. `openDoc` never pins:
  while the sidebar is closed it floats it in as a **sticky** peek (`rightPeek.sticky`; Ctrl+click in a terminal, a project's
  "Open CLAUDE.md"), which stays until the pointer has been in it and left, or a click (capture mousedown) or Esc outside it.
  Subagents and Running show `RSIDE_SHOWN` (5) rows, then "Show N more" / "Show less" (`foldRows`, `rsideMore`, runtime only;
  collapsing the section clears it, so reopening shows 5 again). Images is last and never folded.
  Home screen (no active tab): Context and Images are left out; with no `currentProject()` MCPs and Subagents show the
  user-level ones (stored under `GLOBAL` = `''` in `mcpBy` / `definedBy`; main runs `claude mcp list` in the home folder and
  reads only `~/.claude/agents`), and Running lists every session's servers.
  - MCPs: only connected ones are listed; the rest are behind a "Show N more" row (`mcpMore`, not persisted). `claude mcp list` run in the project folder (main `mcpList`, `cmd.exe /c claude mcp list`, cached 5 min (activating a tab of another project polls it), never overlapping;
    it health-checks every server, so it takes seconds). Output lines `name: target - ✔ Connected | ! Needs authentication | ...` map to
    connected (success) / failed + needs_client_registration (destructive) / needs_auth (warning) / disabled + unknown (muted).
  - Subagents: definitions from `~/.claude/agents/*.md` and `<project>/.claude/agents/*.md` (frontmatter `name`, `model`; `inherit` shows the
    session model) merged with this session's runs from `session:info` (`running` = working dot, finished = check, else idle). Each
    running run is its own row (`type · description`, so parallel agents of one type don't fold into one; newest first, and a missing or repeated description gets the start time); finished runs and idle
    definitions stay one row per type, and the header counts running runs. A run's model is the last `"model"` of its
    replies (1 MB tail when the 64 KB one has none, else the last one seen), before its first reply the Agent call's
    `model` from `.meta.json` (`requested`) or the definition's; never the session's (only an idle `inherit` definition shows that). Clicking a row (a running run's row shows only that run; a type's row lists each run with its own model) opens `agentDialog` (read-only popup in
    `#modal`, Esc / backdrop / × close): the definition's prompt (`agents:prompt`, body after the frontmatter) and the prompt each run of
    that type was given (first line of its `agent-*.jsonl`), each with its own Context bar (a subagent has a separate window; last reply's usage in its transcript, same assumed 200k/1M rule). `assignSessions` also re-points a running tab at a newer unclaimed
    transcript (`/clear` and `/resume` start a new session file in the same tab), otherwise the sidebar reads the old session's `subagents/`.
  - Images: the active session's pasted images (label `#n` from the line's `imagePasteIds`, else block order 1..n; a
    `[Attached image ... is saved at: <path>]` text gives the file) and images from the Read tool (the path comes from the earlier
    `tool_use`, kept in a `pending` map capped at 50). MCP/browser screenshots and subagent transcripts are not shown. Main
    (`scanImages`) reads the transcript incrementally by **byte** offset (Buffer `indexOf(0x0a)` on each new 1 MB chunk only; a line spanning chunks is joined once,
    a line still being written waits for the next scan), `JSON.parse`s only lines with `"type":"base64"` or `"name":"Read"`, and keeps
    an index of the newest 20 (`{ off, len, block, sub }` of the line), no pixels. `images:thumb` decodes on demand (`nativeImage`,
    320 px on the longer side, JPEG or PNG when transparent; GIF/WebP stay a placeholder tile), LRU of 100 across sessions;
    the index itself is kept for the 20 most recently used transcripts (`imageCache` LRU); `images:full` re-reads the
    line for the lightbox (`imageDialog` via `openModal`, shared with `agentDialog`); `images:reveal` = Show in Explorer/Finder.
    All take (project, session UUID, id), never a path. `pollImages` runs after `pollInfo`, only while the panel is shown and the
    section is open; thumbnails are fetched only for new ids. Every Read of a file is its own tile (no de-duplication).
  - Running: only listeners owned by a session (`owner.type === 'session'`): the active tab's, or on the home screen (no
    active tab) every session's, each row then suffixed with its tab label. Project-path matches and bare `DEV_PROCESSES`
    names are not listed (still used by the quit/close prompts' scan shape). Scanned every 6 s (30 s while the window is unfocused), only while the right sidebar is shown (`closeTab` / `onCloseRequest` rescan when the last scan is over 10 s old).
    Windows (`winScan`): listeners from `netstat -ano` (~30 ms; rows with foreign `0.0.0.0:0` / `[::]:0`, since the state text is localized,
    `parseNetstat`); the process table from PowerShell `Get-CimInstance Win32_Process` (about a second of CPU) only when a `pid:port`
    listener appears that hasn't been listening without a gap since the last PowerShell scan (so a recycled pid gets a fresh scan), or that
    scan is 60 s old (`procScan`, `PROC_TTL`). `parseNetstat` relies on `-a` without `-q` (BOUND sockets also have a zero foreign address).
    If netstat yields nothing, the old full PowerShell scan (`Get-NetTCPConnection` too) runs. A listener
    belongs to a tab if a session's pty pid is an ancestor (Git Bash, which Claude's Bash tool uses, emulates fork/exec
    and the Windows process in between exits, so `npx vite` from Claude has a dead parent: where the chain breaks at a
    process with `ps.exe` beside its exe, that MSYS `ps -l` maps it to its real parent, `parseMsysPs`, once per process table; no Mac branch); otherwise it is matched to a project if its command line contains the project path
    outside `--flag=` values (Antigravity's `agy.exe --add-dir=<project>` is no server). Rows are status dot, short name, port; clicking a row
    copies `http://localhost:<port>`, Shift+click opens it with `openExternal` (rows without a port, or emulators, do nothing). No kill, no "Show all".
- **Markdown tabs** (right sidebar, "markdown tabs" in renderer.js; DESIGN.md "Tab pill" / "Markdown page"): the right
  sidebar has tabs, its own content (`#rside-panel`) and one page per open `.md` / `.markdown` file (`#rside-doc`), kept per
  project in `docsBy` (`{ files, active }`, -1 = its own tab; the active tab's project, so the home screen has none) and saved
  as `state.docs` (`docs:set`; `restorableDocs` drops files and projects that are gone, `active` follows its file). No limit
  on files. Opened by Ctrl+click on a `.md` path in a terminal (`fileLinks`; other files still go to VS Code), a Docs section
  row, "Open CLAUDE.md / README.md" in a project's `…` menu (only while the project has a tab open: that tab is focused), or a
  relative link in a page (`md:resolve`; an `#anchor` scrolls to the heading, `data-anchor` not `id`, which could clash with the
  app's own ids; web links open in the browser; other files in VS Code). `#rside-pill` switches tabs (`renderPill`; elements
  kept in `pillEls`, so transitions run). A file tab sets `body.rside-doc`: width `--rside-doc-w` = `ui.rsideDocPct` (20-75,
  default 40) of the window (`docWidth`, recomputed on resize and when the left sidebar changes); the right `.rz` handle
  sets it while one shows. Switching animates the width (`slideRside`: `rside-sliding` holds the transition, `fitActive`
  returns early until 30 ms after it ends, then fits once and runs `autoRside`): a pty resize per frame would have Claude
  repaint its screen each time. `applyRside` slides open from 0 onto a file tab; a launch restore (`docBoot`) never slides.
  `autoRside` never hides the sidebar while a file tab shows (but doesn't bring a hidden one back for it: it peeks over the
  panes instead), its own tab keeps the old rule. Main reads
  only markdown (`md:read`, 2 MB cap) and images by extension (`md:image`, 10 MB, data URL; remote images are never fetched),
  and watches the open files' folders (`md:watch` -> `md:changed` after 150 ms); the page on screen re-reads in place with its
  scroll kept, others when shown (`docPages` cache, `docScroll` per file). `lib/md.js` parses (GFM tables, task lists,
  strikethrough, autolinks, alerts, front matter; raw HTML stays text) in linear time (bounded lookahead + memoised misses:
  the renderer would freeze on a big odd file); the DOM is built with `h()`. Docs section (`pollDocs` after `pollInfo`,
  `docs:list`): files the session wrote or edited (Write/Edit/MultiEdit in its transcript, scanned with the images) that still
  exist, then the project's top-level `.md` files.
  **Editing**: the head's pencil (`toggleDocEdit`) swaps the page for a plain `textarea.doc-edit` with the raw markdown
  (`docEditor`; edit mode per file in `docEditing`, runtime only; the one on screen is `docEdit`). It saves itself
  (`saveDocEdit` -> `md:write`, which writes in place and only to an existing markdown file, 2 MB cap): 600 ms after typing
  stops, on blur, when the page is replaced or hidden (`dropDocEdit` in `showDocPage` / `syncDocs`: switching or closing
  tabs), back to preview, `mod+S` in the editor (instead of the sidebar toggle; arrow-key shortcuts pass through to the
  textarea there) and in `onCloseRequest`. A textarea only has `\n`, so it saves with the file's own ending (`eolOf` /
  `withEol` in lib/ui.js; dirty = value differs from `clean`, so a mixed-ending file isn't rewritten unedited). On
  `md:changed` (`reloadDocEdit`): our own write is ignored (text equals `saved`), anything else replaces the text in place
  (selection and scroll kept) unless typing is pending, then the local text wins and is saved.
- **Sessions and usage**: read-only from `~/.claude/projects/<cwd, non-alphanumerics -> "-">/<uuid>.jsonl`. The sidebar lists a
  project's sessions under it (title as in Claude Code: the `/rename` name, `custom-title`, which Claude re-appends like the
  AI title and which is looked for in the head too, else the last `ai-title`, else the first prompt); clicking one focuses its tab or opens
  `claude --resume <uuid>` (main accepts only a bare UUID as `resumeId`). Lists read just the file tail and cache by
  mtime+size. `pollSessions` lists the projects on screen (open tabs, expanded in the sidebar, `currentProject`) every 4 s and
  all projects every 20 s and on focus (`pollSessions(all)`, partial results merged into `sessionsBy`; a full poll asked for
  during a partial one is queued, `sessionsQueued`, as in `pollGit`). The sidebar footer row shows plan limits (session / weekly / per-model % and reset times, from `api.anthropic.com/api/oauth/usage`
  using the token in `~/.claude/.credentials.json`, cached 2 min in main, never written; the token lasts hours and only Claude
  Code refreshes it, so with no session running it expires: `refreshLogin` then runs `claude mcp list` in the home folder
  (it refreshes the token; `claude auth status` does not, tested on v2.1.296), at most once per 10 min, also on a 401; a failure blocks requests for its `Retry-After` (429 default 5 min, max 15) and the last good numbers are served as `stale`, because retrying a 429 keeps the limit from clearing), the update button
  (see "Update"), and tab state. Fresh and forked tabs are matched to their transcript heuristically (`assignSessions` -> `matchSessions` in lib/ui.js).
  Claude creates a transcript when a prompt is sent (birth ~150 ms after the Enter, measured), so each free file goes to the
  running tab whose Enter (`tab.enters`, the last 100) came last before its birth: a tab without one yet (up to 60 s before;
  a fork also may own a file born within 15 s of its start, in case it writes its copy at once) or one whose transcript had
  gone quiet when the file was born (/clear, up to 10 s before). A tab nothing was typed in gets nothing: the oldest fresh
  tab used to take the first new file, so typing into the newer of two new tabs first (a split) swapped their transcripts,
  and an untouched new tab held every /clear follow in its project back. If the winner is still working, the file waits.
  An id a tab let go of (closed, restarted as new, left by /clear) goes into `retired` and is never matched to another tab:
  a closed split pane's transcript used to be taken over by an idle tab of the same project (its row took that title, the
  wrong id was saved for restore).
  Until a tab's transcript is listed (after the first reply) it shows as an italic "New session" placeholder row;
  PowerShell tabs get a "PowerShell" row. Every open tab has a row (there is no tab strip).
- **Session info** (right side of the status bar for Claude tabs, `session:info`): model = last reply's model or `/model` output in the transcript,
  effort = `/effort` / `/model` output, else `modelSettings[<id>].effortLevel` in `~/.claude/settings.json`. `readModelEffort` scans
  the whole transcript once, then only its new lines (`modelCache`: byte offset + values; a 64 KB tail lost an `/effort` a few
  tool calls back). The settings fallback is the copy main read when the tab's Claude started (`sessions.get(id).settings`,
  so `session:info` takes the tab id): `/model` and `/effort` save the default for *new* sessions, so another tab's change
  must not show here; a tab with no transcript yet reads the live file. No Mac branch. Subagents come from
  `<session>/subagents/agent-*.jsonl` + `.meta.json`; finished = the last message line (`agentDone` skips attachments) is a `SubagentHandback` call or its result, a text reply with `stop_reason` `end_turn`/`stop_sequence` (Explore, Plan and /code-review runs never hand back; mid-run text lines have `stop_reason` null, since text and the next tool call are separate lines), or a `[Request interrupted by user]` line (stopped; otherwise it would stay "working" for `AGENT_STALE_MS`). Only the tab's live Claude runs agents: a run counts as running only while the tab's pty exists and the run was written since that pty started (`startedAt`), so an exited tab or a resumed session's cut-off runs don't show as working. A finished run is followed by a ~100 KB `prompt_snapshot` attachment whose tool list names SubagentHandback, so never text-search the tail for it; with no message line in 64 KB, `readAgent` reads 1 MB.
- **Scrollbar**: our own `.vbar` replaces xterm's. Normal buffer = real position. Claude's `"tui": "fullscreen"` uses the
  alternate screen (no scrollback), so there the strip forwards synthetic wheel events to `.xterm-screen` (Claude has mouse
  tracking on). Claude never reports its scroll position, so `wireScrollbar` measures it: `alt.off` (lines above the
  bottom) moves by how far the transcript rows (above the prompt box, `promptBox`) shifted between two repaints
  (`lineShift`); bottom = Claude's "Jump to bottom" / "N new messages" pill is gone (`jumpPill`, trusted once seen in the
  tab), top = its logo + "Claude Code vX" banner in the first rows (`claudeBanner`; sets `alt.max`, which also sizes the
  thumb; `rows * 8` lines assumed until then). Dragging and track clicks set `alt.goal` and steer to it (`steer`: single
  wheel steps 40 ms apart, then correcting runs once Claude has settled). Learned the hard way: counting wheel steps is
  useless (Claude merges steps sent together, 10 at once moved ~12 lines, and speeds up for steps in a row, 3 lines a
  step slowly vs 5-20 fast); Claude's redraws leave written trailing spaces (rows are `trimEnd`ed before comparing);
  "the screen didn't change" is no top signal (Claude repaints late under a burst). While the wheel moves Claude, every
  write is measured (not just every animation frame), and a missing pill only counts once the wheel has stopped (a
  half-drawn frame may lack it, which used to reset `off` mid-scroll). A jump of more than a screen between two writes
  (a fast flick, 20+ lines a step) can't be measured and is estimated (exact slowly, ~2 % short at 60 ms between steps,
  ~20-25 % short at 15-30 ms in testing), so an estimated top never replaces a measured `alt.max`; both ends stay exact. If Claude's pill, banner or prompt box changes (checked on
  v2.1.299), update `PILL_RE` / `claudeBanner` / `promptBox`.
- **File links** (`fileLinks(tab)`, an xterm `registerLinkProvider` per terminal): `FILE_RE` matches paths with an extension
  and optional `:line[:col]` on one buffer line (`lineCells` maps characters to cells, so wide characters don't shift the
  range; wrapped paths are not links; URL ranges are skipped). Main's `files:resolve` stats them relative to the project
  (cached 10 s in `fileCache`); only existing files become links. Ctrl+click (`mod(e)`, also for web links) = `shell:openFile` (`openFileAt`): binary files (a NUL in the first 8 KB,
  `isBinaryFile`: photos, videos, PDFs...) go straight to the default app via `shell.openPath`; text files: Windows
  `Code.exe -g file:line:col` (`findVsCode`), macOS the `code` CLI on the login PATH, then `open -a "Visual Studio Code"`
  (no line); last resort `shell.openPath`.
- **Chats** ("No project"): the sidebar `+` (`#new-tab`, `newSessionMenu`) opens a menu: "No project", then every project.
  A chat is a normal project entry `{ path: chatDir(), name: 'Chats', chat: true }`, created on first use by main's
  `chatProject` (`projects:chat`, returns `{ projects, path }`), always first (`projects:reorder` keeps it there),
  so tabs, transcripts, restore and splits need nothing new. `chatDir()` = `state.chatDir` (Settings > Chats,
  `chatsSection`; `chat:pickDir` / `chat:resetDir` -> `setChatDir`, refused for a folder that is a real project, and
  while a pty runs in the chat folder, checked in main) else `~/Claude Chats`, created on demand. A folder that can't be
  created is an error (`openChat` offers Settings), never a silent fallback to home. **Not the home folder**: Claude Code never saves
  trust for home, so every chat there asked again (`hasTrustDialogAccepted` stays false in `~/.claude.json`); `loadState`
  moves an old Chats entry from home to `chatDir()`. Claude tabs in the chat folder get `--add-dir <home>` (`isChatDir`
  in `createSession`) for Desktop/Downloads chores. If the chat folder is already a real project it is left alone and
  "No project" opens a session there. `realProjects()` = everything but Chats: use it wherever "the user's projects" is
  meant (`currentProject`, `projectAction`, `pollGit`, `projParent`, welcome/empty states). Chats' row isn't draggable and
  has no "Move to top"; the port scan's path match ignores it (every command line would match home). `Ctrl+T` with no tab and
  several projects opens the same menu, focused (arrows + Enter, `menuArrow`). macOS: the same, `~/Claude Chats` + `--add-dir ~`.
- **First run** (no state file, legacy one included: `firstRun` in `loadState`): before the window opens, `recentProjects()`
  adds the 3 most recently used Claude Code projects (folders of `~/.claude/projects` by mtime; the path is the newest
  transcript's `cwd`, `transcriptCwd`, since folder names are lossy; home, the chat folder and temp folders are skipped)
  and expands the newest. Never runs again, so a removed project stays removed. No Mac branch.
- **Projects**: order = `state.projects`, changed by dragging project rows (`projDragProps`, `projDrag` pauses `renderSidebar`
  like a session drag) or "Move to top" in the `…` menu; both call `moveProject` -> `projects:reorder`. Same-name folders:
  `projParent(p)` = the fewest parent folders that tell it apart, `projName(p)` = `app (clients)` for tab labels,
  notifications and split-group rows; the project row shows the parent as a muted `.p-parent`.
  "Remove from list" keeps the project's tabs open: `orphanProjects()` (tab projects no longer in `projects`) are drawn at
  the bottom of the sidebar, always open, listing only their open tabs (no drag, no actions, `.project.orphan`), and polled
  by `pollSessions`, until their last tab closes.
- Renderer builds DOM with the `h()` helper. User/process text always goes in as text nodes. `html:` is only for
  static icon SVG.

## Gotchas (learned the hard way)

- **Resize a terminal once, and only when its size changes** (`fitTab`). The renderer rounds the cell height, so the fit
  addon's row count can be one too many; `fit.fit()` followed by `rows - 1` resized every tab twice per switch, and each
  pty resize makes Claude repaint its screen (the Ctrl+Tab jitter). `fitTab` computes the final size from
  `proposeDimensions()` and calls `term.resize` at most once. Its row height is xterm's cell height
  (`_renderService.dimensions.css.cell.height`, private like the fit addon's), never `.xterm-screen` height / rows: a tab shown
  after the window grew gets WebGL in the same frame, the screen keeps its old height until the next render, and a second fit in
  that frame kept one row too many (the bottom row ran under the status bar). `.term-host` clips as a safety net.
- **WebGL only on panes on screen** (`setWebgl`, from `syncVisible`): Chromium keeps 16 live WebGL contexts per page and
  silently drops the oldest, so hidden tabs use the DOM renderer. The addon's `dispose()` leaves its context to GC (Chromium
  still counts it), so `setWebgl` calls `WEBGL_lose_context.loseContext()` on the canvas that is not `.xterm-link-layer`.
- **`pty.pid` is 0 right after spawn** on ConPTY. Read `s.pty.pid` lazily at scan time; never cache it.
- **Windows never clears `ParentProcessId`**: when a parent exits, its pid can be reused by an unrelated process, which then looks like
  the child's ancestor (Discord showed up as a dev server of a session this way). The port scan carries each process's creation time
  (`T`) and `parentPid` in main.js ignores a "parent" created after its child. Any new ancestor walk must use it.
- **Strip session markers from the child env** (`STRIP_ENV` in main.js: `CLAUDECODE`, `CLAUDE_CODE_*` session
  vars). If the app is started from inside a Claude Code session, nested `claude` otherwise misbehaves
  ("transcript saving is off"). Don't strip user config like `ANTHROPIC_*` or `CLAUDE_CODE_USE_*`.
- `document.hidden` is true for an occluded window, so polling pauses; `visibilitychange` and `focus` resume it.
- **A detached PowerShell dies at once**: Node's `detached: true` on Windows means no console, and powershell.exe 5.1
  exits without one. A non-detached child dies with the app (libuv's kill-on-close job object). `startExternalUpdate`
  spawns a hidden launcher PowerShell (`windowsHide`, `-EncodedCommand`) that runs `Start-Process powershell.exe
  -WindowStyle Hidden ...`: the grandchild gets its own console, hidden from the start, breaks away from the job
  (libuv sets silent breakaway) and outlives the app. Wait for the launcher's exit before quitting.
- **The updater must not run with its cwd inside `dist\win-unpacked`**: the shortcuts start the exe there, a child inherits
  that working directory, and Windows won't delete a folder that is some process's cwd, so electron-builder failed with
  `EBUSY ... rmdir dist\win-unpacked` and the old build reopened (the app then says "up to date", since `checkUpdate`
  compares the checkout, not the build). `startExternalUpdate` spawns with `cwd: os.tmpdir()` and `update.ps1` calls
  `[IO.Directory]::SetCurrentDirectory($env:TEMP)` (`Set-Location` only moves PowerShell's own location, not the process's).
  `update.ps1` is copied to temp *before* `git pull`, so a fix to it only applies from the update after it lands.
  macOS is not affected (cwd doesn't block deletion there).
- `state.json` may carry a BOM (PowerShell `Set-Content -Encoding utf8`); the loader strips it.
- Dev run passes the app folder as an argv entry (`electron .`); `pathFromArgv` skips it. A real folder arg
  (`Stanza.exe C:\proj`) adds a project and opens a session.
- `electron-builder` needs `electron` in `devDependencies` and `@lydell/**` in `asarUnpack` (native pty).
  Electron's own install script is gated by npm `allow-scripts`; if `node_modules\electron\dist` is missing run
  `node node_modules\electron\install.js`.
- The packaged exe is locked while the app runs, so close it before `npm run package`.
- **Never kill processes by matching the app name in the path**: "Stanza" matches the user's real
  packaged `Stanza.exe`, and "Claude Terminal" matches this source folder.
  Match `node_modules\electron\dist` to stop only dev instances.
- **Claude sends no bell by default.** With its default notification channel it emits neither BEL nor OSC 9 in our
  terminal (tested on v2.1.296), and a pending tool call is not in the transcript until it has run. That's why "needs
  input" reads the screen footer. If Claude's dialog footers change wording, update `awaitingInput`.
- **No mouse in Claude tabs (clicks in the prompt / on subagent output do nothing, prompt not pinned to the bottom)** =
  Claude fell back to its classic renderer: the buffer is `normal`, not `alternate`, and `term.modes.mouseTrackingMode`
  is `none`. A fullscreen start writes `fullscreenBootPending[<pid>]` to `~/.claude.json`, removed on a clean exit or
  10 s after the first frame; a process that dies with it still there is a strike, and the next launch on the machine
  runs classic ("didn't finish starting last time"). Two strikes set `fullscreenAutoDisabled` for that version;
  `/tui fullscreen` in any tab clears it, then restart the tabs. node-pty's Windows `kill()` also TerminateProcess-es
  every console process, which in Claude's first ~2.5 s beats its clean exit, so closing a young tab or quitting
  during a restore used to cause strikes. `endSession` in main.js closes only the console for Claude tabs (and ends
  leftovers after 5 s); it relies on node-pty's private `_agent._getConsoleProcessList` (falls back to `kill()`), so
  recheck it after a node-pty update (tested on v2.1.296).
- **Never kill a pty twice**: node-pty's Windows `kill()` closes the native pseudoconsole on every call, and a second
  close corrupts the heap: the whole app crashed (APPCRASH 0xc0000374). A Claude tab takes seconds to exit after
  `endSession`, so closing a tab during a relaunch, or quitting right after closing one (`before-quit` ends every session
  still listed), killed it twice. `endSession` runs once per session (`s.ending`), and an ending pty gets no writes or
  resizes (`live(id)` in the IPC handlers).
- **Don't rebuild a clickable element on mousedown**: the click never arrives if the pressed button is replaced before
  mouseup. A pane's mousedown activates it (not when the target is a pane-header button, and `renderPanes`' key has no
  `activeId`), and closing the footer popover on an outside mousedown only hides it, like `closeMenu`.
- **Context tile**: the window size is not in the transcript, so `contextWindow(model, used)` in renderer.js derives it from the model id or display name: 1M for Opus and Sonnet 4.6+, Haiku 5+, Fable, Mythos or a `[1m]` model, 200k for everything else (Haiku 4.5, Opus/Sonnet up to 4.5, Claude 2/3, unrecognised models; 1M once a session exceeds it). Transcripts drop the `[1m]` (which only matters for the 200k-by-default models), so main.js re-attaches it with `withLongContext` from settings `model`, a `/model` line, or for a subagent run its definition `model:` (or the parent session model when `inherit`). The main tab, the footer tile and each subagent run in the agent popup all use it, each with its own model. Update it when a new model family ships with a different window.
  Plan-limit percentages are not on disk; they come from the undocumented usage endpoint (may change).
- A hidden window (`document.hidden`) skips all polling, so when driving a test instance over CDP, override `document.hidden`
  and call `pollSessions()` yourself. Start the test instance with PowerShell `Start-Process`; a plain bash `&` dies with the tool call.
  Add `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`:
  a covered or minimized test window otherwise runs timers ~7x slow and never fires `requestAnimationFrame`, which
  skews anything timed (scroll probes). `location.reload()` over CDP may not happen (close prompt); relaunch instead.
- Windows paths and quoting: PowerShell mangles inline JS with quotes. Put test scripts in files.
- macOS can't be tested here: keep Mac branches plain and fail-soft, and add sample `lsof`/`ps` output to
  `test/parse.test.js` for any parser change. On Mac, node-pty's `spawn-helper` may lose its execute bit after install (`posix_spawnp failed`).

## Testing

**Unit tests** (`npm test`): new parsing or decision logic goes into `src/lib/` as a pure function (text or plain data
in, plain data out) with a test next to the others, using sample output pasted from the real tool. That is also the
only way Mac branches get exercised here: feed `lsof`/`ps` samples to the parsers. A renderer helper added to `lib/ui.js`
must also be added to the `/* global */` line in renderer.js (a test checks the list against the exports).

**The real app** (no framework): launch a throwaway instance so real settings stay untouched, with a debug port:

```
node_modules\electron\dist\electron.exe --remote-debugging-port=9333 --user-data-dir=<scratch>\profile .
```

Then use the Chrome DevTools Protocol (Node 22+ has a built-in `WebSocket`) to evaluate JS in the page and call
`Page.captureScreenshot`. Renderer functions are globals (`openSession`, `pollPorts`, `tabs`, `projects`...), so
scripts can open sessions, write to ptys (`api.ptyWrite`), and read xterm buffers. Seed projects by writing
`state.json` in the profile dir (no BOM issues now, but keep it plain). Look at screenshots for any UI change.

## Ideas not built yet

Per-project quick commands, "Open in Stanza"
Explorer context menu, auto-detect git worktrees.
Only build these when asked.
