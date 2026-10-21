/* What the live demo can show and the state it keeps: screens, accents and the mock's own UI state. */
(function (S) {
  'use strict';

  /* The screen switch above the live window. A second screen is the tab's working/idle twin. */
  const TABS = [
    { label: 'Session', screens: ['main', 'main-working'] },
    { label: 'Split view', screens: ['split-working', 'split'] },
    { label: 'Terminal', screens: ['terminal'] },
    { label: 'Needs input', screens: ['needs-input'] },
    { label: 'Side panel', screens: ['panel'] },
    { label: 'Markdown', screens: ['markdown'] },
    { label: 'Projects', screens: ['new-menu', 'home'] },
    { label: 'Settings', screens: ['settings-appearance', 'settings-shortcuts'] },
  ];

  /* The status bar's left side for a tab of each project. */
  const GIT = {
    claude: { branch: 'main', changed: '6 changed', path: 'E:\\pet_project\\Claude Terminal' },
    gym: { branch: 'feat/ai-coach', changed: '2 changed', path: 'E:\\pet_project\\OpenGym\\gymapp-offline' },
    hot: { none: 'not a git repository', path: 'E:\\pet_project\\Hot garbage' },
  };

  /* What each screen is. kind: claude | shell | split | home | settings. status = the sidebar footer's dot and text,
     sessions = the status bar's count, git = the project of the active tab, model = the Claude tab's model. */
  const IDLE = { status: ['muted', '0 running'], sessions: '0 sessions running' };
  const SCREENS = {
    home: { kind: 'home', ...IDLE },
    'new-menu': { kind: 'home', ...IDLE },
    'settings-appearance': { kind: 'settings', ...IDLE, usage: '9%' },
    'settings-shortcuts': { kind: 'settings', ...IDLE, usage: '9%' },
    main: { kind: 'claude', status: ['green', '1 running'], sessions: '1 session running', git: GIT.claude, model: 'Haiku 5.5' },
    markdown: { kind: 'claude', status: ['green', '1 running'], sessions: '1 session running', git: GIT.claude, model: 'Haiku 5.5' },
    'main-working': { kind: 'claude', status: ['amber', '2 working'], sessions: '3 sessions running', git: GIT.claude, model: 'Haiku 5.5' },
    split: { kind: 'split', status: ['green', '2 running'], sessions: '2 sessions running', git: GIT.claude, gitAlt: GIT.gym, model: 'Haiku 5.5' },
    'split-working': { kind: 'split', status: ['amber', '2 working'], sessions: '2 sessions running', git: GIT.claude, gitAlt: GIT.gym, model: 'Haiku 5.5' },
    terminal: { kind: 'shell', status: ['green', '1 running'], sessions: '1 session running', git: GIT.hot },
    'needs-input': { kind: 'claude', status: ['green', '1 running'], sessions: '1 session running', git: GIT.gym, model: 'Sonnet 5.5' },
    panel: { kind: 'claude', status: ['amber', '1 working'], sessions: '1 session running', git: GIT.claude, model: 'Opus 5.5' },
  };

  /* The app's own accent hues (--hue-* in src/styles.css). */
  const ACCENTS = { blue: '#2850a5', violet: '#6b4fc8', teal: '#12776f', rose: '#b8336a' };

  const AUTO_MODES = ['▸▸ auto mode on', '▸▸ plan mode on', '▸▸ ask before edits'];
  const SPINNER_FRAMES = ['✻', '✢', '✳', '✶', '✹', '✵'];
  /* The tail of each "working" counter line, keyed like state.counters. */
  const COUNTER_NOTES = {
    main: 'thinking with high effort',
    split1: 'thought for 3s',
    split2: 'thinking with high effort',
    panel: '3 agents running',
  };

  const state = {
    activeView: 'main',
    theme: 'dark', // the mock's theme; the page itself is always dark
    accentKey: 'blue',
    fontSizePx: 14,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    searchQuery: '',
    docEditing: false,
    docText: null,
    collapsedFolders: { chats: true, claude: false, gym: false, hot: false },
    collapsedRight: { mcps: false, mcpsPanel: true, subagents: false, running: false, images: false },
    focusedSplitPane: 0,
    splitRatio: 50, // the split's divider, % of the terminal area
    autoModeIndex: 0,
    recordingShortcutId: null,
    customPromptHistory: [],
    // Per-screen bits, reset by S.hero.show() when the screen changes
    dialog: null, // { kind: 'agent' | 'image', id }
    promptCursor: 0, // the permission prompt's highlighted option
    promptAnswer: null, // the option it was answered with
    toastDismissed: false,
    toastSeen: false, // it slid in already
    copiedPort: false,
    // The Terminal tab: Vite in the foreground until "q"
    viteRunning: true,
    shellLog: [],
    shellCleared: false,
    spinnerIdx: 0,
    counters: {
      main: { sec: 26, tokens: 2.7 },
      split1: { sec: 14, tokens: 1.4 },
      split2: { sec: 13, tokens: 1.1 },
      panel: { sec: 72, tokens: 6.4 },
    },
  };

  S.model = {
    TABS,
    SCREENS,
    ACCENTS,
    state,

    tabIndexOf: screen => TABS.findIndex(tab => tab.screens.includes(screen)),
    screenOf: screen => SCREENS[screen] || SCREENS.home,

    autoModeText: () => AUTO_MODES[state.autoModeIndex] || AUTO_MODES[0],
    cycleAutoMode: () => { state.autoModeIndex = (state.autoModeIndex + 1) % AUTO_MODES.length; },

    spinnerText: label => `${SPINNER_FRAMES[state.spinnerIdx % SPINNER_FRAMES.length]} ${label}…`,
    advanceSpinner: () => { state.spinnerIdx = (state.spinnerIdx + 1) % SPINNER_FRAMES.length; },

    counterText: key => {
      const { sec, tokens } = state.counters[key];
      const time = sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
      return ` (${time} · ↓ ${tokens.toFixed(1)}k tokens · ${COUNTER_NOTES[key]})`;
    },
    advanceCounters: () => {
      Object.entries(state.counters).forEach(([key, counter]) => {
        counter.sec = key === 'panel' ? counter.sec + 1 : (counter.sec % 59) + 1;
        counter.tokens = +(counter.tokens + 0.1).toFixed(1);
      });
    },
  };
})(window.Stanza);
