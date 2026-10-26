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
  folders you used Claude Code in most recently are already there. Adding a project or starting/switching sessions
  moves that project to the top, below Chats; the order is saved between launches.
- **Chats without a project.** The `+` next to "add project" also offers "No project": a session for questions or
  small chores like tidying the Desktop. Chats run in `Claude Chats` in your home folder (change it in Settings >
  Chats) with your home folder added, and are listed under "Chats" at the top.
- **Tabs that come back.** The session you were in (or its whole split) reopens on the next launch, resumed where it left off. Other open sessions wait in the sidebar, one click away.
- **Split view.** Up to four sessions on screen at once. Drag a session from the sidebar onto the terminal, or press
  `Ctrl+Shift+→`. You can keep several splits around; each gets its own box in the sidebar.
- **Git at a glance.** Branch, changed files and ahead/behind for every project.
- **Diff viewer.** While a project has uncommitted changes, a `+12 −3` button sits in the top bar. Click it (or the
  change count in the status bar, or press `Ctrl+Shift+G`) and the right sidebar shows every changed file as a diff:
  added and removed lines, the changed words inside a line, new files included. It follows Claude's edits live.
  Click a file's header to fold it, or a line number to open the file there in VS Code.
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

## Remote Ubuntu projects

After selecting a device in **Add project**, you can also choose **Git URL** to clone an HTTPS/SSH repository,
or **GitHub repository** to browse repositories using that device's GitHub CLI login (`gh auth login`).
Under **Your Repositories:**, search and select one of your account's first 100 repositories, or paste an HTTPS/SSH
URL under **Any Other Repository Link:**. Choose a destination folder and a new folder name, then **Clone and add project**.
On a server, **Browse** also offers **New folder** with inline Create/Cancel controls; creating a folder selects it as the destination.
Git and, for GitHub, `gh` must be installed on the selected device. Existing folders are never overwritten.
Authenticate Git/SSH in that device's terminal first; Stanza does not show hidden login prompts.

Choose **Add project**, then select **Add remote…** in the device list. Enter an SSH alias or
`user@hostname` (for example `aalish@g5-server`), connect, and choose a folder on the server.
Remote projects show their device name and connection status in the sidebar. The optional
project name changes only Stanza's label. **Go** (or Enter in the path field) opens the typed
remote folder. **New folder** in the folder browser creates a child folder and opens it.

The desktop needs OpenSSH and an existing working key/agent-based SSH connection. Tailscale
hostnames work through normal SSH. On Ubuntu, install Node.js 20+, tmux, Git and Claude Code;
the standard `flock` command from util-linux is also required for conversation reservations.
Sign into Claude there with `claude auth login`. New host keys and locked SSH keys must first
be handled by running `ssh user@host` in your normal terminal. Stanza uses your existing SSH
config and host-key verification and does not store passwords or copy Claude credentials.
Connecting installs a small versioned helper under `~/.local/share/stanza/remote/`; it uses
stdin/stdout over SSH and does not open a network service or require sudo.

The first release supports remote Claude and shell sessions, mixed local/remote splits,
session history/resume/fork, Git status and Changes. **Closing a remote tab, quitting Stanza,
or losing the connection keeps its remote process running in tmux.** Reopen its sidebar row
to attach again. Use the session's **End remote session…** menu action to stop it. A server
reboot ends live processes; transcript-backed conversations can then be resumed.

Remote file viewers, uploads/image paste, VS Code integration, MCP/subagent details and the
running-servers panel are not supported yet. The project menu can copy the remote path.
Start tools in the remote shell; browser access uses your own network/Tailscale or manual SSH
forwarding. A server's `localhost` address is different from your desktop's. Usage/activity
totals still describe the local Claude account and local activity.

**Settings > Connections** lists saved devices and lets you **Add connection**, **Rename** a device,
**Test connection**, or **Add project** on it. Its On/Off switch is saved across restarts. Turning it off
detaches local tabs and pauses remote polling/reconnection; remote sessions keep running in tmux.
Turn it back on to reconnect. Testing checks SSH access and the remote helper's requirements and identity;
it reports when Claude Code is missing (shell sessions still work). You can also reconnect from the
project menu. To change an SSH target/account, add a new device instead.
After ending Stanza's remote sessions, its helper directory can be deleted from the server
if no Stanza client uses it.

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

Git URL and GitHub repository cloning use your login shell's PATH, including Homebrew Git/`gh` when opened
from Finder. Test local and remote cloning, selecting a repository versus pasting a link, GitHub listing and login errors, destination selection and existing-folder
errors in all four themes. In both clone dialogs, check Browse > New folder, Enter to create, Cancel, and duplicate/invalid-name errors.
These Mac checks remain untested here.

Remote Ubuntu projects use macOS's `/usr/bin/ssh` and the same Cmd shortcuts as local projects.
Test from a Finder-launched build with your SSH agent/Keychain available: add and rename a device
in Settings > Connections, test it, toggle it off/on, and restart with it off
to check persistence and that it makes no connection attempts. Check keyboard focus and all four themes.
Add a remote folder, create a child folder, toggle the device menu with repeated clicks and use its arrow keys and Escape, open Shell/Claude, use
Option keys and mouse input, resize a mixed split, sleep/reconnect,
close/reopen a remote tab, explicitly End it, and confirm local Git stays responsive while
the server is offline. Remote support has been exercised on Windows; these Mac checks remain
untested here. Full steps are in [MAC_CHECKLIST.md](MAC_CHECKLIST.md).

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
- Session titles follow `/resume` and `/clear`, including when a launcher runs Claude as a child process. If the live
  record or process lookup is unavailable, session matching falls back to transcript timing. This needs testing on a Mac.
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
- The diff viewer is `⌘⇧G`; it runs the same `git` as the branch and change count (Xcode's, from `xcode-select --install`).
- The home screen greets you with your macOS login name (the short one, e.g. "jsmith").

Project recency uses the same code on both desktops: adding a local/remote project or starting/switching sessions
moves its group below pinned Chats and saves the order. On a Mac, check adding projects, `⌘T`, switching sessions,
and all four themes. Groups slide together when reordered; check rapid switching and scrolling, and that macOS
Reduce motion makes the order change instantly. Restart, closing a pane and reconnecting should preserve the order
until you use another project.

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
| `Ctrl+Shift+G` | Show or hide the project's changes (diff viewer) |
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
