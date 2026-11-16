#!/usr/bin/env bash
# Makes examples/preview.jpg, the picture of the app in the README.
# It serves the repo and takes a screenshot of scripts/readme-image.html in headless Chrome.
# Needs Python 3 and Chrome or Chromium. Set CHROME to the browser's path if the script does not find it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-8791}"
out="$root/examples/preview.jpg"

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then chrome="$candidate"; break; fi
  done
fi
if [ -z "$chrome" ]; then
  echo "Chrome or Chromium not found. Set CHROME to its path." >&2
  exit 1
fi

work="$(mktemp -d)"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill "$server"; wait "$server" 2>/dev/null || true; rm -rf "$work"' EXIT

for _ in $(seq 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.1
done

shot="$work/preview.jpg"
for try in 1 2 3; do
  # A new browser profile each time, so a saved panel position does not move the panel.
  # Chrome saves a JPEG because the file name ends in .jpg.
  "$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$work/profile-$try" \
    --hide-scrollbars --force-device-scale-factor=2 --window-size=1337,672 \
    --virtual-time-budget=25000 --screenshot="$shot" \
    "http://127.0.0.1:$port/scripts/readme-image.html" >/dev/null 2>&1 || true
  # The page is blank until both apps have drawn, so a small file means the screenshot came too early.
  # A blank screenshot is about 20 KB and a full one about 200 KB.
  if [ -f "$shot" ] && [ "$(wc -c < "$shot")" -gt 100000 ]; then break; fi
  rm -f "$shot"
done

if [ ! -f "$shot" ]; then
  echo "Chrome did not capture the app. Try again." >&2
  exit 1
fi

mv "$shot" "$out"
echo "Wrote examples/preview.jpg"
