#!/bin/bash
# Updates a built copy of Stanza (macOS). Started by the app's Update button, which then quits, because the
# app can't be rebuilt while it runs. Runs from a temp copy, since git pull may rewrite this file. Output goes to a log,
# which opens in TextEdit if something fails.
#
#   update.sh <checkout> <app pid> <path to Stanza.app> <log file>

REPO="$1"; APP_PID="$2"; APP="$3"; LOG="$4"
exec >"$LOG" 2>&1

finish() {
  if [ -n "$1" ]; then echo; echo "$1"; open -t "$LOG"; fi
  [ -d "$APP" ] && open "$APP"
  exit $([ -n "$1" ] && echo 1 || echo 0)
}

echo "Waiting for Stanza to close..."
for _ in $(seq 1 40); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done
# A copy that never exits would keep the build locked and block the reopen: end it (its own pid only).
if kill -0 "$APP_PID" 2>/dev/null; then
  echo "Stanza did not exit; ending it..."
  kill -9 "$APP_PID" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done
fi
kill -0 "$APP_PID" 2>/dev/null && finish "Stanza is still running. Close it, then run git pull and npm run package:mac in the repo folder."

cd "$REPO" || finish "Repo folder not found: $REPO"

# npm install rewrites the lockfile, and a dirty one makes the pull abort. It is generated, so drop local changes
# (from HEAD, so a staged copy goes too).
git checkout HEAD -- package-lock.json 2>/dev/null

echo "> git pull --ff-only"
git pull --ff-only || finish "git pull failed (see above). Nothing was changed; reopening the app."

# Always, not only when package(-lock).json changed: an npm install that failed in an earlier update would never be
# retried (HEAD has moved on), and the build would pack stale node_modules. It takes seconds when nothing changed.
echo "> npm install"
npm install || finish "npm install failed (see above). Run it in the repo folder, then npm run package:mac."

echo "> npm run package:mac"
npm run package:mac || finish "The build failed (see above). Run npm run package:mac in the repo folder to retry."

# The build lands in dist/. An app outside the clone (install.sh's ~/Applications/Stanza.app) gets it moved over it;
# the link older installs made in ~/Applications is replaced by the app itself, so Spotlight finds it. An app run
# from dist/ was rebuilt in place.
BUILT=""
for a in "$REPO"/dist/mac*/Stanza.app; do [ -d "$a" ] && BUILT="$a" && break; done
[ -n "$BUILT" ] || finish "The build finished but Stanza.app was not found under $REPO/dist."
LINK="$HOME/Applications/Stanza.app"
TARGET=""
case "$APP" in
  "$REPO/dist/"*) [ -L "$LINK" ] && case "$(readlink "$LINK")" in "$REPO/dist/"*) TARGET="$LINK" ;; esac ;;
  *) TARGET="$APP" ;;
esac
if [ -n "$TARGET" ]; then
  # Same check as install.sh: never replace another app.
  ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET/Contents/Info.plist" 2>/dev/null)
  [ -L "$TARGET" ] || [ "$ID" = com.local.stanza ] || finish "$TARGET is not Stanza; left it alone. The new build is in $BUILT."
  echo "> move the build to $TARGET"
  rm -rf "$TARGET.new" && mv "$BUILT" "$TARGET.new" && rm -rf "$TARGET" && mv "$TARGET.new" "$TARGET" \
    || finish "Could not move the new build to $TARGET (see above). Run the installer again to fix it."
  APP="$TARGET"
fi

echo "Updated."
finish ""
