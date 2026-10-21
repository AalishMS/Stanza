/* A local, in-memory Markdown demo. No visitor edits are written to disk.
   The small preview handles the sample's formatting; the desktop app has its own full GFM reader. */
(function (S) {
  'use strict';

  const SAMPLE = `# A reader beside your session

Keep the plan in view while Claude works.

## Open a document

- Ctrl+click a Markdown path in the terminal.
- Or choose a file from the sidebar's Docs section.
- Switch between files with the pill below.

## Make a quick edit

Use the pencil to edit the raw Markdown. The app saves as you type.

> Try editing this document in the demo. Changes stay here until you reload.

## Keep your place

Each project keeps its own open documents. The preview updates when the file changes.`;

  function preview(text) {
    return text.split('\n').map(line => {
      const safe = S.esc(line);
      if (line.startsWith('# ')) return `<h1>${S.esc(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2>${S.esc(line.slice(3))}</h2>`;
      if (line.startsWith('- ')) return `<p class="mock-doc-bullet">• ${S.esc(line.slice(2))}</p>`;
      if (line.startsWith('> ')) return `<blockquote>${S.esc(line.slice(2))}</blockquote>`;
      return line ? `<p>${safe}</p>` : '';
    }).join('');
  }

  function markdownSidebar(ctx) {
    const editing = ctx.live && S.model.state.docEditing;
    const text = ctx.live ? (S.model.state.docText ?? SAMPLE) : SAMPLE;
    const pencil = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';
    return `<aside class="mock-doc" aria-label="Markdown document">
      <header class="mock-doc-head"><span>README.md</span>
        <button type="button" data-act="toggleDocEdit" aria-label="${editing ? 'Preview Markdown' : 'Edit Markdown'}" title="${editing ? 'Preview Markdown' : 'Edit Markdown'}">${editing ? S.icons.check : pencil}</button>
      </header>
      <div class="mock-doc-path">Stanza / README.md</div>
      ${editing
        ? `<textarea class="mock-doc-editor" data-field="markdown" aria-label="Markdown source" spellcheck="false">${S.esc(text)}</textarea>`
        : `<div class="mock-doc-page">${preview(text)}</div>`}
      <div class="mock-doc-note">${editing ? 'Demo edits stay in this page. The app autosaves to your file.' : 'Live preview in the app · Try the pencil to edit'}</div>
      <nav class="mock-doc-tabs" aria-label="Sidebar tabs">
        <button type="button" data-act="selectView" data-arg="main">${S.icons.sidebarRight}<span>Session</span></button>
        <button type="button" aria-current="page">README.md</button>
      </nav>
    </aside>`;
  }

  S.mock.screens.markdown = () => `<main class="mock-doc-session">
    <p class="mock-doc-prompt">&gt; Write a short README for the built-in Markdown reader.</p>
    <p>● Write(README.md)</p>
    <p class="mock-doc-output">⎿ &nbsp; Wrote README.md</p>
    <p>● The README is ready. Open it beside this session to read through the plan or make a quick edit.</p>
    <button type="button" data-act="openDoc" class="mock-doc-link">README.md</button>
    <p class="mock-doc-output">In the app, Ctrl+click a .md path or choose it from Docs.</p>
  </main>`;
  S.mock.markdownSidebar = markdownSidebar;
})(window.Stanza);
