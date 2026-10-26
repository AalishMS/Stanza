# Stanza design system

The UI follows **[shadcn/ui](https://ui.shadcn.com/)**: the dark (default) and light themes on the neutral base color (v4 tokens), plus a
short list of deliberate tweaks for a compact, terminal-first desktop tool. This file is the source of truth for how
the app looks. Read it before any UI change, and update it in the same change if a rule has to move.

shadcn is **copied, not installed**: there is no React, no Tailwind and no Radix. Its tokens live as CSS variables
at the top of `src/styles.css`, and its components are re-created as small CSS recipes that the renderer's `h()`
helper uses. The Tailwind class names in this file only say which shadcn recipe a rule comes from.

## 1. Tokens

All colors, radii and shadows are CSS variables in `src/styles.css`, and they use shadcn's names. Change a token,
never a scattered value.

**Themes** (Settings > Appearance, `ui.theme` = `dark` | `light` | `system`, default dark; `ui.claude` = Claude colors). Main sets
`nativeTheme.themeSource`, so `prefers-color-scheme` resolves the choice (System follows the OS live); renderer.js
mirrors it as `data-theme` on `<html>`. The color tokens sit in two blocks: `:root, [data-theme="dark"]` and
`[data-theme="light"]`. Any element with `data-theme` gets that theme's tokens (the settings page's preview cards use
this). Theme-independent tokens (radii, `--mono`, widths, `--group-*`, the accent) stay on `:root` only, so a nested
`[data-theme]` never resets the accent.

**Claude colors** (`ui.claude`, a switch above the theme cards): the Claude desktop app's palettes, applied to whichever
scheme the theme resolves to, so `data-theme` becomes `claude-dark` or `claude-light` (`themeName()` in renderer.js;
preload's `initialClaude`, from main's `additionalArguments`, covers first paint before `ui` loads).

| Token | `claude-dark` | `claude-light` |
|---|---|---|
| `--background`, `--card` | `#262624` | `#faf9f5` (cream) |
| `--foreground` | `#faf9f5` (ivory) | `#141413` |
| `--popover` | `#30302e` | `#ffffff` |
| `--secondary`, `--muted`, `--accent` | `#3a3a37` | `#f0eee6` / `#ede9de` |
| `--muted-foreground` / `--faint` | `#c2c0b6` / `#8f8d85` | `#5e5d59` / `#87867f` |
| `--border` / `--input` | `rgb(222 220 209 / 12%)` / `18%` | `rgb(31 30 29 / 10%)` / `16%` |
| `--sidebar` / `--sidebar-accent` / `--sidebar-border` | `#1f1e1d` / `#3a3a37` / `#34332f` | `#f3f1ea` / `#e6e2d6` / `#e3dfd3` |

