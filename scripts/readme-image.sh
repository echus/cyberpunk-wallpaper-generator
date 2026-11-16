#!/usr/bin/env bash
# Makes examples/preview.jpg, the picture of the app in the README.
# It serves the repo, takes a screenshot of scripts/readme-image.html in headless Chrome
# and saves it as a JPEG. Needs macOS (Google Chrome and sips).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-8791}"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
work="$(mktemp -d)"

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill "$server"; wait "$server" 2>/dev/null || true; rm -rf "$work"' EXIT

for _ in $(seq 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.1
done

png="$work/preview.png"
for try in 1 2 3; do
  # A new browser profile each time, so a saved panel position does not move the panel.
  "$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$work/profile-$try" \
    --hide-scrollbars --force-device-scale-factor=2 --window-size=1337,672 \
    --virtual-time-budget=25000 --screenshot="$png" \
    "http://127.0.0.1:$port/scripts/readme-image.html" >/dev/null 2>&1 || true
  # The page is blank until both apps have drawn, so a small file means the screenshot came too early.
  if [ -f "$png" ] && [ "$(stat -f%z "$png")" -gt 500000 ]; then break; fi
  rm -f "$png"
done

if [ ! -f "$png" ]; then
  echo "Chrome did not capture the app. Try again." >&2
  exit 1
fi

sips -s format jpeg -s formatOptions 88 "$png" --out "$root/examples/preview.jpg" >/dev/null
echo "Wrote examples/preview.jpg"
