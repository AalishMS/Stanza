#!/bin/bash
# Installs Stanza (macOS): clones the repo, builds the app and moves it to ~/Applications. Running it again
# updates that copy. Meant to be piped from the web:
#
#   curl -fsSL https://raw.githubusercontent.com/AalishMS/Stanza/main/scripts/install.sh | bash
#
# Clones to ~/.stanza, or to $STANZA_DIR if set. The app itself goes to ~/Applications/Stanza.app, not a link into the
# clone: Spotlight and Launchpad skip links and hidden folders like ~/.stanza. The build records the clone's path
# (package.json's stanzaRepo), so its Update button still finds it. Everything is in main(), called on the last line,
# so a download cut short runs nothing.

set -e

main() {
  REPO_URL=https://github.com/AalishMS/Stanza.git
  DIR="${STANZA_DIR:-$HOME/.stanza}"
  # An install from when the app was called Claude Bench is updated in place rather than cloned a second time.
  [ -z "$STANZA_DIR" ] && [ ! -e "$DIR" ] && [ -d "$HOME/.claude-bench/.git" ] && DIR="$HOME/.claude-bench"

  fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
  step() { printf '\n\033[36m> %s\033[0m\n' "$1"; }

  [ "$(uname)" = Darwin ] || fail "This installer is for macOS. On Windows use install.ps1 (see the README)."
  # Without the command line tools /usr/bin/git is a stub that fails (and offers to install them).
  git --version >/dev/null 2>&1 || fail "git is not installed. Run: xcode-select --install, then run this again."
  command -v node >/dev/null && command -v npm >/dev/null \
    || fail "Node.js is not installed. Install it (brew install node, or nodejs.org), then run this again."
  MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
  [ "$MAJOR" -ge 20 ] || fail "Node.js $(node -v) is too old; Stanza needs 20 or newer."
  command -v claude >/dev/null \
    || printf '\033[33mNote: the claude CLI was not found. Install it and log in before opening a session: https://claude.com/claude-code\033[0m\n'

  # The app can't be rebuilt or replaced while it runs. Matched on this install's paths, never on the name.
  TARGET="$HOME/Applications/Stanza.app"
  pgrep -f "$DIR/dist/" >/dev/null || pgrep -f "$TARGET/Contents/MacOS/" >/dev/null \
    && fail "Stanza is running from this install. Quit it and run this again."

  if [ -d "$DIR/.git" ]; then
    cd "$DIR"
    # Same as update.sh: a dirty lockfile (npm rewrites it) makes the pull abort.
    git checkout HEAD -- package-lock.json 2>/dev/null || true
    step "git pull --ff-only   ($DIR)"
    git pull --ff-only || fail "git pull failed (see above)."
  elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR")" ]; then
    fail "$DIR already exists and is not a Stanza clone. Move it away, or set STANZA_DIR to another folder."
  else
    step "git clone $REPO_URL \"$DIR\""
    git clone "$REPO_URL" "$DIR" || fail "git clone failed (see above)."
    cd "$DIR"
  fi

  step "npm install"
  npm install || fail "npm install failed (see above). Fix it, then run this again."
  # npm's allow-scripts gate can skip Electron's own download.
  [ -d node_modules/electron/dist ] || node node_modules/electron/install.js
  # node-pty's helper can lose its execute bit on install (tabs then fail with posix_spawnp failed).
  chmod +x node_modules/@lydell/node-pty-darwin-*/spawn-helper 2>/dev/null || true

  step "npm run package:mac"
  npm run package:mac || fail "The build failed (see above). Run this again to retry."

  APP=""
  for a in "$DIR"/dist/mac*/"Stanza.app"; do [ -d "$a" ] && APP="$a" && break; done
  [ -n "$APP" ] || fail "The build finished but Stanza.app was not found under $DIR/dist."

  # The link from when the app was called Claude Bench points at a bundle the build no longer makes.
  [ -L "$HOME/Applications/Claude Bench.app" ] && rm -f "$HOME/Applications/Claude Bench.app"
  # Replaces an earlier copy of Stanza or the link older installs made, never another app (same steps in update.sh).
  ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET/Contents/Info.plist" 2>/dev/null || true)
  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ] && [ "$ID" != com.local.stanza ]; then
    printf '\033[33m%s is another app; left it alone. Open Stanza from %s\033[0m\n' "$TARGET" "$APP"
  else
    mkdir -p "$HOME/Applications" && rm -rf "$TARGET.new" && mv "$APP" "$TARGET.new" \
      && rm -rf "$TARGET" && mv "$TARGET.new" "$TARGET" \
      || fail "Could not move Stanza.app to ~/Applications (see above). Run this again to retry."
    APP="$TARGET"
  fi

  printf '\n\033[32mStanza is installed in %s\033[0m\n' "$APP"
  echo "Find it with Spotlight or in ~/Applications (drag it to the Dock to keep it). It updates itself from the Update button; running this command again does the same."
  echo "To uninstall, delete $DIR and $APP."
  open "$APP"
}

main
