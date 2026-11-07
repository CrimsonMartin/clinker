# Deploying clinker-api

Kustomize base in `k8s/` for a single-VM k3s cluster (Traefik ingress) behind Cloudflare.

```
k8s/
  kustomization.yaml     namespace, image tag, non-secret config, includes postgres component
  namespace.yaml         `clinker` namespace (Pod Security "restricted")
  api-deployment.yaml    2 replicas, /readyz + /healthz probes, non-root, read-only rootfs
  api-service.yaml       ClusterIP :80 -> :8080
  ingress.yaml           clinker.lanerate.io (PATCHME: ingressClassName, TLS secret, issuer)
  secret.example.yaml    documentation only, NOT applied by kustomize
  postgres/              optional Component: StatefulSet (5Gi PVC) + headless Service + NetworkPolicy
github-workflow-api-image.yml   move to .github/workflows/api-image.yml
```

## 0. Check cluster assumptions

```sh
kubectl get ingressclass           # expect "traefik" on k3s; otherwise edit ingress.yaml
kubectl get storageclass           # expect a (default) class, k3s: local-path
kubectl get crd | grep cert-manager   # is cert-manager installed?
kubectl get clusterissuer          # if so, which issuers exist?
```

Search the manifests for `PATCHME` for everything cluster-specific.

## 1. Image

Push to `main` with changes under `server/` and the workflow builds
`ghcr.io/crimsonmartin/clinker-api:latest` and `:sha-<short>`.

GHCR packages are **private by default**. Either make the package public
(GitHub → Packages → clinker-api → Package settings → Change visibility), or create a pull secret
and uncomment `imagePullSecrets` in `api-deployment.yaml`:

```sh
kubectl create namespace clinker
kubectl -n clinker create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<PAT with read:packages>
```

## 2. Secret

```sh
kubectl create namespace clinker --dry-run=client -o yaml | kubectl apply -f -
PGPW=$(openssl rand -hex 24)
kubectl -n clinker create secret generic clinker-secrets \
  --from-literal=POSTGRES_PASSWORD="$PGPW" \
  --from-literal=DATABASE_URL="postgres://clinker:${PGPW}@postgres.clinker.svc.cluster.local:5432/clinker" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)"
# optional, enables password-reset mail:
#   --from-literal=SMTP_URL='smtps://user:pass@smtp.example.com:465'
```

Also set `MAIL_FROM` in the `configMapGenerator` in `k8s/kustomization.yaml` if you use SMTP.
See `k8s/secret.example.yaml` for what each key means.

**Using an existing Postgres instead:** delete the `- postgres` line under `components:` in
`k8s/kustomization.yaml`, create a database + user there, and set `DATABASE_URL` accordingly
(`POSTGRES_PASSWORD` is then unused). The API needs `CREATE` on its schema (it runs its own
migrations) and Postgres ≥ 13 (`gen_random_uuid()`).

## 3. TLS + DNS (Cloudflare)

DNS: in Cloudflare create an **A** record `clinker` → the VM's public IPv4 (or a CNAME to an
existing hostname that points at the VM), **Proxied** (orange cloud). Set SSL/TLS mode to
**Full (strict)**. The origin then needs a certificate Cloudflare trusts; pick one:

**Option A: Cloudflare Origin Certificate (simplest, 15-year cert, only trusted by Cloudflare).**
Cloudflare → SSL/TLS → Origin Server → Create certificate for `clinker.lanerate.io`, then:

```sh
kubectl -n clinker create secret tls clinker-tls --cert=origin.pem --key=origin.key
```

Leave the cert-manager annotation in `ingress.yaml` commented out.

**Option B: cert-manager with Let's Encrypt DNS-01.** HTTP-01 is unreliable behind the
Cloudflare proxy, so use DNS-01 with a Cloudflare API token (Zone:DNS:Edit on lanerate.io):

```yaml
apiVersion: v1
kind: Secret
metadata: { name: cloudflare-api-token, namespace: cert-manager }
stringData: { api-token: "<token>" }
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: letsencrypt-dns-cloudflare }
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef: { name: letsencrypt-dns-cloudflare }
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef: { name: cloudflare-api-token, key: api-token }
```

Then uncomment `cert-manager.io/cluster-issuer: letsencrypt-dns-cloudflare` in `ingress.yaml`;
cert-manager will populate the `clinker-tls` secret.

(Without the Cloudflare proxy — grey cloud — the default k3s Traefik self-signed cert is not
acceptable to browsers; use option B, or HTTP-01 via an issuer of your choice.)

## 4. Apply

```sh
kubectl kustomize deploy/k8s | less     # review
kubectl apply -k deploy/k8s
kubectl -n clinker rollout status statefulset/postgres
kubectl -n clinker rollout status deployment/clinker-api
kubectl -n clinker logs deploy/clinker-api | head   # "applied migration 001_init.sql"
curl -s https://clinker.lanerate.io/healthz          # {"ok":true}
curl -s https://clinker.lanerate.io/readyz
```

The API pods may restart once if they come up before Postgres; startup retries the DB for ~60 s.

## Updating

- `latest` + `imagePullPolicy: Always`: `kubectl -n clinker rollout restart deploy/clinker-api`.
- Reproducible: set `newTag: sha-<short>` in `k8s/kustomization.yaml` (or
  `cd deploy/k8s && kustomize edit set image ghcr.io/crimsonmartin/clinker-api:sha-abc1234`),
  then `kubectl apply -k deploy/k8s`.

## Backups (in-cluster Postgres)

The data lives on a single `local-path` volume on the VM. At minimum, take periodic dumps:

```sh
kubectl -n clinker exec postgres-0 -- pg_dump -U clinker -Fc clinker > clinker-$(date +%F).dump
```

## Notes

- Rate limiting keys on `CF-Connecting-IP`. If the VM's port 443 is reachable directly (not only
  via Cloudflare) a client can spoof that header; restrict the firewall to Cloudflare IP ranges
  if that matters.
- The namespace enforces Pod Security `restricted`; both workloads comply.
- The NetworkPolicy only allows the API pods to reach Postgres (enforced by k3s' built-in
  network policy controller).
