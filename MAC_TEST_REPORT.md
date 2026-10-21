# macOS test report

First run of [MAC_CHECKLIST.md](MAC_CHECKLIST.md) on a real Mac (macOS 26.6, Apple Silicon, Node 22, Claude Code
v2.1.280), 2026-10-20. Agents drove isolated test instances (own `--user-data-dir`, scratch git projects) over the
Chrome DevTools Protocol and Electron's main-process inspector. They could not press native keys, see the traffic
lights or Notification Center, so those items are listed under "Checks for a human".

## Fixed in this round

- **Full screen kept a gap for the hidden traffic lights.** The sidebar toggle, logo and name sat 72 px from the left
  edge. Main now sends `win:fullscreen` and `body.fullscreen` drops the gap.
- **Cmd+Q ended every session before asking.** Cmd+Q and Quit in the Dock call `app.quit()`, so `before-quit` ended the
  sessions first; "Keep open" in the "Quit Stanza?" prompt then left dead tabs. `before-quit` now cancels an unconfirmed
  quit and closes the window, whose close handler asks. Tested: Keep open leaves a shell and its server running; with
  nothing busy the app quits at once.
- **The checklist was out of date** (split keys, Shift+click to open beside, saved splits, only on-screen tabs restored,
  the update button's place in the footer, notification probes that never trigger). Updated.

## Bugs to fix

1. **"Needs input" never fires when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is set** (medium). The app passes the variable
   on to its Claude tabs, so Claude never sets its title. `isWorking` then reads any output as working: "Needs input"
   can't fire and quick replies give a false "Done". Seen when the app was started from inside a Claude Code session,
   which sets it. A Finder or Dock launch is unaffected (only PATH is taken from the login shell). Possible fix: add it
   to `STRIP_ENV` in `src/main.js`, since the app depends on the title; it is a user-settable variable, so decide first.
2. **Closing a just-started Claude tab once asked "End this session? Claude is working"** (low, not reproduced). The tab
   was idle at its first prompt; `isWorking` probably reads true for a moment while Claude starts. Watch for it before
   changing anything.
3. **`npm install` once left `node_modules/electron/dist` missing** (low, setup only). Needed
   `node node_modules/electron/install.js`; a second clone installed it normally. `install.sh` already handles it and
   the checklist mentions it. Possible fix: the same hint in the README's manual-clone steps.

## Works

- Setup: `spawn-helper` is executable after install (no `posix_spawnp failed`).
- Claude tabs, shell tabs (`$SHELL -l`, row label "Shell"), git branch and change count.
- Running: a server started from a tab is listed while that tab is active; clicking copies its URL.
- MCPs: connected servers listed, the rest behind "Show N more".
- VS Code button opens the project.
- Keys: Cmd+T/W/S, Cmd+Shift+S, Cmd+1..9, Ctrl+Tab, every split key, Cmd+arrows between panes, Cmd+Alt+arrows for the
  divider, Cmd+= / Cmd+- / Cmd+0 (terminal text size, else window zoom), Cmd+, settings, Cmd+Alt+I DevTools.
- Terminal: copy and paste through the Edit menu roles, right-click pastes (no word selection), Ctrl+C / Ctrl+V reach
  Claude untouched, Option+P opens Claude's model picker.
- Restore: on-screen tabs and their split come back in order with the focused pane, Claude tabs resume their
  conversation, shells start fresh, an untyped Claude tab is not saved.
- Tab order and splits: Cmd+T puts the new tab on top and Cmd+1 reaches it; two split groups get their own colors;
  clicking a row of the other group switches to it; unsplit keeps rows in place; dragging a row onto the terminal
  area opens a split.
- Notifications: exactly one "Needs input" per permission prompt and one "Done" per long reply (none later), nothing
  for quick replies or the focused active tab, the active tab notifies while the window is unfocused, clicking focuses
  the window on that tab.
- Built `.app` opened through LaunchServices: no "damaged" prompt, Claude tabs and the MCP list work, the login
  shell's PATH replaces the bare one, and with a `.zshrc` that sleeps 30 s the first tab still opens after about 7 s.
- Check for updates: "You're up to date" (closes after about 5 s), "Couldn't check for updates" with git's error when
  offline, and "isn't a git clone" for a copied `.app`.

## Not tested yet

These need a new commit on `main` to update to:

- The "Update available" popup with the commit subjects, Later, and Update.
- A source run's update: `git pull`, `npm install`, relaunch (and whether the relaunch keeps `--user-data-dir`).
- The built app's `update.sh`: a successful rebuild and reopen, and a failing one (a conflicting local commit), where
  `update.log` should open in TextEdit and the old app reopen.

## Checks for a human

- The traffic lights look right at the top left, with the sidebar shown and hidden, and the toggle moves to the edge
  in full screen (Ctrl+Cmd+F).
- The Finder button opens a Finder window.
- Cmd+Q with Claude working: the prompt appears, and Keep open leaves the tab working.
- Real Cmd+C / Cmd+V in the terminal and in the sidebar search box.
- Ctrl+C interrupts Claude mid-reply; Ctrl+V pastes an image into Claude.
- Notifications: allow the macOS prompt on the first one; click one with the window minimized (Cmd+M) and with another
  app in front; with notifications denied in System Settings nothing breaks.
- After a restart the first restored tab appears right away and the rest follow.
- Plan usage shows percentages in the footer. During the test it showed "—" because five test instances hit the usage
  endpoint's rate limit together; the first instance showed the numbers.
- Keychain: if macOS asks for access and you deny it, it doesn't ask again for 10 minutes.

## Notes for the next test run

- Start test instances without `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` (`env -u CLAUDE_CODE_DISABLE_TERMINAL_TITLE ...`)
  when launching from a Claude Code session, or notifications misbehave (bug 1).
- Give each instance its own project folders: two instances in one folder can match each other's new transcripts.
- Type first prompts through the terminal (`term.input` or CDP key events), not `api.ptyWrite`, which records no Enter,
  so the tab is never matched to its transcript.
- Wrap main-process evals in an IIFE: a redeclared `const` throws, the uncaught error opens a native error box and the
  main process stops answering.
- `openSession` takes a project object, not a path.
