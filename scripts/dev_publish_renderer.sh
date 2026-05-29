#!/usr/bin/env bash
#
# Dev helper: build the renderer at a given version, sign manifest.json with
# the offline minisign key, and publish a renderer-v* GitHub Release on the
# public addysparrot repo.
#
# Usage:
#   ./scripts/dev_publish_renderer.sh <version> [--keep-version]
#
# Prerequisites:
#   - gh CLI installed and authenticated against SpringMagnolia/addysparrot
#   - minisign installed (brew install minisign)
#   - ~/Documents/addysparrot-credentials/ota-secret.key present
#   - You will be prompted for the minisign private-key password during signing
#
# Notes:
#   - By default bumps the renderer's package.json version (--no-git-tag-version).
#     Pass --keep-version to skip that and trust the existing version in package.json.
#   - Tag format is `renderer-v<version>` per the workspace's tag-prefix convention.
#     The matching client-v* tags are for desktop installer releases.
#
# Defensive choices:
#   - All temp files live in mktemp; never commits private key or signed bundle to the repo
#   - Manifest sha256 is computed from the actual zip before publication
#   - Trusted comment encodes version + sha256 so a downstream verifier can
#     cross-check even if the JSON body is tampered post-sign (defense in depth;
#     the signature already covers the body, but this is cheap belt+suspenders)

set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "usage: $0 <version> [--keep-version]" >&2
  exit 2
fi

VERSION="$1"
KEEP_VERSION=false
if [[ "${2:-}" == "--keep-version" ]]; then KEEP_VERSION=true; fi

# Validate version is dotted
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version must be N.N.N (got: $VERSION)" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET_KEY="${MINISIGN_SECRET_KEY:-$HOME/Documents/addysparrot-credentials/ota-secret.key}"
PUBLIC_REPO="SpringMagnolia/addysparrot"
TAG="renderer-v$VERSION"
ZIP_NAME="renderer-$VERSION.zip"

for tool in gh minisign zip shasum jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing required tool: $tool" >&2
    exit 1
  fi
done

if [[ ! -f "$SECRET_KEY" ]]; then
  echo "minisign private key not found at $SECRET_KEY" >&2
  echo "set MINISIGN_SECRET_KEY env var or place the key at that path" >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! $KEEP_VERSION; then
  echo "[publish] bumping package.json to $VERSION"
  npm version --no-git-tag-version "$VERSION" >/dev/null
fi

echo "[publish] running release build"
npm run build:release

if [[ ! -f dist/index.html ]]; then
  echo "build did not produce dist/index.html" >&2
  exit 1
fi

TMP="$(mktemp -d -t addysparrot-publish-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "[publish] zipping dist/ → $TMP/$ZIP_NAME"
(cd dist && zip -qr "$TMP/$ZIP_NAME" .)

SHA="$(shasum -a 256 "$TMP/$ZIP_NAME" | awk '{print $1}')"
SIZE="$(stat -f%z "$TMP/$ZIP_NAME")"
PUBLISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[publish] sha256 = $SHA"
echo "[publish] size   = $SIZE bytes"

cat > "$TMP/manifest.json" <<EOF
{
  "schemaVersion": 1,
  "rendererVersion": "$VERSION",
  "minClientVersion": "1.0.0",
  "asset": {
    "url": "https://github.com/$PUBLIC_REPO/releases/download/$TAG/$ZIP_NAME",
    "sha256": "$SHA",
    "sizeBytes": $SIZE
  },
  "publishedAt": "$PUBLISHED_AT",
  "releaseNotes": "https://github.com/$PUBLIC_REPO/releases/tag/$TAG"
}
EOF

echo ""
echo "[publish] signing manifest.json with minisign — you'll be prompted for the password"
minisign -S \
  -s "$SECRET_KEY" \
  -m "$TMP/manifest.json" \
  -t "$TAG sha256=$SHA"

# minisign writes to <input>.minisig
if [[ ! -f "$TMP/manifest.json.minisig" ]]; then
  echo "minisign did not produce manifest.json.minisig" >&2
  exit 1
fi

echo ""
echo "[publish] artifacts ready:"
ls -l "$TMP"

if gh release view "$TAG" --repo "$PUBLIC_REPO" >/dev/null 2>&1; then
  echo ""
  echo "[publish] release $TAG already exists — uploading assets with --clobber"
  gh release upload "$TAG" \
    --repo "$PUBLIC_REPO" \
    --clobber \
    "$TMP/$ZIP_NAME" \
    "$TMP/manifest.json" \
    "$TMP/manifest.json.minisig"
else
  echo ""
  echo "[publish] creating release $TAG on $PUBLIC_REPO"
  gh release create "$TAG" \
    --repo "$PUBLIC_REPO" \
    --title "$TAG" \
    --notes "Renderer OTA release $TAG. Verify with minisign public key id FDF2813CF4B85ABC." \
    "$TMP/$ZIP_NAME" \
    "$TMP/manifest.json" \
    "$TMP/manifest.json.minisig"
fi

echo ""
echo "[publish] done — $TAG live at https://github.com/$PUBLIC_REPO/releases/tag/$TAG"
