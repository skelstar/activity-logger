#!/bin/bash
# Usage: ./deploy.sh <version>
# Example: ./deploy.sh 1.1.0
#
# Builds the Docker image, pushes to ghcr.io, updates the k8s manifest
# (image tag + VERSION env var), then commits + pushes so Flux picks it up.
#
# Prerequisites (one-time setup):
#   docker login ghcr.io -u skelstar --password-stdin <<< "$GITHUB_TOKEN"
#   (token needs write:packages scope)

set -e

VERSION=${1:?"Usage: ./deploy.sh <version>  e.g. ./deploy.sh 1.1.0"}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$SCRIPT_DIR/../k8s/manifests.yaml"
IMAGE="ghcr.io/skelstar/activity-logger:$VERSION"

# ── 1. Build ────────────────────────────────────────────────────────────────
echo "▶ Building and pushing $IMAGE (linux/amd64)..."
docker buildx build \
  --platform linux/amd64 \
  --push \
  -t "$IMAGE" \
  "$SCRIPT_DIR"

# ── 3. Update image tag + VERSION in the k8s manifest ───────────────────────
echo "▶ Setting image=$IMAGE and VERSION=$VERSION in manifest..."
python3 - "$MANIFEST" "$VERSION" <<'EOF'
import sys, re

path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()

# Bump image tag
updated = re.sub(
    r'(image: ghcr\.io/skelstar/activity-logger:)[^\s]+',
    rf'\g<1>{version}',
    content
)

# Bump VERSION env var
updated = re.sub(
    r'(- name: VERSION\s*\n\s*value: )"[^"]*"',
    rf'\g<1>"{version}"',
    updated
)

if updated == content:
    print("  WARNING: no changes made — check image/VERSION lines in manifest.")
    sys.exit(1)

with open(path, 'w') as f:
    f.write(updated)
print(f"  Done — image and VERSION are now {version}")
EOF

# ── 4. Commit + push Tatooine-Configuration ──────────────────────────────────
TATOOINE_ROOT="$(git -C "$(dirname "$MANIFEST")" rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$TATOOINE_ROOT" ]; then
    echo "  WARNING: Could not find Tatooine-Configuration git repo. Commit the manifest manually."
else
    echo "▶ Committing manifest change..."
    git -C "$TATOOINE_ROOT" add "$MANIFEST"
    git -C "$TATOOINE_ROOT" commit -m "activity-logger: release $VERSION"
    git -C "$TATOOINE_ROOT" push
    echo "▶ Pushed — Flux will redeploy within 5 minutes."
    echo "  To deploy immediately:"
    echo "  kubectl -n flux-system annotate gitrepository tatooine-config reconcile.fluxcd.io/requestedAt=\"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --overwrite"
fi
