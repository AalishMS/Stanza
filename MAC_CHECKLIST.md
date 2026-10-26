# macOS test checklist

Stanza is built and tested on Windows. The macOS code has never run on a real Mac, so this list covers
everything that needs checking there. Tick what works. For anything that fails, note what you did and any error text.

## Setup

- [ ] The `claude` CLI is installed and logged in (`claude` works in Terminal).
- [ ] `git` works. If it doesn't, run `xcode-select --install`.
- [ ] Clone and install:
  ```
  git clone https://github.com/AalishMS/Stanza.git
  cd Stanza
  npm install
  ```
- [ ] If `node_modules/electron/dist` is missing after `npm install`, run `node node_modules/electron/install.js`.
- [ ] `npm start` opens the app. Add a project folder with the folder-plus button at the bottom of the sidebar.

## Remote Ubuntu projects

- [ ] From a Finder-launched build, Add project → Add remote connects with `/usr/bin/ssh` and existing agent/Keychain.
- [ ] Remote folder rows and POSIX paths render correctly, including spaces/Unicode; device labels stay readable.
- [ ] The themed device menu supports arrows/Enter; Escape closes it before the dialog. New folder creates and opens one child; Cancel creates nothing.
- [ ] Shell and Claude input, Cmd shortcuts, Option shortcuts, mouse and split resizing work.
- [ ] Closing a remote tab leaves work running; reopening the history/runtime row attaches to the same process.
- [ ] Sleep/network loss reconnects without replaying typed input; local Git/session polling stays responsive.
- [ ] End remote session stops only its owned runtime; permission relaunch waits for its old process to exit.
- [ ] Cmd+Q and packaged update detach remote sessions; local quit behavior stays as before.
- [ ] Remote file drops/image paste report unsupported; no local file/editor/MCP data appears for a remote project.
- [ ] Device setup/picker/sidebar/Changes look right in dark, light and both Claude palettes.

## Basics

- [ ] The window buttons (red/yellow/green) sit neatly at the top left and don't overlap the logo, with the sidebar
      shown and hidden (⌘S, with a tab open: the home screen always shows the sidebar).
- [ ] In full screen (⌃⌘F) the window buttons are hidden, and the sidebar toggle and logo move to the left edge.
      Leaving full screen moves them back.
- [ ] A Claude tab starts. If it fails with `posix_spawnp failed`, run
      `chmod +x node_modules/@lydell/node-pty-darwin-*/spawn-helper` and try again.
- [ ] A shell tab (terminal button in the top bar) opens your usual shell and prompt. Its sidebar row says "Shell".
- [ ] The project shows its git branch and changed-file count.
- [ ] Start a dev server from a tab (for example `npx vite`). It appears under **Running** in the right sidebar
      (⌘⇧S) while that tab is the active one, and clicking the row copies its URL.
- [ ] The right sidebar lists MCP servers.
- [ ] The sidebar footer shows plan usage percentages. macOS may ask once for Keychain access. If you deny it, the
      dialog must not come back for 10 minutes.
- [ ] The VS Code button opens the project in VS Code, and the folder button opens it in Finder.

## Keys

