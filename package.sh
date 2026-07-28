#!/usr/bin/env bash
# Builds the Chrome Web Store submission package.
#
# Ships only what the extension needs to run: the manifest, the source, and the
# three icon PNGs. The tests, the icon generator, the working notes and the git
# history are all development material — including them enlarges the upload and
# gives a reviewer more surface to ask about than the extension actually uses.
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="fieldwork-${VERSION}.zip"

rm -f "$OUT"
zip -rq "$OUT" manifest.json src icons \
  -x "icons/make_icons.py" "*/.DS_Store" ".DS_Store"

echo "$OUT — $(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files"
echo
echo "Upload at https://chrome.google.com/webstore/devconsole"
