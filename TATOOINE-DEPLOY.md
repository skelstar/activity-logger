# Tatooine deployment changes: Strava OAuth

For whoever (or whatever) is editing `deployments/activity-logger/k8s/manifests.yaml` in **Tatooine-Configuration**. These changes must be in place **before** the `strava-oauth-multi-user` PR is merged to `main`, because the merge triggers a build and FluxCD redeploy.

## What changed in the app

- Strava is no longer a single hard-coded user. Each user connects their own Strava account through OAuth ("Connect with Strava").
- Each user's Strava tokens are stored in a **SQLite file** (`/data/app.db` in the container). It uses Node's built-in `node:sqlite`, so the image base moved from `node:20-alpine` to `node:22-alpine`.
- Sessions use a signed cookie, so the app needs a stable `SESSION_SECRET`.
- The app crashes at startup in production if `SESSION_SECRET` is missing.
- `STRAVA_REFRESH_TOKEN` is no longer used and can be removed.

## What needs to change in the manifest

### 1. Persistent volume for the database

Without this, every pod restart wipes the database and logs every user out.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: activity-logger-data
  namespace: <existing namespace>
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: local-path   # k3s default
  resources:
    requests:
      storage: 1Gi
```

In the Deployment pod spec:

```yaml
        volumeMounts:
          - name: data
            mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: activity-logger-data
```

### 2. Single replica, Recreate strategy

SQLite is a single file, so two pods must never share it. A rolling update would briefly run the old and new pods against the same volume.

```yaml
spec:
  replicas: 1
  strategy:
    type: Recreate
```

### 3. Environment variables

Add to the container `env`:

| Name | Value | Notes |
|---|---|---|
| `STRAVA_CLIENT_ID` | Strava app client ID | Not secret |
| `STRAVA_CLIENT_SECRET` | Strava app client secret | **Secret** |
| `SESSION_SECRET` | long random string | **Secret.** Changing it logs everyone out |
| `PUBLIC_URL` | public origin, e.g. `https://<host>` | No trailing slash. Used for the OAuth redirect URI `<PUBLIC_URL>/api/strava/callback`. Use `https://` so cookies are marked `Secure` |
| `DATA_DIR` | `/data` | Already the Docker image default; set it explicitly if you like |

Remove `STRAVA_REFRESH_TOKEN`.

Put the two secrets in a Kubernetes Secret (or whatever Tatooine uses for secrets) and reference them with `valueFrom.secretKeyRef`. Don't put them in plain text in the manifest.

Keep the existing `VERSION` env var as is. The deploy workflow rewrites it by regex (`- name: VERSION` followed by `value: "..."`), so don't change that format.

### 4. Ingress and TLS

The app must be reachable at exactly `PUBLIC_URL`. If it sits behind a proxy or ingress that terminates TLS, the `Secure` cookie flag is decided by `PUBLIC_URL` (not by the request), so this works as long as `PUBLIC_URL` starts with `https://`.

## Manual step on strava.com (not in any repo)

In https://www.strava.com/settings/api, set **Authorization Callback Domain** to the production host (hostname only, no scheme or path). It holds one value, so switch it back to `localhost` for local development, or pick whichever you use more. Strava only checks the domain, not the port.

## After deploying: checks

1. Open the app, click **Connect with Strava**, approve, and confirm the activity picker loads.
2. Restart the pod (`kubectl -n <ns> rollout restart deploy/activity-logger`) and confirm you're still connected. That proves the PVC is working.
3. `kubectl -n <ns> logs deploy/activity-logger` should show `Server running on http://localhost:3000` and no `SESSION_SECRET` error.

## Things to know

- Existing single-user behaviour ends: the old `STRAVA_REFRESH_TOKEN` is ignored, and the first user must reconnect through the new flow.
- Strava limits how many athletes can authorize the app (10 at last check). Beyond that needs a capacity increase from Strava.
- If the PVC is lost, users just reconnect. Nothing else is stored in the database yet.
