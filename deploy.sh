#!/bin/bash
# Usage: ./deploy.sh [version]
# Examples:
#   ./deploy.sh          auto-bumps minor version (1.1.0 → 1.2.0)
#   ./deploy.sh 2.0.0    deploys a specific version (must be > current)
#
# Builds the Docker image, pushes to ghcr.io, updates the k8s manifest
# (image tag + VERSION env var), then commits + pushes so Flux picks it up.
#
# Prerequisites (one-time setup):
#   docker login ghcr.io -u skelstar --password-stdin <<< "$GITHUB_TOKEN"
#   (token needs write:packages scope)

set -e

# Check Docker is available and running
if ! docker info > /dev/null 2>&1; then
  echo "✗ Docker is not running. On Mac, open Docker Desktop and wait for it to start."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check there are no uncommitted changes
if ! git -C "$SCRIPT_DIR" diff --quiet || ! git -C "$SCRIPT_DIR" diff --cached --quiet; then
  echo "✗ You have uncommitted changes. Commit and push before deploying."
  git -C "$SCRIPT_DIR" status --short
  exit 1
fi

# Check there are no unpushed commits
git -C "$SCRIPT_DIR" fetch origin --quiet
UNPUSHED=$(git -C "$SCRIPT_DIR" rev-list origin/HEAD..HEAD --count)
if [ "$UNPUSHED" -gt 0 ]; then
  echo "✗ You have $UNPUSHED unpushed commit(s). Push before deploying."
  exit 1
fi

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

# ── 0. Resolve + validate version ────────────────────────────────────────────
VERSION=$(python3 - "$MANIFEST" "${1:-}" <<'EOF'
import sys, re

def parse(v):
    try:
        return tuple(int(x) for x in v.strip().split('.'))
    except ValueError:
        print(f"✗ Invalid version format '{v}' — must be X.Y.Z (e.g. 1.2.0)", file=sys.stderr)
        sys.exit(1)

path, requested = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()

m = re.search(r'- name: VERSION\s*\n\s*value: "([^"]+)"', content)
if not m:
    print("✗ Could not find VERSION in manifest.", file=sys.stderr)
    sys.exit(1)

current = m.group(1)
major, minor, patch = parse(current)

if requested:
    new_version = requested
    if parse(new_version) <= parse(current):
        print(f"✗ Version {new_version} must be greater than current version {current}", file=sys.stderr)
        sys.exit(1)
else:
    new_version = f"{major}.{minor + 1}.0"

print(f"  {current} → {new_version} ✓", file=sys.stderr)
print(new_version)
EOF
)
IMAGE="ghcr.io/skelstar/activity-logger:$VERSION"
echo "▶ Version: $VERSION"

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
