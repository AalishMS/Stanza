/* Right sidebar of the mock: context meter, MCP servers, subagents, running servers, images. */
(function (S) {
  'use strict';

  const ICONS = S.icons;
  const state = S.model.state;

  /* The context tile of each Claude tab (1M window: every model in the mock is a 1M one). */
  const CONTEXT = {
    main: ['6%', '62k / 1M'],
    'main-working': ['14%', '144k / 1M'],
    'needs-input': ['22%', '221k / 1M'],
    panel: ['31%', '312k / 1M'],
  };

  const MCPS = ['claude.ai Claude Docs', 'claude.ai Gmail', 'playwright', 'chrome-devtools', 'supabase'];

  const STATUS_ICON = {
    running: '<span class="w-1.5 h-1.5 rounded-full shrink-0 dot-working-pulse" style="background: var(--dot-amber);"></span>',
    done: `<span class="shrink-0 -ml-[2px]" style="color: var(--dot-green);">${ICONS.check}</span>`,
    idle: '<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: var(--text-muted);"></span>',
  };

  /* A collapsible section; key is its state.collapsedRight entry. */
  function section(ctx, key, title, count, body) {
    const collapsed = ctx.live && state.collapsedRight[key];
    return `
      <div class="px-3.5 py-2.5">
        <div data-act="toggleRightSection" data-arg="${key}" class="flex items-center justify-between text-[11px] mb-1.5 cursor-pointer">
          <span class="flex items-center gap-1 font-medium" style="color: var(--text-secondary);">
            ${collapsed ? ICONS.chevronRight : ICONS.chevronDown}
            <span>${title}</span>
          </span>
          <span class="text-[10.5px]" style="color: var(--text-muted);">${count}</span>
        </div>
        ${collapsed ? '' : body}
      </div>
    `;
  }

  function rightSidebar(screen, ctx) {
    const meta = S.model.screenOf(screen);
    if (meta.kind === 'split') return ''; // the app hides it while a split pane is narrow (autoRside)
    if (ctx.live && !state.rightSidebarOpen) return '';
    if (screen === 'markdown') return S.mock.markdownSidebar(ctx);

    const isClaude = meta.kind === 'claude';
    const noProject = meta.kind === 'home' || meta.kind === 'settings';
    const [contextPct, contextTokens] = CONTEXT[screen] || [];

    const contextSection = isClaude ? `
      <div class="px-3.5 pt-2.5 pb-3 border-b" style="border-color: var(--border-color);">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-medium" style="color: var(--text-secondary);">Context</span>
          <span class="mono text-[10.5px]" style="color: var(--text-muted);">${contextTokens}</span>
        </div>
        <div class="text-[16px] font-bold mt-0.5 tracking-tight" style="color: var(--text-primary);">${contextPct}</div>
        <div class="w-full h-[4px] rounded-full mt-1.5 overflow-hidden" style="background: var(--track-bg);">
          <div class="h-full rounded-full transition-all duration-500" style="width: ${contextPct}; background: var(--accent-violet);"></div>
        </div>
      </div>
    ` : '';

    const mcpSection = section(ctx, screen === 'panel' ? 'mcpsPanel' : 'mcps', 'MCPs', '5/13', `
      ${noProject ? `<div class="text-[11px] mb-2" style="color: var(--text-muted);">User-level servers, no project selected.</div>` : ''}
      <div class="space-y-1.5 mt-1">
        ${MCPS.map(name => `
          <div class="flex items-center justify-between text-[11.5px]">
            <span class="flex items-center gap-2 truncate" style="color: var(--text-primary);">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: var(--dot-green);"></span>
              <span class="truncate">${name}</span>
            </span>
            <span class="text-[10.5px] shrink-0 ml-2" style="color: var(--text-connected);">connected</span>
          </div>
        `).join('')}
        <div class="pl-3.5 pt-0.5 text-[11px] cursor-pointer hover:underline" style="color: var(--text-muted);">Show 8 more</div>
      </div>
    `);

    const agents = S.mock.subagentRows(screen);
    const runningCount = agents.filter(agent => agent.status === 'running').length;
    const subagentSection = section(ctx, 'subagents', 'Subagents', runningCount || agents.length, `
      <div class="space-y-0.5 -mx-1.5">
        ${agents.map(agent => `
          <div data-act="openAgent" data-arg="${agent.id}" class="flex items-center justify-between gap-2 px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer stanza-row-hover" title="Show its prompt">
            <span class="flex items-center gap-2 min-w-0" style="color: var(--text-primary);">
              ${STATUS_ICON[agent.status]}
              <span class="truncate">${agent.type}${agent.desc ? `<span style="color: var(--text-muted);"> · ${agent.desc}</span>` : ''}</span>
            </span>
            <span class="mono text-[10.5px] shrink-0" style="color: var(--text-muted);">${agent.model.split(' ')[0]}</span>
          </div>
        `).join('')}
      </div>
    `);

    // The Terminal tab's Vite server, owned by that tab. Click copies its URL, like the app.
    const viteUp = screen === 'terminal' && (!ctx.live || state.viteRunning);
    const runningSection = section(ctx, 'running', 'Running', viteUp ? 1 : '', viteUp ? `
      <div data-act="copyPort" class="-mx-1.5 px-1.5 py-[3px] flex items-center justify-between rounded-md text-[11.5px] cursor-pointer stanza-row-hover" title="Click to copy http://localhost:5173">
        <span class="flex items-center gap-2" style="color: var(--text-primary);">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: var(--dot-green);"></span>
          <span>vite</span>
        </span>
        ${ctx.live && state.copiedPort
          ? `<span class="flex items-center gap-1 text-[10.5px]" style="color: var(--text-connected);">${ICONS.check} Copied</span>`
          : `<span class="mono text-[10.5px]" style="color: var(--text-muted);">5173</span>`}
      </div>
    ` : `
      <div class="text-[11px]" style="color: var(--text-muted);">${noProject ? 'Nothing running.' : 'Nothing running in this session.'}</div>
    `);

    const images = screen === 'panel' ? S.mock.images : [];
    const imageSection = isClaude ? section(ctx, 'images', 'Images', images.length || '', images.length ? `
      <div class="grid grid-cols-2 gap-1.5">
        ${images.map(image => `
          <div data-act="openImage" data-arg="${image.id}" class="relative aspect-[16/10] rounded-md overflow-hidden border cursor-pointer transition-opacity hover:opacity-85" style="border-color: var(--border-card);" title="${image.source}">
            ${image.html}
            <span class="absolute left-1 bottom-1 px-1 rounded text-[9.5px] font-semibold" style="background: rgba(0, 0, 0, 0.65); color: #fafafa;">${image.label}</span>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="text-[11px]" style="color: var(--text-muted);">No images in this session.</div>
    `) : '';

    return `
      <aside class="w-[238px] shrink-0 border-l flex flex-col select-none overflow-y-auto" style="background: var(--bg-right); border-color: var(--border-color);">
        ${contextSection}
        ${mcpSection}
        ${subagentSection}
        ${runningSection}
        ${noProject ? '' : section(ctx, 'docs', 'Docs', '1', `
          <button type="button" data-act="openDoc" class="mock-doc-row">README.md</button>
        `)}
        ${imageSection}
      </aside>
    `;
  }

  S.mock.rightSidebar = rightSidebar;
})(window.Stanza);
