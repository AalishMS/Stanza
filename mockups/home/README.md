# Stanza home explorations

Open `index.html` directly in a browser. No build, server, dependencies, or external requests are needed. The top bar switches between three separate HTML mockups; it belongs to the preview, not the proposed app UI.

| Direction | Idea | Tradeoff |
| --- | --- | --- |
| **01 · Workbench — recommended** | Continue the last conversation, then scan a flat project list. Activity and plan usage share a quiet right margin. | Best balance for daily use; less compact than the launcher. |
| 02 · Project library | A spatial index with a tile per project, usage above, and activity below. | Easy to recognize projects, but fewer fit in a short window. |
| 03 · Launcher | A narrow search-first list, a small continuation row, and expandable activity. | Fastest starting point; historical stats take an extra click. |

Workbench is the strongest fit for a terminal-first app. A single continuation action answers “where was I?” while names, paths, branches, and changed-file counts remain easy to compare. No decorative project colors, oversized statistics, gradients, or extra navigation. Search is a proposed home affordance; production keyboard bindings remain unchanged.

Try project search (including a branch name), Show more, Add project, project rows, Continue, all four themes, and Windows/macOS in the preview controls. Add project only changes the current page's sample list. Session dialogs explain the proposed outcome; they never launch Claude or touch app state. The six extra projects, conversation, timestamps, and calendar cells are illustrative. Totals and the first six projects come from the supplied reference.

The layouts adapt from 320 px upward. At smaller widths the right margin moves below projects, and the library becomes one column. Keyboard focus, native dialog Escape behavior, reduced motion, empty search, long names, and long paths are supported. The page uses the production Segoe UI/system-ui stack, with San Francisco and Menlo fallbacks on macOS. No fonts are downloaded.

`tokens.css` is a snapshot of the token section of `src/styles.css`. `home.css` and `home.js` are shared by the three documents. None of these files is packaged into the app; no production home behavior has changed.

On a Mac: open `index.html` in Safari or Chrome, check all four themes, resize to a narrow window, confirm `⌘` shortcut hints and `~/Projects` paths, and use Tab/Enter/Escape through search, project rows, and dialogs. Platform selection allows visual inspection on Windows, but cannot verify native Mac font rendering.
