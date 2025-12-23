# Backstage with Forgejo/Gitea OIDC Authentication

> **TL;DR:** Custom Backstage build that replaces hardcoded GitHub auth with Forgejo/Gitea OIDC. Ready to deploy in Kubernetes with Helm.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Backstage](https://img.shields.io/badge/Backstage-Latest-7C3AED.svg)](https://backstage.io)

---

## Table of Contents

- [Problem](#problem)
- [Solution](#solution)
- [What Changed](#what-changed)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Development](#development)
- [FAQ](#faq)

---

## Problem

**Why this fork exists:**

Official Backstage Docker images (like `quay.io/rhdh-community/rhdh:next`) and Helm charts have **GitHub authentication hardcoded** in the frontend code.

Even when you configure OIDC in `app-config.yaml`:
```yaml
auth:
  providers:
    oidc:
      production:
        metadataUrl: https://git.example.com/.well-known/openid-configuration
```

...the sign-in page still shows:
```
❌ "Sign in using GitHub"
```

This happens because:
1. **Frontend** (`packages/app/src/App.tsx`) references `githubAuthApiRef`
2. **API factory** (`packages/app/src/apis.ts`) is tied to GitHub OAuth

---

## Solution

This custom build fixes the frontend to work with **any OIDC provider** (Forgejo, Gitea, Keycloak, etc.):

- ✅ Custom `forgejoAuthApiRef` API reference
- ✅ OIDC backend module configured
- ✅ Sign-in page shows "**Sign in using Forgejo**" (customizable)
- ✅ No GitHub dependency
- ✅ Works with Forgejo/Gitea for both auth AND catalog discovery

## 📦 Production Plugins Included in v1.0.0

### 🔐 Authentication & Authorization
- ✅ **OIDC Provider** - `@backstage/plugin-auth-backend-module-oidc-provider`
- ✅ **Guest Provider** - `@backstage/plugin-auth-backend-module-guest-provider`
- ✅ **Permission System** - `@backstage/plugin-permission-backend`
- ✅ **Allow-All Policy** - `@backstage/plugin-permission-backend-module-allow-all-policy`

> 💡 **User Management**: Backstage uses **catalog entities** for users. For RBAC (Role-Based Access Control), install the official `@backstage/plugin-permission-backend-module-rbac` plugin separately.

### 📚 Catalog & Discovery
- ✅ **Catalog Backend** - `@backstage/plugin-catalog-backend`
- ✅ **Gitea Provider** - `@backstage/plugin-catalog-backend-module-gitea` (autodiscovery)
- ✅ **Scaffolder Entity Model** - `@backstage/plugin-catalog-backend-module-scaffolder-entity-model`
- ✅ **Catalog Logs** - `@backstage/plugin-catalog-backend-module-logs`

### 🛠️ Scaffolder (Templates)
- ✅ **Scaffolder Backend** - `@backstage/plugin-scaffolder-backend`
- ✅ **Gitea Actions** - `@backstage/plugin-scaffolder-backend-module-gitea` (create repos)
- ✅ **GitHub Actions** - `@backstage/plugin-scaffolder-backend-module-github`
- ✅ **Notifications** - `@backstage/plugin-scaffolder-backend-module-notifications`

### 🔍 Search
- ✅ **Search Backend** - `@backstage/plugin-search-backend`
- ✅ **PostgreSQL Engine** - `@backstage/plugin-search-backend-module-pg`
- ✅ **Catalog Collator** - `@backstage/plugin-search-backend-module-catalog`
- ✅ **TechDocs Collator** - `@backstage/plugin-search-backend-module-techdocs`

### 📖 Documentation
- ✅ **TechDocs** - `@backstage/plugin-techdocs-backend`

### ☸️ Infrastructure
- ✅ **Kubernetes** - `@backstage/plugin-kubernetes-backend`
- ✅ **Proxy** - `@backstage/plugin-proxy-backend`

### 🔔 Notifications & Signals
- ✅ **Notifications** - `@backstage/plugin-notifications-backend`
- ✅ **Signals** - `@backstage/plugin-signals-backend` (real-time updates)

### 🎨 Frontend
- ✅ **Custom OIDC Auth API** - `forgejoAuthApiRef`
- ✅ **App Backend** - `@backstage/plugin-app-backend`
- ✅ **Customizable Sign-in Page** - "Sign in using Forgejo" (or any provider name)

---

## What Changed

### 1. Frontend Changes

#### `packages/app/src/apis.ts`

Created custom API factory for OIDC:

```typescript
import { createApiRef, OpenIdConnectApi, ProfileInfoApi, 
         BackstageIdentityApi, SessionApi } from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';

// Custom API reference for Forgejo OIDC
export const forgejoAuthApiRef = createApiRef<
  OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi
>({
  id: 'auth.forgejo',
});

export const apis: AnyApiFactory[] = [
  // ... other APIs
  createApiFactory({
    api: forgejoAuthApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
      OAuth2.create({
        discoveryApi,
        oauthRequestApi,
        configApi,
        provider: {
          id: 'oidc',  // Must match backend provider
          title: 'Forgejo',
          icon: () => null,
        },
        defaultScopes: ['openid', 'profile', 'email'],
      }),
  }),
];
```

#### `packages/app/src/App.tsx`

Configured SignInPage to use custom auth:

```typescript
import { forgejoAuthApiRef } from './apis';

const app = createApp({
  components: {
    SignInPage: props => (
      <SignInPage
        {...props}
        auto
        providers={[
          {
            id: 'oidc',
            title: 'Forgejo',  // ← Shows on sign-in button
            message: 'Sign in using Forgejo',
            apiRef: forgejoAuthApiRef,  // ← Uses our custom API
          },
        ]}
      />
    ),
  },
  // ...
});
```

### 2. Backend Changes

#### `packages/backend/src/index.ts`

Added OIDC provider module:

```typescript
// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// OIDC provider for Forgejo/Gitea
backend.add(import('@backstage/plugin-auth-backend-module-oidc-provider'));

// Gitea integrations
backend.add(import('@backstage/plugin-catalog-backend-module-gitea'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-gitea'));
```

**All dependencies already in package.json** - see full list in "Production Plugins Included" section above.

### 3. Configuration

#### `app-config.yaml` (base config)

```yaml
auth:
  environment: production
  session:
    secret: ${SESSION_SECRET}  # Required for OIDC
  providers:
    oidc:
      production:
        metadataUrl: ${AUTH_OIDC_METADATA_URL}
        clientId: ${AUTH_OIDC_CLIENT_ID}
        clientSecret: ${AUTH_OIDC_CLIENT_SECRET}
        signIn:
          resolvers:
            - resolver: emailLocalPartMatchingUserEntityName
              dangerouslyAllowSignInWithoutUserInCatalog: true

integrations:
  gitea:
    - host: git.example.com
      token: ${FORGEJO_TOKEN}
```

---

## Quick Start

### Prerequisites

- **Forgejo/Gitea** instance with OIDC support
- **Kubernetes** cluster (1.25+)
- **Helm** 3.10+
- **PostgreSQL** database

### 1. Configure Forgejo OAuth Application

In Forgejo **Settings → Applications → OAuth2**:

| Field | Value |
|-------|-------|
| **Application Name** | Backstage |
| **Redirect URI** | `https://backstage.example.com/api/auth/oidc/handler/frame` |
| **Scopes** | `openid`, `profile`, `email` |

Save the generated **Client ID** and **Client Secret**.

**Also create a Personal Access Token** for catalog discovery:

In Forgejo **Settings → Applications → Generate New Token**:

| Permission | Required |
|------------|----------|
| `read:organization` | ✅ Yes (to discover repos in org) |
| `read:repository` | ✅ Yes (to read catalog-info.yml) |
| `read:user` | ✅ Yes (for user metadata) |

Save this token — you'll use it as `FORGEJO_TOKEN`.

### 2. Create Kubernetes Secret

```bash
kubectl create namespace backstage

kubectl create secret generic backstage-secrets \
  --namespace backstage \
  --from-literal=CLIENT_ID='<your-client-id>' \
  --from-literal=CLIENT_SECRET='<your-client-secret>' \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 32)" \
  --from-literal=BACKEND_SECRET="$(openssl rand -base64 32)" \
  --from-literal=FORGEJO_TOKEN='<forgejo-personal-access-token>' \
  --from-literal=POSTGRES_PASSWORD='<postgres-password>'
```

### 3. Deploy with Helm

```bash
helm install backstage oci://ghcr.io/backstage/charts/backstage \
  --namespace backstage \
  --values values.yaml
```

**`values.yaml`:**

```yaml
backstage:
  image:
    registry: ghcr.io
    repository: yourorg/backstage-forgejo-oidc
    tag: latest
  
  extraEnvVars:
    - name: AUTH_OIDC_METADATA_URL
      value: "https://git.example.com/.well-known/openid-configuration"
    - name: AUTH_OIDC_CLIENT_ID
      valueFrom:
        secretKeyRef:
          name: backstage-secrets
          key: CLIENT_ID
    - name: AUTH_OIDC_CLIENT_SECRET
      valueFrom:
        secretKeyRef:
          name: backstage-secrets
          key: CLIENT_SECRET
    - name: SESSION_SECRET
      valueFrom:
        secretKeyRef:
          name: backstage-secrets
          key: SESSION_SECRET
    - name: BACKEND_SECRET
      valueFrom:
        secretKeyRef:
          name: backstage-secrets
          key: BACKEND_SECRET
  
  appConfig:
    app:
      title: "Developer Portal"
      baseUrl: https://backstage.example.com
    
    backend:
      baseUrl: https://backstage.example.com
      database:
        client: pg
        connection:
          host: postgres-host
          port: 5432
          user: postgres
    
    integrations:
      gitea:
        - host: git.example.com
          token: ${FORGEJO_TOKEN}
    
    catalog:
      providers:
        gitea:
          your-org:
            host: git.example.com
            organization: your-org
            catalogPath: .backstage/catalog-info.yml
            schedule:
              frequency: { minutes: 30 }

ingress:
  enabled: true
  host: backstage.example.com
```

### 4. Access Backstage

Open `https://backstage.example.com` → Click **"Sign in using Forgejo"** ✅

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AUTH_OIDC_METADATA_URL` | `https://git.example.com/.well-known/openid-configuration` | Yes |
| `AUTH_OIDC_CLIENT_ID` | OAuth2 Client ID from Forgejo | Yes |
| `AUTH_OIDC_CLIENT_SECRET` | OAuth2 Client Secret | Yes |
| `SESSION_SECRET` | Random 32+ chars for session encryption | Yes |
| `BACKEND_SECRET` | Random 32+ chars for backend auth | Yes |
| `FORGEJO_TOKEN` | Personal Access Token for catalog discovery | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |

### Helm Configuration Priority

```
┌─────────────────────────────────────────────────────────┐
│ Configuration Sources (highest to lowest priority)      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Helm `backstage.appConfig`      ← Highest          │
│     (overrides everything)                              │
│                                                         │
│  2. app-config.production.yaml      ← Medium           │
│     (when NODE_ENV=production)                          │
│                                                         │
│  3. app-config.yaml                 ← Lowest           │
│     (base configuration)                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> **Key Point:** In Kubernetes deployments, use `backstage.appConfig` in Helm values. You don't need to rebuild the Docker image to change config!

---

## Development

### Local Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

### Build Docker Image

```bash
# TypeScript compilation
yarn tsc

# Build backend bundle (includes frontend)
# export NODE_OPTIONS="--max-old-space-size=4096"
yarn build:backend

# Build Docker image
docker build -t backstage:latest -f packages/backend/Dockerfile .

# Tag
docker tag backstage:latest ghcr.io/yourorg/backstage-forgejo-oidc:1.0.0
docker tag backstage:latest ghcr.io/yourorg/backstage-forgejo-oidc:latest

# Tag changes (optional)
# docker tag ghcr.io/yourorg/backstage-forgejo-oidc:latest ghcr.io/yourorg/backstage-forgejo-oidc:$(date +%Y%m%d%H%M%S)

# Push to GitHub Container Registry
docker push ghcr.io/yourorg/backstage-forgejo-oidc:1.0.0
docker push ghcr.io/yourorg/backstage-forgejo-oidc:latest
```

> **Note:** Increase Node.js memory with `NODE_OPTIONS` if build fails with "memory allocation" error.

### Project Structure Changes

```
backstage-forgejo-oidc/
├── packages/
│   ├── app/                 # Frontend React app
│   │   └── src/
│   │       ├── apis.ts      # ← forgejoAuthApiRef
│   │       └── App.tsx      # ← SignInPage config
│   └── backend/             # Backend Node.js app
│       └── src/
│           └── index.ts     # ← OIDC provider module
├── app-config.yaml          # Base configuration
├── app-config.production.yaml  # Production overrides
└── README.md
```

---

## Deployment

### Kubernetes Deployment Checklist

- [ ] Forgejo OAuth2 application created
- [ ] `backstage-secrets` Secret created
- [ ] PostgreSQL database available
- [ ] Helm values configured
- [ ] Ingress DNS configured
- [ ] TLS certificate (optional)

### Updating Configuration

To change configuration **without rebuilding the image**:

```bash
# Edit your Helm values
vim values.yaml

# Apply changes
helm upgrade backstage oci://ghcr.io/backstage/charts/backstage \
  --namespace backstage \
  --values values.yaml

# Restart pods to pick up new config
kubectl rollout restart deployment backstage -n backstage
```

---

## FAQ

### Q: Why not use the official Backstage Helm chart as-is?

**A:** The official chart uses pre-built images (`quay.io/rhdh-community/rhdh`) which have GitHub auth hardcoded in frontend code. To use Forgejo/Gitea OIDC, you must build a custom image with modified frontend.

### Q: Can I use this with other OIDC providers (Keycloak, Auth0)?

**A:** Yes! Just change the button text in `App.tsx`:
```typescript
{
  id: 'oidc',
  title: 'Keycloak',  // ← Change this
  message: 'Sign in using Keycloak',
  apiRef: forgejoAuthApiRef,
}
```

### Q: How do I change the sign-in button text?

**A:** Edit `packages/app/src/App.tsx`:
```typescript
providers={[
  {
    id: 'oidc',
    title: 'Your Company SSO',  // ← This shows on button
    message: 'Sign in using Company SSO',
    apiRef: forgejoAuthApiRef,
  },
]}
```

Then rebuild the image.

### Q: Do I need to rebuild the image every time I change config?

**A:** No! Use Helm `backstage.appConfig` to override configuration. You only need to rebuild if you change:
- Frontend code (`packages/app/`)
- Backend code (`packages/backend/`)
- Dependencies in `package.json`

### Q: Can I use Gitea instead of Forgejo?

**A:** Yes! Forgejo is a Gitea fork with 100% API compatibility. Just replace `git.example.com` with your Gitea instance URL.

### Q: What PostgreSQL version is supported?

**A:** PostgreSQL 12+ is recommended. Backstage uses standard SQL features.

---

### Reporting Issues

- Frontend auth issues → Check `App.tsx` and `apis.ts`
- Backend OIDC issues → Check `packages/backend/src/index.ts`
- Helm deployment issues → Check your `values.yaml`

---

## License

Apache 2.0 (same as Backstage)

---

## Links

- [Backstage Official Docs](https://backstage.io/docs)
- [Backstage Helm Chart](https://github.com/backstage/charts)
- [Forgejo](https://forgejo.org)
- [Gitea](https://gitea.io)
- [OIDC Authentication in Backstage](https://backstage.io/docs/auth/oidc/provider)

---

## Credits

Built on top of [Backstage](https://backstage.io) by Spotify.

Special thanks to the Backstage community and contributors.
