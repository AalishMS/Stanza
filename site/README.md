# Stanza product page

Dark only, like the app's default. A full-screen hero with the logo's S, the live
window in its own section and a pinned, scrolling feature tour. Static, no build step: serve this folder (`npx serve site` or `python -m http.server`) or open
`index.html`. No third-party requests (system fonts, no CDN). Not part of the packaged app.

```
index.html          the page (all copy lives here; claims come from the repo's README and AGENTS.md)
assets/             icon.png, og.png (social preview, still the old page's)
css/
  base.css          tokens, reset, type, code/kbd, the install "term", the switch
  page.css          nav, hero, mock windows, tour, facts, install, FAQ, footer, narrow screens
  mock.css          the mock app's tokens (matched to src/styles.css), scoped reset, animations
  tailwind.css      GENERATED from js/mock/ (see below)
js/                 plain scripts sharing one namespace, window.Stanza (load order is in index.html)
  boot.js           in <head>: picks the visitor's OS
  util.js, model.js namespace, helpers; hero screens, accents and the mock's state
  mock/             the app's UI as markup (the accent list reads model.js): build.js (frame), sidebars,
                    overlays.js (subagent dialog, image lightbox, "Needs input" toast, and their data), screens/
                    (one file per screen: session, split, terminal, needs-input, panel, markdown, home, settings)
  page/             look (mock theme, accent, text size), install (OS switch, copy), windows (scale/crop),
                    hero (live window), tour (pinned stage), actions (clicks in the mock), ticker,
                    fx (hero mark parallax, nav backdrop, fade-ins)
  main.js           starts everything
tailwind/           config used to generate css/tailwind.css
```

## How it works

`mock/` renders the app's screens as HTML strings at a fixed 1280x700; `page/windows.js` scales and crops them
(`data-crop="x,y,w,h"`). The hero is copy plus the logo's S (inline SVG, drawn from `assets/icon-source.png`'s
geometry; its cursor uses `--accent-mark`). The live window (`#hero-window`) is the `#demo` section after it, sized so
it fits the viewport whole: clicks inside it carry `data-act` / `data-arg` and `page/actions.js` maps them to state
changes. Other windows (`data-screen`) are frozen pictures, except the settings controls of `data-editable` ones.

`model.js` lists the screen switch's tabs (`TABS`) and what each screen is (`SCREENS`: kind, status bar, git line,
model), which `build.js` reads. The live window also takes input: the split's divider drags (`data-drag="split"`,
saved as `state.splitRatio` on release), the Terminal tab's prompt runs Vite's keys and a few canned PowerShell
commands (`S.mock.shell` in `screens/terminal.js`), and the permission prompt on Needs input answers to clicks or to
↑/↓/Enter/Esc while the window has focus (`#hero-window` has `tabindex="-1"`). Picking a tab in the switch replays its
screen (prompt, toast, dialog reset). The Markdown tab opens a widened reader; its pencil toggles a raw-text editor.
Demo edits stay in memory until reload, and the preview handles the sample's headings, lists and quotes. The desktop
app uses its own full Markdown parser and autosaves to disk. Docs rows in the session panel open this demo too. All screen images are inline SVG or `assets/icon.png`, so there are still no
requests.

The tour has two copies of each picture. On wide, tall screens (`min-width: 901px and min-height: 640px`, with JS) the
section pins a stage: `page/tour.js` turns the scroll position inside `.tour` into the active step (caption, pill with
its progress bar, uncropped `.tour__frame`) and moves the spotlight to that frame's `data-focus` rect (mock px). Below
860 px of height the caption sits beside the window instead of above it. Elsewhere each step shows its own cropped
`.tour__inline` window (CSS only).

## Deploy

`.github/workflows/pages.yml` publishes this folder to GitHub Pages (https://aalishms.github.io/Stanza/) on every
push to `main` that touches `site/` or the install scripts (or by hand from the Actions tab). It copies
`scripts/install.ps1` and `install.sh` to the site's root, which is what the page's short install commands fetch, and
leaves out `tailwind/` and this README. Pages' source in the repo settings must be "GitHub Actions". All paths are
relative, so the `/Stanza/` subpath needs nothing.

## Regenerating `css/tailwind.css`

Run after adding or changing a class in `js/mock/`:

```
cd site/tailwind
npx tailwindcss@3 -c tailwind.config.js -i input.css -o ../css/tailwind.css --minify
```