`--primary` is fixed to Claude's clay `--hue-clay` `#c96442` (`[data-theme^="claude-"]`, below the accent table so it
beats `data-accent`; `--group-4`, the orange split color, becomes blue); the Accent color options are disabled while
it is on, and the theme preview cards show the Claude variants.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--background` | `#0a0a0a` | `#ffffff` | terminal, top bar, status bar, right panel, dialogs |
| `--foreground` | `#fafafa` | `#0a0a0a` | body text |
| `--card` | `#0a0a0a` | `#ffffff` | card surface (same as the background) |
| `--popover` | `#171717` | `#ffffff` | footer detail popover, `…` menu, update popover, exit overlay. Dark: one step above the terminal (shadcn v4), so menus don't melt into it |
| `--primary` | accent | accent | **the one accent**, see below (a tweak: shadcn's own primary is near-white) |
| `--primary-foreground` | `#fafafa` | `#fafafa` | text on primary |
| `--secondary`, `--muted`, `--accent` | `#262626` | `#f5f5f5` / `#f0f0f0` | kbd, chips, meter track, hover surfaces |
| `--muted-foreground` | `#a1a1a1` | `#5c5c5c` | secondary text, inactive tabs, labels |
| `--faint` | `#737373` | `#858585` | tertiary meta: paths, times, placeholders (tweak; shadcn has no third text level) |
| `--border` | `rgb(255 255 255 / 10%)` | `rgb(0 0 0 / 9%)` | dividers, panel and card borders |
| `--input` | `rgb(255 255 255 / 15%)` | `rgb(0 0 0 / 14%)` | input, outline button and active tab borders |
| `--ring` | `var(--primary)` | | focus rings (tweak; shadcn's ring is grey) |
| `--destructive` | `#ff6467` | `#d92d2d` | destructive actions, conflicts, critical meters |
| `--destructive-fill` | destructive 60 % | destructive | destructive button fill (white text) |
| `--success` | `#7fb77e` | `#2f8a3c` | running |
| `--warning` | `#d6b25e` | `#a86b00` | uncommitted changes, background activity |
| `--sidebar` | `#030303` | `#f7f7f7` | left project sidebar only: the frame, darker than the work area in both themes. Dark adds faint white noise (up to ~`#050505`, an SVG data-URI on `#sidebar`) (tweak) |
| `--sidebar-foreground` | `#fafafa` | `#0a0a0a` | |
| `--sidebar-accent` | `#262626` | `#e8e8e8` | selected sidebar row, gauge track |
| `--sidebar-hover` | sidebar-accent 50 % | 60 % | hovered sidebar row: a softer selected |
| `--sidebar-border` | `#1d1d1d` | `#e5e5e5` | the 1 px dividers: sidebar / terminal, terminal / right panel |
| `--scrim` | `rgb(0 0 0 / 60%)` | `35%` | dialog backdrop |
| `--radius` | `10px` | | base radius |
| `--radius-sm` / `-md` / `-lg` / `-xl` | `6` / `8` / `10` / `14px` | | shadcn's `rounded-sm/md/lg/xl` |
| `--shadow-sm` / `-md` / `-lg` | stronger | shadcn's | chips, popovers, dialogs. Dark uses real shadows (30-70 % black): shadcn's 10 % vanish on near-black, and menus open over terminal text |

The `accent` name is a trap: in shadcn, `--accent` is the **neutral hover surface**. The brand color is `--primary`.

### The accent rule

`--primary` is the only accent. It comes from the accent table in styles.css (Settings > Appearance, `ui.accent`,
`data-accent` on `<html>`): `blue` `#2850a5` (default), `violet` `#6b4fc8`, `teal` `#12776f`, `rose` `#b8336a`, as
`--hue-*` tokens. The same in both themes; each keeps white text readable on a primary button. Everything tinted is
derived from `--primary` with `color-mix()`:

- `--primary-hover: color-mix(in srgb, var(--primary) 85%, white)`
- focus ring: `0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent)`
- meter track: `color-mix(in srgb, var(--primary) 20%, transparent)`

Never hard-code an accent hue, or a tint of one, anywhere else (CSS, renderer, inline styles). The settings page's
swatches set `data-accent` on the swatch and paint `var(--primary)`. A new accent = one `--hue-*` token, one
`[data-accent]` rule, and the `ACCENTS` lists in main.js and renderer.js.

Primary appears **only** on: primary buttons, focus rings, progress-meter fills, the checked checkbox, the
"needs attention" status dot, drag-and-drop targets (split drop preview) and the sidebar's split-group rail. Nothing else gets it. The one exception to
"single accent": with several split groups, groups after the first take `--group-1..4` (violet, teal, rose, orange,
away from the status hues) so they can be told apart; a lone group is always `--primary`. When the accent is one of
those hues, its `[data-accent]` rule swaps that group color for blue, so the five stay distinct.

### Status colors

Color otherwise only carries meaning: `--success` green = running, `--warning` yellow = uncommitted changes or
background activity, `--destructive` red = conflicts, destructive actions, critical levels. In diffs (the Changes page and
the top bar's `+12 −3`) green and red mean added and removed lines, so they may tint those rows. No decorative color, no
gradients, no glows, no tinted cards.

## 2. Typography

- UI font: **Segoe UI Variable** (`"Segoe UI Variable Text", "Segoe UI", system-ui`). This is a tweak: shadcn uses
  Geist, but bundling it isn't worth it on Windows. On macOS `system-ui` resolves to San Francisco.
- Compact scale (a tweak; shadcn's base is 14 px): **13 px** body, 12 px small / labels, 11 px meta, 14 px
  dialog/section emphasis, 18 px dialog title (`text-lg`), 32 px welcome h1 (`text-3xl`, semibold, `tracking-tight`).
- Weights: 400 body, 500 for project names, active rows, buttons and labels, 600 for titles.
- Labels are **sentence case** (shadcn `SidebarGroupLabel`: 12 px, 500, `--muted-foreground`). No uppercase
  tracking-widened labels.
- Mono (`--mono`, Cascadia Mono; Menlo on macOS): ports, numbers in popovers, kbd.

## 3. Components

Class names are short and composable. These recipes mirror shadcn's components.

### Button: `.btn` + variant + size
- Base: `inline-flex`, gap 6, `rounded-md`, weight 500, 13 px, no wrap, `transition: background, color, border .15s`.
  `:focus-visible` = ring. `:disabled` = opacity .5.
- Variants:
  - `primary`: `--primary` / `--primary-foreground`, hover `--primary-hover`.
  - `outline`: 1 px `--input` border, `bg color-mix(--input 30%)`, `shadow-sm`, hover bg `--accent`.
  - `ghost`: transparent, `--muted-foreground`; hover bg `--accent`, `--foreground`.
  - `destructive`: bg `color-mix(--destructive 60%, transparent)`, white text, hover 75%.
- Sizes: default h 32 / px 14; `sm` h 28 / px 12; `icon` 32 square; `icon sm` 24 square (14 px icon).
- `.danger` on a ghost icon button = `--destructive` on hover (row delete, kill server).
- `.on` = toggled state (bg `--accent`, `--foreground`).
- **No pill buttons.** Pills were the old design. One exception: the right sidebar's tab pill (see "Tab pill").

### Remote projects

Add project uses the existing dialog recipe, up to 520 px wide, with a themed device menu:
This computer, saved remotes, Add remote. Its outline trigger shows an icon, label and chevron;
the menu uses the DropdownMenu recipe with a checkmark on the current device, arrow-key
navigation and Escape to close the menu before the dialog. Its native popover invoker toggles
the menu on repeated trigger clicks. Local selection keeps the native folder picker.
Remote selection shows an optional project name, a path field with Go, a flat scrollable list
of 32 px folder rows and a primary Add project button. A New folder ghost button in the folder
browser's toolbar reveals an inline name field with Create/Cancel. Creating opens that new
child folder. Go (or Enter) browses the typed path. Disabled devices are omitted from the picker;
Settings > Connections manages their names and on/off state.
Below the device selector, outline Git URL and GitHub repository actions open a clone dialog on that device.
The clone dialog uses the same inputs, flat 32 px repository/folder rows and right-aligned actions: Back and
primary Clone and add project. Local destinations use a native folder picker; remote destinations use a path
and Browse folder list, with the same New folder toolbar and inline Create/Cancel controls as Add project.
Creating a child folder selects it as the clone destination. GitHub has two source sections: **Your Repositories:** (search and a flat list capped at
192 px, selected row on `--accent` with a checkmark) and **Any Other Repository Link:** (one URL input below a
`--border` divider). Selecting a row clears the link; entering a link clears the selection. There is no owner/Load
control or duplicate source field. Progress and errors stay in plain status text; controls disable while cloning.
Existing folders are never overwritten.
Inputs follow the Input recipe; all
surfaces use the four existing palettes. The close button stays at the dialog's right edge.

A remote project row uses a server outline icon, the usual truncated project name, then a
separate 11 px faint device label (up to 72 px) and a 6 px connection dot: success = connected,
warning = connecting, faint = offline. The tooltip explains the state/error. Its session rows
retain the normal working/attention dots; the project does not show a second running dot.
Status-bar paths read `device · /absolute/remote/path`. Remote shell labels are Shell on both
desktops. Closing a remote tab says it keeps the process running; End is an explicit action.

The remote right sidebar explains which features are available, with no local MCP/agent/server
data substituted. Changes retains its existing layout but has no local Open in VS Code action.
File upload and clipboard-image attempts explain that remote upload is not available yet.

### No tab strip
There is no horizontal tab strip: the sidebar's session rows are the tabs. Every open tab has a row (a transcript
row, a "New session" placeholder until the first reply, or a "PowerShell" row). `Ctrl+Tab`, `Alt+1..9` and
`Ctrl+W` still work on tab order. The top bar has a ghost `×` that closes the active session (hidden on the home screen).

### Split panes
Up to 4 tabs side by side (top-bar columns button, `Ctrl+Shift+→`, Shift+click a sidebar row, or dragging a row onto the
terminal or home screen (a session already on screen is opened a second time beside itself); while dragging, a `--primary` 18% fill with a 70% 1 px outline previews the pane it would become). The terminal area becomes
a grid with 1 px `--border` gaps, no boxes or gutters. Each pane has a 26 px header strip on the terminal background:
status dot, title (12 px, `--faint`), and a hover-only ghost `×` that closes that pane's session. The focused pane is marked only by its title going `--foreground` and the other panes' terminal text (and scrollbar) dimmed to 40 % opacity:
no outline, no other color, no background change. Panes clip their content so nothing reaches the status bar. A stacked split ("New session below") is the same grid transposed. Dividers are 4 px invisible handles that take the `.rz` hover tint. When a pane
would drop under ~100 columns the right sidebar hides itself and returns when there is room (see AGENTS.md).

### Split group (sidebar)
No card and no header: the members are ordinary flat session rows, threaded by a 2 px rail (radius 1 px) down the dot
column (centred at 37 px), from the first row's dot to the last's, like stops on a line. The rail is `--g` 80 % mixed
with `--foreground` (a touch brighter in dark, darker in light) and is drawn above the rows' hover/selected fill, the
dots above it. `--g` is `--primary` for a lone group; with several groups each keeps the color it got when created
(`.g0`..`.g4`, the lowest free one). While the group isn't on screen the rail turns neutral (`--faint` at 55 %);
clicking any of its rows shows it. A member row's `…` menu adds "Take out of split" and "Unsplit" (the top-bar button
and `Ctrl+Shift+\` still unsplit the group on screen). The group lives in its project's list, at its first member's place in tab order; when members come from
different projects it sits at the top of the list and each row shows its project name (11 px `--faint`) in place of the time.

### Settings page
`#settings` covers the terminal area (top bar, sidebars and status bar stay). Centered 840 px column, 32 px padding:
title 18 px / 600 with a ghost `×`, then a two-column layout (shadcn's settings example): a 168 px sticky section nav
(32 px rows, 14 px icon, `--muted-foreground`; hover `--sidebar-hover`; the open one `--accent` bg, `--foreground`,
500) and the open section. Sections: **Appearance** (default), **Connections**, **Chats** and **Shortcuts**; the open one is runtime only. A
section header has a 14 px / 600 title, a 12 px muted line, an optional `Reset all` outline sm button on the right, and
a 1 px `--border` rule under it.

Appearance is a stack of fields (20 px padding, `--border` rules between): name 13 px / 500, a 12 px muted line, then
the control. **Claude colors** comes first: name and line on the left, a switch on the right (`.claude-switch`, the page's
one playful control, a deliberate exception to the quiet rules): a 56x32 pill, `--input` off and clay with a soft clay
glow on, a white thumb holding a 12-ray spark (`ico('spark')`) that slides with a springy overshoot (wider while
pressed), turns 180 degrees and goes clay. Switching on bursts one clay ring from the thumb (`.pop`), and the new
palette spreads over the window in a circle from the switch (`setClaude`: a view transition whose new snapshot is
revealed by a growing `clip-path`, 700 ms). Reduced motion turns all of it off. **Theme**: three preview cards (16:10, `rounded-lg`, 1 px `--border` ring; hover `--input`; selected 2 px
`--ring`), each a mini window drawn with that theme's own tokens (`.pv[data-theme]`: sidebar strip, a few
`--muted` lines, a `--primary` button); System shows dark and light cut diagonally. Label under the card, 12 px / 500,
`--foreground` when selected. **Accent color**: outline-style option buttons (h 32) with a 14 px swatch dot + name;
selected = `--ring` border. **Terminal text size**: outline icon `−` / `+`, the value in mono, and a ghost
"Reset to 14" when changed. **Interface zoom** uses the same control (`110 %`, "Reset to 100 %"). All are `role=radio` groups; a re-render puts focus back on the same control (`data-fk`).

Connections: an outline sm **Add connection** action in the section header, a muted explanation, then
one field per saved SSH device separated by the usual `--border` rules. The header pairs a server icon,
device name and muted target/port with an On/Off label and a compact accessible switch (32 × 18 px,
`--input` off, `--primary` on; ordinary focus ring, no animation). A status dot and plain text show
Connected, Connecting, Offline or Off. Test connection (outline sm), Rename and Add project (ghost sm)
sit below; results and errors wrap in `.set-note` lines. Off disables testing and project creation.
Adding and renaming use the existing dialog and input recipes. All four palettes share these tokens.

Chats: one field, **Chat folder**: the path in a bordered box (`.set-path`, 12 px muted, `rounded-md`, wraps anywhere),
then `Change…` (outline sm, folder icon), `Show in Explorer` (ghost sm) and, when not the default, `Reset to default`
(ghost sm). Change/Reset are disabled while a chat tab is open; `.set-note` lines under it explain that, warn (`.err`)
when the folder is the home folder, and report the last change.

Shortcuts: each group is a 12 px / 500 `--faint` label over one bordered card (`rounded-lg`, 1 px `--border`, rows
split by 1 px `--border`). Rows are 44 px (hover: `--accent` 50 %) with the name (13 px) and an optional 11 px
`--faint` hint on the left. Shortcuts are **Kbd chips** (h 24, `--muted`, 11 px mono, `rounded-sm`; a 20 px `×` fades in on chip
hover without shifting anything), then a ghost `+` and, on changed rows, a ghost `undo` reset (an empty 24 px slot
otherwise, so the chips stay aligned). Recording shows a "Press keys…" chip with the focus ring. Notes go under the
section header (12 px muted, `--destructive` for errors).

### Status dot
6 px circle, only on things that are live: `--success` running, `--warning` pulsing working (Claude busy or
background output), `--primary` pulsing needs attention (bell, or exited in the background). Nothing live = no dot
(no grey placeholder).

### Sidebar: shadcn `Sidebar`, lightened
- `#sidebar` is a full-height column: bg `--sidebar` (the darkest surface), width 232 by default (resizable, see below), 1 px `--sidebar-border` on the
  terminal side. Nothing inside has its own box, card, tint or border.
- Top row (40 px, draggable): sidebar toggle, logo, app name (`#brand`). Logo + name are one plain
  button (`#home`, no hover surface, focus ring only) that goes to the home screen; open tabs keep running. While collapsed, `#brand` moves to the start
  of the top bar so the toggle stays reachable. No update icons here: the single update button is in the footer.
  When an update is first seen, an **update popover** (`#update-pop`, the Popover recipe, 300 px) opens above the footer's
  update button (bottom-left corner of the window while the sidebar is collapsed):
  "Update available" (13 px / 600), `N new commits` (12 px muted), up to 5 commit subjects (12 px muted, one line each,
  `·` bullets, "and N more" in `--faint`), and the AlertDialog button row (`Later` outline sm, `Update` primary sm). `Update`
  turns the same popover into a confirm step ("Update and restart?": the commit list, a 12 px muted warning with the
  open-session count, a bordered list of tabs where Claude is working, `Back` outline sm / `Update and restart`
  primary sm, destructive when a tab is working) and then a progress view (spinner + "Updating Stanza…"). There is no
  separate update dialog. It stays until dismissed: no outside-click or Escape close, so it can't vanish unseen while typing in a terminal.
- **Home screen** (no tabs): the sidebar is always in the layout, even when collapsed (`sidebarShown`); collapsing applies
  once a tab is open. The toggle still flips the saved choice there. Layout changes (pin, unpin, home <-> tab, launch) snap;
  only peeking slides.
- **Peek** (collapsed, a tab open; like Zen browser's compact mode): the pointer reaching the window's left edge
  (`#peek-zone`, 6 px, below the top bar) slides the sidebar in over the terminal, from under the top bar to the bottom,
  `--shadow-side` (a sideways shadow), same width. Nothing reflows (the terminal keeps its size). It moves on a spring
  (`makePeek`, `PEEK_SPRING` k 600 / c 46, nearly critically damped: no overshoot), not a CSS transition, so a peek
  cancelled on its way in slows, stops and glides back instead of reversing in one frame; in and out each look done in
  ~200 ms. It leaves 80 ms after the pointer leaves it. A pointer that leaves
  the window through the left edge (a window that isn't maximized) also brings it out and keeps it out while it stays within
  144 px of the edge and within the window's height (main watches the cursor out there, `peekHold`). A peek that is out also
  stays while the pointer is over the top bar (its buttons, its drag region and the window buttons). It stays while its `…`
  menu or footer popover is open or the search has focus, and leaves when a session row is dragged. Toggle / `Ctrl+S` pin
  it as usual. No transition under `prefers-reduced-motion`.
- Search: a plain 32 px row (search icon + "Search" placeholder), no border; hover/focus = `--sidebar-hover`. Its right end
  shows the shortcut as a quiet outlined `kbd` (`--faint`) while empty and a 20 px ghost × (clears) once there is text.
  The row ends with "add project" and `+`; `+` opens a DropdownMenu: "No project" (chat icon), a separator, then
  one item per project (folder icon), or "Add project…" when there are none.
- Rows are flat, 32 px, `rounded-md`, side padding 8. 2 px between rows, 12 px between project groups.
  Hover = `--sidebar-hover`, selected = `--sidebar-accent`. **No borders, no left accent bar.**
- Project row: chevron (14 px, `--faint`), folder icon, name (500), and on the right one status dot when anything
  in the project is live. On hover the dot is replaced by `+` (new session) and `…` (DropdownMenu: continue, open
  PowerShell, show in Explorer, move to top, remove). When another project has the same folder name, the name is
  followed by its parent folder(s) in 11 px `--faint` (`.p-parent`). Adding a local or remote project, starting/restarting
  a session, or deliberately focusing one moves its whole project group first, below Chats; the order survives restart.
  Reordering slides the folder and its sessions together over 280 ms (`cubic-bezier(0.22, 1, 0.36, 1)`), with the
  displaced groups making room. Status redraws continue from the current visual positions without extending the finish
  time; rapid switches start from there too. No movement on initial render, search/filter changes, while hidden, or
  with reduced motion. Moving groups briefly paint `--sidebar` behind their text so crossing rows stay readable.
  Restore, automatic focus after closing/removing a pane, background output, polling and reconnect do not move projects.
  Project rows can still drag to adjust the order until the next use: a 2 px inset
  `--primary` line (`.drop-before` / `.drop-after`) shows where the row lands. Path and git info live in the tooltip; the **active** project adds one
  11 px `--faint` line under it (`branch · 3 changed`, the branch truncates first). A collapsed active project gets
  the selected background.
- Folder icon: the same `folder` icon for every project, 16 px in an 18 px slot, `--muted-foreground`.
- Chats: "No project" sessions sit in a project group named "Chats" with the `chat` icon, pinned first (not
  draggable, no "move to top", no git line). It appears after the first chat and shows 4 rows before "Show N more".
- Session list order: newest first throughout. The project's open tabs first, in tab order (a new tab goes on top; a
  split group moves to the top when it forms or gains a member, so unsplitting moves nothing), then its other sessions
  newest first. No drag-to-reorder of sessions.
- Session rows: no guide line. Columns line up: the status dot sits under the folder icon (slot at 28 px),
  titles start at 52 px like the project name. Title 13 px with ellipsis; time 11 px `--faint` on the right. Rows
  backed by an open tab show `×` in place of the time on hover (middle-click closes too). Active = weight 500.
  Right-click a transcript row opens the DropdownMenu at the pointer: Open/Show, Open beside, Fork session, Fork beside,
  then Relaunch, skip permissions (or Relaunch with permissions). On hover a ghost icon `…` replaces the time (left of `×`)
  and opens the same menu below it; it stays visible while that menu is open.
- Footer: one slim 44 px row. Grouped on the left, 2 px apart: `settings` (ghost icon, `.on` while the settings page is open), the update button and the usage stat; the running stat alone right-aligned. Stats are each **icon + value** in a
  28 px `rounded-md` button (padding 0 8, gap 6, 2 px apart, 12 px tabular numbers): plan **session** usage as a ring
  gauge + `10%`; running as a status dot + `3 running`. Icons `--faint`, values
  `--foreground`, colored only at warn/crit levels. Weekly usage lives in the tooltip and the popover. Each stat opens its
  `#detail` popover; hover `--sidebar-hover`, `.on` = bg `--sidebar-accent`. No context stat (the right sidebar shows it).
- Update button (`#update-slot`, ghost `icon sm`, one button with two states): `redo` (refresh) = check for updates now,
  spins while the fetch runs; with nothing to install, the update popover opens as a short note ("You're up to date" /
  "Couldn't check for updates" + the reason, one `OK` button, closes itself after 5 s). When the app's own repo has new
  commits (from the 30 min poll or that check) it becomes `download`, tinted `color-mix(--primary 60%, --foreground)`,
  pulsing while updating; click opens the update popover's confirm step.
- **Resizing**: both sidebars are drag-resizable (`.rz` handles, 4 px overlaying the divider with no layout width; hover/drag = `--primary` tint; double-click resets). Left 180–480 (default 232), right 240–600 (default 300), saved as `ui.sidebarW` / `ui.rsideW` and applied to `--sidebar-w` / `--rside-w`. While a markdown tab shows, the right handle sets that width instead: 20–75 % of the window (default 40), `ui.rsideDocPct` -> `--rside-doc-w`, never under 320 px and always leaving the terminal 360 px. Content sits 4 px from the left edge of the sidebar (8 px right).
- The right sidebar (`#rside`, 300 px by default) uses the `--background` surface (same as the terminal) with a 1 px `--sidebar-border` on its terminal side.
  It has tabs (see "Tab pill"): its own content below, one page per open markdown file ("Markdown page"), and the
  project's Changes ("Changes page").
- **Right peek** (the right sidebar closed: by hand, by a cramped split, or on the home screen): the left sidebar's "Peek",
  mirrored, with the same spring, timings and outside-the-window hold (144 px past the right edge). The zone is
  `#rpeek-zone`, 2 px on the window's right edge (not 6: the terminal's `.vbar` sits 2-10 px from that edge). The sidebar
  floats in over the terminal between the top bar and the status bar, where it sits when open, with `--shadow-side-r` (shadow on its left side).
  It shows its active tab (a markdown tab at `--rside-doc-w`). A file opened while it is closed (Ctrl+click in a terminal,
  "Open CLAUDE.md") floats it in the same way and never pins it or resizes the terminal. Since the pointer isn't on it, it
  stays until the pointer has been in it and left, or a click or Esc outside it. A Docs row opens the file inside the peek without pinning,
  and switching tabs in the pill still slides the width. Coming out renders the panel and polls it (nothing is polled while it is closed).
  It stays while `#menu` or a dialog (`#modal`) is open or its editor or another field has focus, and leaves when a session row is
  dragged. The toggle / `Ctrl+Shift+S` pin it, which snaps.
  Top: **Context** header (12 px muted title + `150k / 200k`, the % at 20 px/600 colored only at warn/crit, a `.meter.big`).
  Then collapsible sections (32 px muted 12 px/500 header with a chevron and a faint count; open by default): **MCPs**,
  **Subagents**, **Running**, **Docs**, **Images**. Rows are the same flat 30 px inset rows: 8 px circular status dot (or a 14 px check for finished
  subagents), name, and a 12 px meta on the right (status word, model in `--mono`, `:port`).
  Only connected MCPs are listed; the rest sit behind a muted `Show N more` row (same pattern as the session list), and the count reads `connected/total`.
  MCP status colors: connected `--success`, failed / needs_client_registration `--destructive`, needs_auth `--warning`,
  disabled / unknown `--muted-foreground`. Subagents: working = pulsing `--warning` dot, finished = `--success` check,
  idle = `--faint` dot. Running rows with a port copy `http://localhost:<port>` on click (meta flips to "Copied"),
  Shift+click opens it in the browser; on the home screen the name gets a muted ` · <tab label>` suffix.
  Subagents and Running show 5 rows, then the same muted `Show N more` / `Show less` row; collapsing the section folds it again.
  **Images** (last, never folded: the panel scrolls): a grid of tiles (`.img-grid`, auto-fill, min 84 px, gap 8, 16 px inset). Tile =
  4:3 thumbnail, `object-fit: cover`, 1 px `--border`, `rounded-sm`, `--muted` while loading or undecodable; hover border `--ring`;
  under it an 11 px `--mono` `--faint` label (`#n` or file name, ellipsis). Click opens the lightbox: the wide dialog (same head as the
  subagent popup: title, faint one-line path, `btn outline sm` "Show in Explorer/Finder" for files, ×), the image centered, contained. Unlike the other wide dialogs it
  wraps the image (min 420 px, max the window less 48): an image shows at its own size when it fits, else scaled down to fit
  the window, never scrolled; the head takes the dialog's width (long paths ellipsize). With 2+ images a `btn ghost icon`
  chevron sits on each side (disabled at the ends, 8 px body inset); they and ←/→ step through the grid's order, the old image
  dimmed to 50 % until the next one loads.
  **Docs** (not on the home screen): rows with a 14 px file icon, the file name and its folder as meta, under two 11 px
  `--faint` sub-labels: "Written in this session" (folded after 5 like Subagents) and "Project" (top-level files).
  Clicking a row opens the file as a tab.

### Tab pill (`#rside-pill`)
The right sidebar's tab switcher, the one pill in the app (a deliberate exception to "no pills"): floating 14 px above the
bottom edge, centered, `--popover` with a 1 px `--border`, fully rounded, `shadow-md`, 3 px padding. Shown only while the
active tab's project has a markdown file or its Changes open. Slots are 26 px high, fully rounded, `--faint`, hover bg `--accent` +
`--foreground`: first the sidebar's own tab as a 14 px `panelRight` icon (30 px wide), then the Changes tab as a 14 px `diff`
icon (widens on hover to show its 12 px ×, like a dot), then a 6 px dot per file in open order.
The active slot is `--foreground`, and its dot stretches into an 18 px bar (width transitions with a slight overshoot, so the
bar seems to travel). A hovered dot widens to show a 12 px × that closes it; the file name is the native tooltip. The pill
rises in (240 ms) when it appears and a new dot pops in (300 ms); no other motion. Too many dots scroll sideways.

Switching tabs animates the sidebar's width (280 ms, `cubic-bezier(0.32, 0.72, 0, 1)`): out to the doc width for a file, back
to `--rside-w` for its own tab; opening the sidebar onto a file tab slides it out from 0. The page keeps its final width while it
slides (it travels with the edge, no re-wrapping), and terminals keep their size until it has settled. No motion with
`prefers-reduced-motion`.

### Markdown page (`#rside-doc`)
- Head (52 px, 1 px `--border` under it): file name 13 px/600 over its path 11 px `--faint` (`project\docs\PLAN.md`, the full
  path outside the project), then ghost `icon sm` buttons: `pencil` (Edit; `.on` while editing), `code` (Open in VS Code),
  `folder` (Show in Explorer/Finder), ×. While editing, an 11 px `--faint` status sits left of them ("Saving…" / "Saved",
  an error in `--destructive`).
- Editor: the raw markdown in a borderless, transparent textarea filling the body (same 18 / 24 / 72 padding), 12 px
  `--mono`, line height 1.6, `--foreground`, caret `--primary`, wraps; no toolbar, no line numbers, no save button.
- Body scrolls, padding 18 / 24 (72 at the bottom, room for the pill), text selectable. The UI's compact scale: 13 px body,
  line height 1.65; h1 20 px and h2 16 px (both 600 with a 1 px `--border` rule under), h3 14, h4/h5 13, h6 12 muted.
  Blocks 12 px apart; tight lists have no paragraph gaps.
- Inline code: `--muted` bg, `rounded-sm`, 12 px `--mono`. Code blocks: 1 px `--border`, `rounded-md`, `--muted` 40 %, scroll
  sideways. Tables: 12 px, 1 px `--border` cells, header row `--muted` 50 %, scroll sideways.
- Links: `color-mix(--primary 55%, --foreground)`, underline at 35 %, full on hover; a link whose file is missing turns
  `--destructive`, dashed. Quotes: 3 px `--border` rule, muted text. GitHub alerts (`> [!NOTE]`): the rule and a 12 px/600 title
  in the link color; WARNING `--warning`, CAUTION `--destructive` (color = meaning).
- Task items: the Checkbox recipe at 14 px, read-only, in the bullet's place. Front matter: a bordered grid, keys in
  `--mono` muted. Remote images are never fetched: a dashed `--faint` chip with the alt text links to them; a missing local image is the same chip.

### Changes page (`#rside-diff`)
The project's uncommitted changes as a unified diff per file, at the markdown page's width (same slide, same resize).
- Head: the Markdown page's head: "Changes" over `branch · 4 files +120 −30` (the branch as the status bar shows it, `@abc1234`
  when detached; counts in `--mono`, `--success` / `--destructive`), then ghost `icon sm` buttons: Collapse all / Expand all
  (`foldAll` / `unfoldAll` chevrons, with 2+ files that have lines) and ×.
- Live: Claude's edits update the page in place. Only the edited files are redrawn, and what is at the top of the view
  stays there, so reading (or a selection in another file) is never interrupted.
- Files stacked in path order, each a 34 px header row that sticks to the top while its lines scroll by (opaque
  `--background`, a 1 px `--border` line under it; hover `--accent` 50 %): a 14 px chevron (turned down while open), the
  status letter (11 px / 600 `--mono`: M `--warning`, A and U (new, untracked) `--success`, D `--destructive`, R muted),
  the folder in `--faint` and the file name (12 px / 500; a rename shows `old → new`), `+n −n` (11 px mono), and a ghost
  `code` button (Open in VS Code at the first change; a 24 px gap for a deleted or binary file). Clicking the row folds it;
  folding a header stuck at the top keeps it there (the view moves to it, not into the next file). Lockfiles and files
  over 400 changed lines start folded. A file without lines (binary, too large, mode change, pure
  rename, empty) is the header alone, with an 11 px `--faint` note ("binary", "5.4 MB, not shown") and no chevron.
- Lines: 12 px / 18 px `--mono`, wrapped (`pre-wrap`), two line-number gutters (11 px `--faint`, right-aligned; a click
  opens the file at that line, hover `--foreground`), a sign column (`+` `--success`, `-` `--destructive`, not selectable).
  Added rows `--success` 12 %, removed `--destructive` 12 % (gutters 8 % more), context text `--muted-foreground`. The
  changed words of a replaced line are `mark`s at 30 %, one per separate edit (edits under 3 characters apart share one). Hunk headers (`@@ -12,7 +12,8 @@` and the function, muted) are a
  20 px `--muted` 50 % strip; "No newline at end of file" is an 11 px italic `--faint` row.
- Empty and error states: centered 72 px down, a 20 px `--faint` icon (`check` for "No uncommitted changes", `branch` for
  "Not a git repository" or a failure), a 13 px / 500 title, a 12 px muted line.

### DropdownMenu: shadcn `DropdownMenu` (`#menu`)
- On the Popover recipe: bg `--popover`, 1 px `--border`, `rounded-lg`, `shadow-md`, padding 4, min-width 210.
- Items: h 30, padding 0 8, `rounded-sm`, 13 px, 14 px `--muted-foreground` icon; hover/focus bg `--accent`.
  Destructive item = `--destructive` text and icon. Separator: 1 px `--border`, full bleed.
- Closes on outside mousedown, Escape, window blur/resize and list scroll.

### Input: shadcn `Input` / `SidebarInput`
- h 32, `rounded-md`, 1 px `--input` border, `bg color-mix(--input 30%)`, placeholder `--faint`.
- `:focus-within`: border `--ring` + ring shadow.

### Welcome screen

The "Workbench" direction of `mockups/home` (standalone proposals with sample data; not packaged). No cards except the
last-conversation box: sections are separated by 1 px `--border` rules and a column rule.

- The page content (max width 1040) is centred vertically while it fits (`margin: auto`), top-aligned once it scrolls.
- Left-aligned header: a 12 px muted time-of-day greeting with the OS user name ("Good afternoon,
  Aalish"; main's `state:get` `user`, left out when empty), "Back to your work." (32 px / 600 h1; "What should we
  build?" with no projects), one 13 px muted line; today's date (11 px mono `--faint`) bottom-right, hidden when stacked.
  No logo. The page fades and rises 6 px in when shown (0.35 s, none with reduced motion; on `#welcome` itself, so
  re-renders don't replay it).
- **Last conversation** (the newest transcript of any project by last message): a `rounded-lg` 1 px `--border` box on
  `--muted` 15 % over `--background`, 20 px terminal icon, "Last conversation · 12 minutes ago" (11 px), the session
  title (14 px / 500), "project · branch" (11 px), and an outline "Continue →" button ("Open" when a tab shows it).
- **Projects**: a 13 px / 600 head with the row count (11 px mono `--faint`) and a ghost sm "+ Add project"; a 36 px
  search field (1 px `--border`, `rounded-md`, `--ring` + focus ring on focus, the match count on its right; Enter opens
  the first match, Esc clears); flat `.proj` button rows (62 px, 1 px `--border` under each, hover/focus = `--accent`
  60 % with rounded corners): 18 px icon (folder, `terminal` while the project has an open tab, chat for Chats), name
  (14 px / 500) + path (11 px `--faint`), git on two right-aligned lines (branch muted, then `N changed` in
  `--warning` / clean / ahead-behind; one line without a repo; "No project needed" for Chats), an arrow that slides in
  on hover. Sidebar order, Chats last. Six rows, then a ghost "Show N more projects ⌄" that opens in place (a search
  shows every match), then an 11 px `--faint` centered caption.
- Right column (container query on `#welcome`: from 760 px `.welcome-inner` is a grid and the column spans the header
  rows too, so it starts at the top of the page and the page stays short; 284 px wide, 48 px gap, a 1 px `--border`
  rule on its left and 28 px padding; each column only as tall as its content, `align-items: start`; below 760 px it
  stacks under the projects with a top rule). Windows under 940 px tall get tighter gaps, a 28 px h1 and 54 px rows,
  so six projects fit without scrolling at 900 px. **Your activity**: 2x2 totals (24 px / 500 tabular value, an 11 px muted unit for the
  streak, 12 px muted label, 11 px faint sub; 4 across while stacked at 560 px+), a 1 px rule, month labels (10 px
  mono, `monthLabels` in lib/ui.js), the 18-week messages-per-day map (Monday on top, 2 px rounded squares, `--muted`
  empty, then `--primary` mixed into `--muted` at 38 / 60 / 80 / 100 %: the shade is data, so it may use the accent;
  today ringed with `--ring`; max 340 px stacked), a right-aligned Less-More legend, then "Busiest around …" /
  "Updated <date>". **Plan usage** under a rule: per limit the label and % (12 px mono, warn/crit colors) on one line,
  a 4 px meter on `--muted`, the reset time (11 px `--faint`) under it.
- Shortcuts: one quiet centered `kbd` line at the bottom of the page (`margin-top: auto`), under the content when it
  scrolls; it never covers a row.

### Popover: shadcn `Popover`
- `#detail` and the exit `.overlay`: bg `--popover`, 1 px `--border`, `rounded-lg`, `shadow-md`, padding 12–16.
- Heading: 13 px, 600, `--foreground` (sentence case).

### AlertDialog: shadcn `AlertDialog`
- Scrim `rgb(0 0 0 / 50%)`. Panel: bg `--background`, 1 px `--border`, `rounded-lg`, `shadow-lg`, padding 20,
  width 420.
- Title 18 px / 600; description 13 px `--muted-foreground`; footer right-aligned, gap 8: Cancel = `btn outline`,
  action = `btn primary` or `btn destructive`.

### Progress (meters): shadcn `Progress`
- Track `color-mix(--primary 20%, transparent)`, `rounded-full`; fill `--primary`.
- `.warn` fill `--warning`, `.crit` fill `--destructive` (track stays neutral `--muted` then).
- Ring gauge (`.gauge`, circular Progress): 16 px, 3 px stroke, pure CSS (`conic-gradient` masked to a ring,
  `--p` = percent). Same fills; the track is always `--sidebar-accent`, because a primary tint disappears on `--sidebar` (and `--muted` does in light).

### Kbd: shadcn `Kbd`
- bg `--muted`, `rounded-sm`, h 20, padding 0 6, 11 px mono, `--muted-foreground`.

### Checkbox: shadcn `Checkbox`
- Native `<input type=checkbox>` with `appearance: none`: 16 px, `rounded-sm` (4 px), 1 px `--input` border,
  `bg color-mix(--input 30%)`. Checked: bg + border `--primary`, white check (CSS mask/`::after`). Focus = ring.

### Scrollbars
- Thin (8 px), thumb `--border` color, `rounded-full`, hover `--input`. The terminal uses its own `.vbar` (see
  AGENTS.md); same colors.

### Icons
- Lucide-style (Feather-compatible) inline SVG paths in `ICONS` (renderer.js), 24-unit viewBox, stroke 2, round
  caps, drawn at 16 px (14 px in small buttons, 12 px inline). Outline only.
- One exception: the top bar's "Open in VS Code" button shows the official VS Code logo in its own blues
  (`VSCODE_SVG` in renderer.js), because it stands for that app. No other icon gets brand color; the Update
  button's `--primary` tint is the accent, not a brand color, and it only appears when there is something to do.
- Logo: a flat black rounded tile with five white lines of text whose lengths form an S, the last one ending in a blue block cursor (`#4f7be0`, fixed: the icon doesn't follow `ui.accent`), no gradients. `LOGO_IMG` in renderer.js uses `assets/icon.png` in the sidebar (20 px). It gets a 1 px `--border` ring (`box-shadow`, `border-radius: 22%` = the icon's corner), so the black tile still reads on the dark theme; on light it vanishes into the tile's edge.

## 4. Layout and behavior (tweaks kept from before)

- **Terminal first.** The terminal gets the space and the focus. The chrome around it stays quiet: the top bar and
  status bar are `--background` like the terminal, and only the left sidebar is **darker** (`--sidebar`), a frame
  around the work rather than a panel competing with it (a tweak: shadcn's sidebar is the lighter side).
- Two columns: the full-height sidebar, then the workspace (top bar, terminal + right sidebar, status bar). The top
  bar and status bar never run under the sidebar.
- Top bar 40 px (draggable; new-session `+` on the left, the Changes button (`+12 −3`: a 14 px `diff` icon and the
  counts in 12 px mono, `--success` / `--destructive`; ghost, `.on` while the Changes page shows, only while the project
  has changes), right-sidebar toggle and the window controls on the right via
  `titleBarOverlay`). On macOS the traffic lights sit top-left instead (`trafficLightPosition`), so `body.mac` moves the
  room from the top bar's right padding to `#brand`'s left padding, except in full screen, where macOS hides them
  (`body.fullscreen`, sent by main). Status bar 24 px: git branch, changes (a plain text button that opens the Changes page) and path on the left; the active Claude tab's model,
  effort and subagents, then the running count, on the right. There is no separate info bar.
- **No badges.** Git info is plain text (`main  2 changed`), colored only by meaning.
- Lists are flat inset rows; nothing wraps or shifts on hover.
- Tooltips are native `title` attributes. Details go in tooltips, not extra lines.
- Shadows only on raised things: outline buttons (barely visible), popovers, menus, dialogs.

## 5. Terminal

Per-line font size is impossible in a terminal grid, and the app never re-parses Claude's output into "blocks".
`XTERM_THEME` is the real lever.

- **Typography** (`TERM_FONT` in renderer.js): Cascadia Mono (Menlo on macOS, which has no light weight), light body
  weight (300; 400 in the light theme, where thin dark strokes on white break up, `termWeight()`), bold 700, line height 1.4, slight letter spacing. Size via `Ctrl +` / `Ctrl -` / `Ctrl 0` (`⌘` on macOS;
  10–24, saved in `ui.fontSize`).
- Claude Code emits the **ANSI 16-color palette** (measured from the xterm buffer): default fg = body, `white` =
  secondary/meta text and rules, `white`+dim = diff context, `brightWhite` on `brightBlack` bg = the user's message bar,
  `brightBlue` = inline code, `brightGreen` = bullets and diff +, `brightRed` = diff -, bold = headings/strong, italic
  = emphasis/quotes, H1 = bold+italic+underline.
- Four palettes, `XTERM_DARK`, `XTERM_LIGHT`, `XTERM_CLAUDE_DARK` (warm greys, ivory `brightWhite`, clay cursor,
  `brightBlack` `#30302e`) and `XTERM_CLAUDE_LIGHT` (warm near-black, `brightBlack` `#ede9de`); `xtermTheme()` picks one and `applyTheme()` restyles every open
  terminal live. Keep `white` mid-grey (hierarchy) and `brightBlack` a quiet message bar one step off `--background`:
  `#262626` in dark, `#ebebeb` in light. `brightWhite` is the strongest text, so it is `#ffffff` in dark and `#000000`
  in light (the bar's text). If the background moves, move `brightBlack` with it. `minimumContrastRatio: 3` keeps
  PowerShell's brightBlack flags readable, and in light also darkens any color Claude Code emits for a dark background.
- Claude Code has its own theme (`/theme`); the app can't set it. In light, users should pick a light Claude theme.
- The terminal background **is** `--background`: `background` and `cursorAccent` are read from the CSS variable
  (`cssVar()` in renderer.js) whenever the theme is applied.

## 6. Sync points (literals that can't read CSS)

- `src/main.js`: `CHROME` = `{ dark: { bg: '#0a0a0a', symbol: '#a1a1a1' }, light: { bg: '#ffffff', symbol: '#525252' }, 'claude-dark': { bg: '#262624', symbol: '#c2c0b6' }, 'claude-light': { bg: '#faf9f5', symbol: '#5e5d59' } }`,
  used for `backgroundColor` and `titleBarOverlay` at creation and by `applyChrome()` (`setBackgroundColor` +
  `setTitleBarOverlay`, Windows only) whenever the theme resolves differently. They paint before CSS loads and the
  window controls sit on the top bar: keep `bg` equal to each theme's `--background`. `titleBarOverlay.height` is 39, one
  less than the 40 px top row, so the overlay doesn't paint over the bar's 1 px `border-bottom`.
- `XTERM_DARK.brightBlack` / `XTERM_LIGHT.brightBlack` / `XTERM_CLAUDE_*.brightBlack` (renderer.js) are tuned against each `--background` (see section 5).
- `THEMES` / `ACCENTS` in main.js (validation) and renderer.js (settings page) list the same ids as styles.css.
- `assets/icon-source.png` (1024 px master) → `assets/icon.png` (512 px, renderer and Windows toasts), `assets/icon.ico` (PNG frames: 16, 24, 32, 48, 64, 128, 256 px, Windows window/taskbar/shortcuts/package; the white mark is scaled 1.12x inside the same tile, keeping its margin ratios, so it matches the size of neighbouring taskbar icons such as Windows Terminal's) and `assets/icon-mac.png` (tile at 824 px centred on 1024, macOS window and package). Outside the rounded tile is transparent. Replace derived assets together; the old code generator has been removed.
