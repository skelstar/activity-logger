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
IMAGE="ghcr.io/skelstar/activity-logger:$VERSION"

# Find the manifest — two possible layouts:
#   Tatooine:  <repo-root>/deployments/activity-logger/src/  +  ../k8s/
#   Laptop:    GitHub/activity-logger/  +  ../Tatooine-Configuration/deployments/activity-logger/k8s/
MANIFEST=""
CANDIDATES=(
  "$SCRIPT_DIR/../k8s/manifests.yaml"
  "$SCRIPT_DIR/../Tatooine-Configuration/deployments/activity-logger/k8s/manifests.yaml"
)
for candidate in "${CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    MANIFEST="$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")"
    break
  fi
done
if [ -z "$MANIFEST" ]; then
  echo "✗ Could not find k8s/manifests.yaml. Clone Tatooine-Configuration as a sibling of this repo."
  exit 1
fi
echo "▶ Using manifest: $MANIFEST"

# ── 0. Version check ─────────────────────────────────────────────────────────
python3 - "$MANIFEST" "$VERSION" <<'EOF'
import sys, re
from functools import cmp_to_key

def parse(v):
    try:
        return tuple(int(x) for x in v.strip().split('.'))
    except ValueError:
        print(f"✗ Invalid version format '{v}' — must be X.Y.Z (e.g. 1.2.0)")
        sys.exit(1)

path, new_version = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()

m = re.search(r'- name: VERSION\s*\n\s*value: "([^"]+)"', content)
if not m:
    print("✗ Could not find VERSION in manifest.")
    sys.exit(1)

current = m.group(1)
if parse(new_version) <= parse(current):
    print(f"✗ Version {new_version} must be greater than current version {current}")
    sys.exit(1)

print(f"  {current} → {new_version} ✓")
EOF

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
