<p align="center">
  <img src="assets/icon.png" width="96" alt="">
</p>

<h1 align="center">Stanza</h1>

<p align="center">
  A desktop app for running several Claude Code sessions side by side.<br>
  Windows first, macOS best effort.
</p>

## Install in one line

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/AalishMS/Stanza/main/scripts/install.ps1 | iex
```

**macOS** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/AalishMS/Stanza/main/scripts/install.sh | bash
```

Needs [Node.js](https://nodejs.org) 20+, git and the [`claude` CLI](https://claude.com/claude-code) (logged in).
More in [Install](#install).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="promo/screenshots/main-light.png">
    <img src="promo/screenshots/main-dark.png" alt="Stanza with a Claude session open: projects on the left, the answer with clickable file:line links, and context, MCPs, subagents and running servers on the right">
  </picture>
</p>

Every tab is the real `claude` CLI in a real terminal, so slash commands, permissions, models and speed are exactly
what you get in a shell. Stanza only adds the things a terminal window doesn't have: a project sidebar, tabs,
split panes, git status and a list of the dev servers your sessions started.

## What it does

- **Projects and sessions.** Add a folder once, then start a session in it with one click. Past sessions are listed
  under each project by their title; click one to resume it, or right-click (or its `…`) to fork it or relaunch it with `--dangerously-skip-permissions`. On first launch the three
  folders you used Claude Code in most recently are already there.
- **Chats without a project.** The `+` next to "add project" also offers "No project": a session for questions or
  small chores like tidying the Desktop. Chats run in `Claude Chats` in your home folder (change it in Settings >
  Chats) with your home folder added, and are listed under "Chats" at the top.
- **Tabs that come back.** The session you were in (or its whole split) reopens on the next launch, resumed where it left off. Other open sessions wait in the sidebar, one click away.
- **Split view.** Up to four sessions on screen at once. Drag a session from the sidebar onto the terminal, or press
  `Ctrl+Shift+→`. You can keep several splits around; each gets its own box in the sidebar.
- **Git at a glance.** Branch, changed files and ahead/behind for every project.
- **Session details.** Context usage, connected MCP servers, subagents and their prompts, and the images pasted into
  or read by the session.
- **Running servers.** Dev servers started from the current session show up with their port (on the home screen,
  those of every session). Click to copy the URL, Shift+click to open it.
- **Clickable file paths.** Ctrl+click `src/main.js:123` in Claude's output to open it in VS Code at that line.
  Images, videos, PDFs and other binary files open in their default app.
- **Markdown reader.** Ctrl+click a `.md` path (a plan, `CLAUDE.md`, notes Claude just wrote) and it opens as a tab in
  the right sidebar, which widens to fit it and updates live while the file changes. The pill at the bottom of the
  sidebar switches between its own content and the open files; each project keeps its own. The sidebar's Docs section
  lists the files the session wrote or edited and the project's own `.md` files. The pencil in a file's header switches
  to its raw markdown for quick edits, saved automatically as you type (Ctrl+S saves at once).
- **Notifications.** A background session tells you when it needs input or has finished a longer task.
- **Plan limits.** Session and weekly usage in the footer.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="promo/screenshots/split-light.png">
    <img src="promo/screenshots/split-dark.png" alt="Three panes in split view: two Claude sessions in different projects and a shell">
  </picture>
</p>

## Install

You need [Node.js](https://nodejs.org) 20+, git, and the `claude` CLI installed and logged in. Then paste one line.

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/AalishMS/Stanza/main/scripts/install.ps1 | iex
```

macOS (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/AalishMS/Stanza/main/scripts/install.sh | bash
```

It clones the repo, builds the app and opens it. Windows installs to `%LOCALAPPDATA%\Programs\stanza` with
Desktop and Start menu shortcuts; macOS clones to `~/.stanza` and puts the app in `~/Applications`, where Spotlight
finds it. Set `STANZA_DIR` first to pick another folder for the clone. Running the line again updates that copy. To
uninstall, delete the folder and the shortcuts (on macOS, `~/Applications/Stanza.app`).

### Manual install

```
git clone https://github.com/AalishMS/Stanza.git
cd Stanza
npm install
npm start
```

To use it as a normal app on Windows, build it and add shortcuts:

```
npm run package     # builds dist\win-unpacked\Stanza.exe
npm run shortcut    # Desktop and Start menu shortcuts
```

`Stanza.exe C:\some\folder` adds that folder as a project and opens a session in it.

### macOS

macOS works but isn't tested by the author. Install git with `xcode-select --install`, then use the one-line install
above, or by hand in the clone:

```
npm install
npm start
npm run package:mac   # optional: dist/mac-*/Stanza.app, unsigned, for your own machine
```

Things that differ on a Mac:

- Shortcuts use `⌘` where the table below says `Ctrl`, and `⌘` instead of `Alt` (`⌘1`..`9`, `⌘` + arrows).
  `Ctrl+Tab` stays. Plain `Ctrl` is left to Claude Code, so `Ctrl+C` interrupts and `Ctrl+V` pastes images.
- Copy and paste are `⌘C` / `⌘V` or right-click. Option acts as Meta, so Claude's Option shortcuts work.
- "No project" chats run in `~/Claude Chats` (or the folder set in Settings > Chats), with `~` added.
- Sessions use your login shell's PATH, so `claude` and `node` are found even when the app is opened from Finder.
- File links open at the right line if VS Code's `code` command is installed ("Shell Command: Install 'code' command
  in PATH"), otherwise VS Code opens the file without the line. Binary files open in their default app (`open`).
- The footer's plan limits read Claude Code's token from the Keychain. macOS may ask once for access. When no session
  has run for hours the token has expired; the app then runs `claude mcp list` once, which renews it.
- Notifications go through Notification Center. Allow them when asked (under `npm start` they show as Electron).
- Settings > Appearance > System follows macOS light/dark mode, and the traffic lights and menus follow the chosen theme.
- Interface zoom (`⌘=` / `⌘-` outside a terminal) moves the traffic lights to stay centred in the taller or shorter top bar.
- In full screen the traffic lights are hidden, so the sidebar toggle and logo move to the left edge.
- `⌘Q` and Quit in the Dock ask first only while Claude is working or a dev server started from a tab is running.
- Markdown tabs work the same; their folder button opens Finder, and Cmd+S saves the editor at once.
- The home screen greets you with your macOS login name (the short one, e.g. "jsmith").

The home screen's design came from the standalone proposals in [mockups/home](mockups/home/README.md) (the
"Workbench" one). Open its `index.html` in Safari or Chrome to compare the layouts; they use sample data.

If something goes wrong:

| Problem | Fix |
| --- | --- |
| Electron missing after `npm install` | `node node_modules/electron/install.js` |
| Tabs fail with `posix_spawnp failed` | `chmod +x node_modules/@lydell/node-pty-darwin-*/spawn-helper` |
| "The app is damaged" | `codesign --force --deep -s - "dist/mac-arm64/Stanza.app"` |

## Updating

When the repo has new commits, a download icon appears next to the app name with a list of what changed. Click
Update.

- From `npm start`, the app pulls, runs `npm install`, and restarts.
- From a built `.exe` or `.app`, it closes, pulls, runs `npm install`, rebuilds, and reopens with your tabs. Nothing
  is on screen while it works (a notification says it's updating); if it fails, a log opens in Notepad (TextEdit on
  macOS) and the old build reopens.

If your local edits clash with the update, it stops and shows git's message. To do it by hand, close the app and run
this in the repo folder:

```
git checkout HEAD -- package-lock.json
git pull --ff-only
npm install
npm run package          # macOS: npm run package:mac
```

On macOS the build lands in `dist/`; if you installed with the install line, run that line again instead, which also
moves the new build to `~/Applications`.

The first line drops npm's local changes to the lockfile, which would otherwise block the pull. If the Update button
fails with "Your local changes to the following files would be overwritten by merge: package-lock.json", run these
steps once by hand; later updates handle it themselves. Projects and settings live outside the repo, so they survive
updates.

**Coming from Claude Bench** (the app's old name): just click Update. The build replaces Claude Bench with Stanza,
moves your Desktop and Start menu shortcuts (or the `~/Applications` link) over to it and opens it, with your
projects, tabs and settings. On macOS, a Claude Bench icon kept in the Dock needs replacing by hand.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+T` / `Ctrl+W` | New session / close session |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous session |
| `Alt+1`..`9` | Jump to a session |
| `Ctrl+Shift+→` / `Ctrl+Shift+↓` / `Ctrl+Shift+↑` | New session beside / below / above |
| `Ctrl+Shift+/` | Take the focused session out of the split (it keeps running) |
| `Ctrl+Shift+\` | Back to one terminal |
| `Alt+arrows` / `Ctrl+Alt+arrows` | Move focus / resize panes (while split) |
| `Ctrl+S` / `Ctrl+Shift+S` | Toggle left / right sidebar |
| `Ctrl+K` (or `Ctrl+Shift+F`) | Search sessions |
| `Ctrl+,` | Settings |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Terminal text size when a terminal has focus, else zoom the whole window |

Settings (the gear at the bottom left) has two pages. **Appearance**: dark, light or system theme, a Claude colors switch
(the Claude desktop app's warm palette and clay accent, in dark and light), an accent color (blue, violet, teal, rose), the terminal text size and the interface zoom. Claude Code picks some of its colors itself, so after switching
to light run `/theme` in a session and pick a light theme there too. **Shortcuts**: every shortcut can be changed. The defaults stay clear of keys Claude Code
uses, except `Ctrl+T`, `Ctrl+S`, `Ctrl+W` and `Ctrl+K`. Drop files onto a terminal to paste their paths. `F12` opens DevTools.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="promo/screenshots/settings-appearance-light.png">
    <img src="promo/screenshots/settings-appearance-dark.png" alt="Settings page: theme, accent color and terminal text size">
  </picture>
</p>

## How it's built

Electron, xterm.js and node-pty, with no bundler or framework.

- `src/main.js` handles windows, terminals, git, the port scan and saved state
- `src/renderer.js`, `index.html` and `styles.css` are the UI
- `src/preload.js` is the bridge between them
- `scripts/` has the shortcut creator and update helpers
- `site/` is the product page: plain HTML, CSS and JS, no build step (open `site/index.html`)
- `assets/` has the logo: `icon-source.png` is the master, the rest are derived from it

State is saved in `%APPDATA%\stanza` on Windows and `~/Library/Application Support` on macOS.
