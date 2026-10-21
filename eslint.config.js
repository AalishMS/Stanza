'use strict';

// Bug-catching only (undefined names, unused code, unreachable branches); no style rules.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'promo/**'] },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.js'],
    ignores: ['src/renderer.js', 'src/lib/ui.js', 'src/lib/md.js', 'site/js/**/*.js', 'mockups/**/*.js'], // globals merge across blocks: keep Node's out of browser scripts
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // Plain browser scripts loaded with <script> tags; they share one global scope (see index.html).
    // site/js is the product page's own set of them (one namespace, window.Stanza).
    files: ['src/renderer.js', 'src/lib/ui.js', 'src/lib/md.js', 'site/js/**/*.js', 'mockups/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['src/lib/ui.js', 'src/lib/md.js'],
    languageOptions: { globals: { module: 'readonly' } }, // only for the guarded module.exports at the bottom
  },
];
