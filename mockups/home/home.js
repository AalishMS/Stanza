'use strict';

(() => {
  const concept = document.body.dataset.concept;
  const params = new URLSearchParams(location.search);
  const IS_MAC = params.get('platform') === 'mac' || (!params.has('platform') && /Mac/i.test(navigator.platform));
  const kbd = (s) => IS_MAC ? s.replaceAll('Ctrl+', '⌘').replaceAll('Shift+', '⇧') : s;
  const themes = ['dark', 'light', 'claude-dark', 'claude-light'];
  document.documentElement.dataset.theme = themes.includes(params.get('theme')) ? params.get('theme') : 'dark';

  const icons = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3Z"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 18-4Z"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-4h5a7 7 0 0 0 7-5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    terminal: '<path d="m5 7 5 5-5 5m8 0h6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rootPath = IS_MAC ? '~/Projects/' : 'E:\\pet_project\\';
  const projects = [
    { name: 'Claude Terminal', path: 'Claude Terminal', branch: 'main', changes: 6, when: '12 min ago', kind: 'terminal' },
    { name: 'tech_explainers', path: 'tech_explainers', branch: 'manager-ui-redesign', changes: 44, when: '1 hour ago' },
    { name: 'Youtuber', path: 'Youtuber', branch: '', changes: 0, when: 'Yesterday' },
    { name: 'QCT', path: 'QCT', branch: 'refactor/modular-structure', changes: 1, when: 'Yesterday' },
    { name: 'gymapp-offline', path: IS_MAC ? 'OpenGym/gymapp-offline' : 'OpenGym\\gymapp-offline', branch: 'main', changes: 17, when: '2 days ago' },
    { name: 'Chats', path: IS_MAC ? '~/Claude Chats' : 'C:\\Users\\Aalish\\Claude Chats', branch: null, changes: 0, when: '3 days ago', kind: 'chat' },
    { name: 'Portfolio', path: 'Portfolio', branch: 'main', changes: 0, when: '4 days ago' },
    { name: 'Notes', path: 'Notes', branch: 'main', changes: 0, when: '5 days ago' },
    { name: 'Reading list', path: 'reading-list', branch: 'main', changes: 2, when: 'Last week' },
    { name: 'Design tools', path: 'design-tools', branch: 'main', changes: 0, when: 'Last week' },
    { name: 'Experiments', path: 'experiments', branch: 'main', changes: 0, when: 'Last week' },
    { name: 'Archive', path: 'archive', branch: '', changes: 0, when: 'Last month' },
  ];
  const fullPath = (p) => p.kind === 'chat' || p.custom ? p.path : rootPath + p.path;
  const descriptions = {
    workbench: ['Workbench', 'My pick', 'A clear route back into your work. Projects first; activity stays in the margin.'],
    library: ['Project library', 'Explore', 'A little more room for every project. Best when you recognize folders visually.'],
    launcher: ['Launcher', 'Compact', 'One small starting point. Search, choose a project, and get straight to the terminal.'],
  };
  const links = [ ['workbench', '01-workbench.html', 'Workbench'], ['library', '02-library.html', 'Project library'], ['launcher', '03-launcher.html', 'Launcher'] ];
  const controls = `<div class="prototype-bar"><div class="prototype-label">Home explorations</div><nav aria-label="Design directions">${links.map(([id, href, label]) => `<a href="${href}" data-concept-link ${id === concept ? 'aria-current="page"' : ''}>${label}${id === 'workbench' ? '<span class="pick-mark" title="Recommended">✳</span>' : ''}</a>`).join('')}</nav><div class="preview-controls"><label><span class="sr-only">Theme</span><select id="theme">${themes.map((t) => `<option value="${t}" ${t === document.documentElement.dataset.theme ? 'selected' : ''}>${{ dark: 'Dark', light: 'Light', 'claude-dark': 'Claude dark', 'claude-light': 'Claude light' }[t]}</option>`).join('')}</select></label><label><span class="sr-only">Platform preview</span><select id="platform"><option value="windows" ${!IS_MAC ? 'selected' : ''}>Windows</option><option value="mac" ${IS_MAC ? 'selected' : ''}>macOS</option></select></label></div></div>`;
  const brand = `<header class="app-bar"><a class="brand" href="index.html" aria-label="Stanza home"><img src="../../assets/icon.png" alt="" width="24" height="24">Stanza</a><span class="crumb">/</span><span class="crumb-label">Home</span><span class="app-bar-end">Your local workspace</span></header>`;
  const shortcuts = `<footer class="shortcuts"><span><kbd>${kbd('Ctrl+T')}</kbd> New session</span><span><kbd>Ctrl+Tab</kbd> Switch session</span><span><kbd>${kbd('Ctrl+S')}</kbd> Sidebar</span><span><kbd>${kbd('Ctrl+,')}</kbd> Settings</span></footer>`;
  const heading = (title, sub) => `<header class="page-heading"><div><p class="greeting">Good afternoon, Aalish</p><h1>${title}</h1><p class="subtitle">${sub}</p></div><span class="today">Wednesday, October 21</span></header>`;
  const search = `<label class="search">${icon('search')}<input id="project-search" type="search" autocomplete="off" placeholder="Find a project…" aria-label="Find a project"><span id="search-count" class="search-count">12 projects</span></label>`;
  const projectSection = `<section class="project-section" aria-labelledby="projects-title"><div class="section-head"><h2 id="projects-title">Projects <span id="project-total">12</span></h2><button class="btn ghost sm" data-add>${icon('plus')} Add project</button></div>${search}<div id="project-list" class="project-list"></div><button class="show-more btn ghost" id="show-more">Show 6 more projects ${icon('chevron')}</button><p class="list-caption">Choose a project to start a new Claude session.</p></section>`;
  const resume = `<section class="resume" aria-label="Continue last conversation"><div class="resume-icon">${icon('terminal')}</div><div class="resume-copy"><p class="resume-eyebrow">Last conversation <span>· 12 min ago</span></p><h2>Refine the home screen</h2><p>Claude Terminal <span>· main</span></p></div><button class="btn outline resume-button" data-resume>Continue ${icon('arrow')}</button></section>`;

  const stats = `<div class="stat-grid"><div><strong>331</strong><span>Sessions</span><small>19 active days</small></div><div><strong>63.7K</strong><span>Messages</span><small>18.4K tool calls</small></div><div><strong>4.7B</strong><span>Tokens</span><small>Mostly Opus 5.5</small></div><div><strong>11 <em>days</em></strong><span>Current streak</span><small>Best streak: 11 days</small></div></div>`;
  function heatmap() {
    const end = new Date('2026-10-21T12:00:00Z');
    const cells = Array.from({ length: 126 }, (_, i) => {
      const date = new Date(end);
      date.setUTCDate(date.getUTCDate() - (125 - i));
      const level = i < 64 ? 0 : i > 96 ? [0, 3, 1, 4, 2, 0, 4][i % 7] : i % 13 === 0 ? 2 : i % 19 === 0 ? 3 : 0;
      const label = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${[0, 12, 46, 108, 240][level]} messages`;
      return `<span class="day level-${level}" title="${label}" ${i === 125 ? 'data-today' : ''}></span>`;
    }).join('');
    return `<div class="calendar" role="img" aria-label="Sample messages per day over 18 weeks, with more activity in October"><div class="months"><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div><div class="heatmap">${cells}</div><div class="heatmap-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((n) => `<span class="day level-${n}"></span>`).join('')}<span>More</span></div></div>`;
  }
  const activity = `<section class="activity" aria-labelledby="activity-title"><div class="section-head"><h2 id="activity-title">Your activity</h2><span class="section-meta">Since Aug 21</span></div>${stats}${heatmap()}<p class="activity-foot">Busiest around 8 PM <span>Updated Oct 21</span></p></section>`;
  const meter = (label, reset, percent) => `<div class="usage-row"><div><span>${label}</span><strong>${percent}<small>%</small></strong></div><div class="meter" role="meter" aria-label="${label} usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><p>${reset}</p></div>`;
  const usage = `<section class="usage" aria-labelledby="usage-title"><div class="section-head"><h2 id="usage-title">Plan usage</h2><span class="section-meta">Claude</span></div>${meter('Session', 'Resets today at 4 PM', 34)}${meter('Weekly', 'Resets Monday', 61)}</section>`;
  const aside = `<aside class="insights">${activity}${usage}</aside>`;
  let content;
  if (concept === 'workbench') {
    content = `${heading('Back to your work.', 'Pick up a conversation or start something new.')}<div class="workbench-grid"><div class="primary-column">${resume}${projectSection}</div>${aside}</div>`;
  } else if (concept === 'library') {
    content = `${heading('A place for every project.', 'Open a project. Give the next idea a little room.')}<div class="library-top">${resume}${meter('Session usage', 'Resets today at 4 PM', 34)}${meter('Weekly usage', 'Resets Monday', 61)}</div>${projectSection}<section class="library-activity">${activity}</section>`;
  } else {
    content = `<header class="launcher-heading"><img src="../../assets/icon.png" alt="" width="46" height="46"><p class="greeting">Good afternoon, Aalish</p><h1>Where are we working?</h1><p class="subtitle">A project, a conversation, a fresh start.</p></header><div class="launcher-layout"><div class="launcher-main">${projectSection}<div class="launcher-resume">${resume}</div></div><aside class="launcher-summary">${usage}<details><summary>Activity <span>11-day streak ${icon('chevron')}</span></summary>${stats}${heatmap()}<p class="section-meta">Sample data · Updated Oct 21</p></details></aside></div>`;
  }
  const [name, label, description] = descriptions[concept];
  document.getElementById('root').innerHTML = `${controls}<div class="app-shell">${brand}<main class="home ${concept}">${content}</main>${shortcuts}</div><div class="design-note"><p><strong>${name}</strong><span class="note-label">${label}</span>${description}</p><span>Interactive mockup · Sample data</span></div><dialog id="preview-dialog" aria-labelledby="dialog-title"></dialog>`;
  let expanded = false;
  const list = document.getElementById('project-list');
  const input = document.getElementById('project-search');
  const more = document.getElementById('show-more');
  const dialog = document.getElementById('preview-dialog');
  let returnFocus;

  function renderProjects() {
    const query = input.value.trim().toLowerCase();
    const filtered = projects.filter((p) => `${p.name} ${fullPath(p)} ${p.branch || ''}`.toLowerCase().includes(query));
    const shown = query || expanded ? filtered : filtered.slice(0, 6);
    list.innerHTML = shown.length ? shown.map((p) => `<button class="project-row" data-project="${esc(p.name)}" title="Start a new session in ${esc(fullPath(p))}"><span class="project-icon">${icon(p.kind || 'folder')}</span><span class="project-identity"><strong>${esc(p.name)}</strong><span class="project-path">${esc(fullPath(p))}</span></span><span class="project-git">${p.branch === null ? '<span class="no-git">No project needed</span>' : p.branch ? `<span class="branch" title="${esc(p.branch)}">${icon('branch')}<span>${esc(p.branch)}</span></span><span class="${p.changes ? 'changes' : 'clean'}">${p.changes ? `${p.changes} changed` : 'Working tree clean'}</span>` : '<span class="no-git">Not a git repository</span>'}</span><span class="project-time">${esc(p.when)}</span><span class="row-arrow">${icon('arrow')}</span></button>`).join('') : `<div class="empty">${icon('search')}<h3>No matching projects</h3><p>Try a different name, path, or branch.</p><button class="btn outline" id="clear-search">Clear search</button></div>`;
    more.hidden = !!query || projects.length <= 6;
    more.innerHTML = `${expanded ? 'Show fewer projects' : `Show ${projects.length - 6} more projects`} ${icon('chevron')}`;
    more.setAttribute('aria-expanded', String(expanded));
    document.getElementById('search-count').textContent = `${filtered.length} project${filtered.length === 1 ? '' : 's'}`;
    document.getElementById('project-total').textContent = String(projects.length);
  }

  function openDialog(html) {
    returnFocus = document.activeElement;
    dialog.innerHTML = `<button class="btn ghost icon dialog-close" aria-label="Close preview" data-close>${icon('close')}</button>${html}`;
    dialog.showModal();
  }
  function sessionPreview(project, resumeSession) {
    openDialog(`<div class="dialog-icon">${icon('terminal')}</div><p class="greeting">Session preview</p><h2 id="dialog-title">${resumeSession ? 'Continue the conversation' : 'Start in ' + esc(project.name)}</h2><p class="dialog-description">${resumeSession ? 'Refine the home screen' : 'A fresh Claude session in this project.'}</p><div class="terminal-preview"><div><span>Project</span><strong>${esc(project.name)}</strong></div><code>${esc(fullPath(project))}</code><p>${resumeSession ? 'Resume the last conversation' : 'New conversation'} ${icon('arrow')} Claude Code</p></div><p class="preview-disclaimer">This is an HTML mockup. No session is started and no files are changed.</p><div class="dialog-actions"><button class="btn outline" data-close>Back to home</button></div>`);
  }
  document.addEventListener('click', (e) => {
    const projectButton = e.target.closest('[data-project]');
    if (projectButton) sessionPreview(projects.find((p) => p.name === projectButton.dataset.project), false);
    if (e.target.closest('[data-resume]')) sessionPreview(projects[0], true);
    if (e.target.closest('[data-close]')) dialog.close();
    if (e.target.closest('#clear-search')) { input.value = ''; renderProjects(); input.focus(); }
    if (e.target.closest('[data-add]')) {
      openDialog(`<p class="greeting">Add a project</p><h2 id="dialog-title">Make room for something new.</h2><p class="dialog-description">Try adding a folder to the preview.</p><form id="add-form"><label class="field">Project name<input name="name" required maxlength="60" placeholder="My next project" autocomplete="off"></label><label class="field">Folder path<input name="path" required maxlength="240" placeholder="${esc(rootPath)}my-project" autocomplete="off"></label><p class="preview-disclaimer">Sample only. The app would open a folder picker. Changes last until you reload this page.</p><div class="dialog-actions"><button type="button" class="btn outline" data-close>Cancel</button><button class="btn primary" type="submit">Add project</button></div></form>`);
      dialog.querySelector('input').focus();
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-form') return;
    e.preventDefault();
    const values = new FormData(e.target);
    const name = values.get('name').trim();
    const path = values.get('path').trim();
    const nameInput = e.target.elements.namedItem('name');
    if (!name || !path || projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      nameInput.setCustomValidity('Use a unique project name and a folder path.');
      nameInput.reportValidity();
      nameInput.oninput = () => nameInput.setCustomValidity('');
      return;
    }
    projects.push({ name, path, custom: true, branch: '', changes: 0, when: 'Just added' });
    expanded = true;
    input.value = '';
    renderProjects();
    dialog.close();
  });
  dialog.addEventListener('close', () => returnFocus?.focus());
  dialog.addEventListener('click', (e) => { if (e.target === dialog && (e.offsetX < 0 || e.offsetX > dialog.clientWidth || e.offsetY < 0 || e.offsetY > dialog.clientHeight)) dialog.close(); });
  input.addEventListener('input', renderProjects);
  more.addEventListener('click', () => { expanded = !expanded; renderProjects(); });
  function updateLinks() {
    document.querySelectorAll('[data-concept-link], .brand').forEach((link) => {
      const url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('theme', document.documentElement.dataset.theme);
      url.searchParams.set('platform', IS_MAC ? 'mac' : 'windows');
      link.href = url.href;
    });
  }
  document.getElementById('theme').addEventListener('change', (e) => {
    document.documentElement.dataset.theme = e.target.value;
    params.set('theme', e.target.value);
    try { history.replaceState(null, '', `${location.pathname}?${params}`); } catch { /* file previews may disallow history changes */ }
    updateLinks();
  });
  document.getElementById('platform').addEventListener('change', (e) => {
    const url = new URL(location.href);
    url.searchParams.set('platform', e.target.value);
    location.href = url.href;
  });
  renderProjects();
  updateLinks();
})();