- [ ] ⌘T new session, ⌘W close, ⌘S sidebar, ⌘⇧S right sidebar
- [ ] ⌘⇧→ split beside, ⌘⇧↓ split below, ⌘⇧↑ split above, ⌘⇧/ takes the focused pane out of the split, ⌘⇧\ unsplit
- [ ] While split: ⌘ + arrows move between panes, ⌘⌥ + arrows move the divider
- [ ] ⌘1–9 jump to a tab, Ctrl+Tab next tab
- [ ] ⌘= / ⌘- / ⌘0 font size
- [ ] ⌘C / ⌘V copy and paste in the terminal and in the search box
- [ ] Right-click in a terminal pastes (and doesn't copy a word instead)
- [ ] Ctrl+C interrupts Claude, and Ctrl+V pastes an image into Claude
- [ ] Option+P opens Claude's model picker
- [ ] ⇧-click a session in the sidebar opens it beside the current one (⌘-click just switches to it)
- [ ] ⌘⌥I opens DevTools
- [ ] ⌘Q quits, and asks first only if Claude is working or a dev server started from a tab is running. In that
      prompt, Keep open leaves every tab running (Claude keeps working, the server keeps answering)

## Restored tabs

Only the tabs on screen are restored: the active tab, or its whole split group. Tabs left in the background are not
reopened; they stay in the sidebar's session lists.

- [ ] Put three tabs on screen in one split (⌘⇧→ adds a pane): a Claude tab you've sent a message in, a Claude tab you
      haven't written in yet, and a shell tab. Quit (⌘Q) and start the app again.
- [ ] The split comes back with the same tabs in the same order, and the pane that was focused is focused again.
- [ ] The restored Claude tab shows its earlier conversation (it resumes with `claude --resume`). The Claude tab with no
      message yet is not restored. The shell tab comes back as a fresh shell.
- [ ] A Claude tab you left in the background (not on screen when quitting) is not reopened, but is still listed under
      its project.
- [ ] The first tab appears right away and the others follow over a second or two. The app doesn't stall at startup.
- [ ] In the built `.app` opened from Finder, restored Claude tabs start too (they need your shell's PATH).

## Notifications

- [ ] The first time a notification fires, macOS asks whether to allow notifications (for "Electron" when running
      `npm start`). Allow it.
- [ ] In a background Claude tab (switch to another tab), ask Claude for something that needs permission (in manual
      mode: ⇧Tab until the footer says "manual mode", then ask it to change a file, for example "run `touch probe.txt`";
      a read-only command like `ls` never asks). Exactly one notification "<project>: Needs input" appears, with the
      session title as its text.
- [ ] Ask a background Claude tab for a reply that takes more than 10 seconds (for example "write 50 numbered facts
      about the ocean, one per line"; "run sleep 15" doesn't work, Claude moves it to a background task and goes idle).
      Exactly one "<project>: Done" notification appears when it finishes, and no second one a minute later.
- [ ] A quick reply (under 10 seconds) in a background tab gives no notification.
- [ ] With the app in the foreground on that same tab, nothing is shown. With another app in front, notifications
      appear even for the active tab.
- [ ] Clicking a notification brings Stanza to the front, focused, on that tab: with another app in front, and
      with the window minimized (⌘M).
- [ ] Deny notifications in System Settings → Notifications, then repeat a "Done" case: nothing shows and the app
      keeps working normally.

## Tab order and split groups

- [ ] Open tabs sit at the top of their project's list, newest first. A new session (⌘T) appears as the top row, and
      ⌘1 jumps to it.
- [ ] On an older tab press ⌘⇧→: the split shows as a "Split view" box at the top of the list. ⌘⇧\ unsplits and the
      rows stay where they were.
- [ ] Make a second split from a tab outside the first one (focus it, ⌘⇧→): there are now two boxes, each with its own
      color. Clicking a session in the other box switches the terminal area to that split.
- [ ] Dragging a row onto the terminal area still opens it in a split pane. Dragging rows within the sidebar does nothing.
- [ ] Quit and restart: the split that was on screen comes back as a split, with its tabs in the same order.

## Opened from Finder

Apps opened from Finder don't get your shell's PATH, so this checks the fix for that.

- [ ] `npm run package:mac`, then open `dist/mac-*/Stanza.app` from Finder.
- [ ] If macOS says the app is damaged, run `codesign --force --deep -s - "dist/mac-arm64/Stanza.app"`.
- [ ] Claude tabs and the MCP list work in the built app.
- [ ] If your `~/.zshrc` is slow or asks a question at startup, the first tab still opens within about 5 seconds.

## Install line

- [ ] Run the README's `curl ... | bash` line. Afterwards `ls -l ~/Applications` shows `Stanza.app` as a folder, not
      a link (no `->`), and `~/.stanza/dist/mac-*/` has no `Stanza.app` left.
- [ ] Spotlight (⌘Space, "Stanza") and Launchpad find the app (Spotlight can take a minute to index it). It opens.
- [ ] Its update button works: "You're up to date", not "isn't a git clone".
- [ ] Run the line again while Stanza is open: it refuses ("Stanza is running from this install"). Quit and run it
      again: it updates and replaces the app in `~/Applications`.
- [ ] On an older install (where `~/Applications/Stanza.app` is a link), running the line again replaces the link
      with the app.

## Update button

Needs a new commit on `main` to show up.

- [ ] In the copy you run with `npm start`, the refresh icon in the sidebar footer (right of the settings gear) turns
      into a download icon within 30 minutes, or about 10 seconds after restarting the app.
- [ ] At the same time a popup opens above the icon: "Update available", the new commit messages, and Later /
      Update… buttons. With the sidebar hidden (⌘S, with a tab open) the icon is hidden too and the popup sits in the
      bottom-left corner.
- [ ] Later closes it and it stays closed. Update… opens the update confirmation.
- [ ] Clicking it and confirming pulls the update and restarts the app.
- [ ] In the built `.app`, Update… closes the app, and after a minute or two it reopens updated (with your tabs). If it
      doesn't come back, look at `~/Library/Application Support/stanza/update.log` (it opens in TextEdit by
      itself when a step fails). For the app the install line put in `~/Applications`, it reopens from there, and an
      older install's link there is replaced by the app (check with `ls -l ~/Applications`).
- [ ] Make a local commit in the repo that clashes with the update, then click Update in the `.app`: the log opens with
      git's message and the old app reopens unchanged.

## Check for updates button

- [ ] A refresh icon sits in the sidebar footer, right of the settings gear, whether or not an update exists.
- [ ] Clicking it spins the icon while it checks. With no new commit, a popup above the icon says "You're up to date"
      and closes by itself after about 5 seconds (or with OK).
- [ ] With a new commit on `main`, clicking it opens the "Update available" popup, even if you chose Later before.
- [ ] Offline (Wi-Fi off), clicking it shows "Couldn't check for updates" with a reason instead of "up to date".
- [ ] Run a build whose clone is gone (build a scratch clone, move its `.app` out, delete the clone): the popup says it
      isn't a git clone.

## Updating later

- Running with `npm start`: use the Update button, or run `git pull` then `npm install`.
- Running the built app: use the Update button, or close it, run `git pull` then `npm run package:mac`, and open the
  new `.app`.
- Projects and settings are stored outside the repo, so updating keeps them.
