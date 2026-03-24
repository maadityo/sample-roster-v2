# Step 2: Create a CD (Continuous Deployment) Workflow for Azure

## Why This Matters

Your CI pipeline (`ci.yml`) already runs lint, tests, and Docker builds on every push and PR — but it **doesn't deploy anything**. After CI passes, you still have to manually:

1. Build the Docker image locally
2. Push it to a container registry
3. Update the Azure resource to use the new image

A **CD (Continuous Deployment) workflow** automates this entire process. When code is merged to `master` and all CI checks pass, the CD pipeline automatically:

1. Builds and pushes your Docker image to **Azure Container Registry (ACR)**
2. Deploys the new image to **Azure Container Apps**

```
┌─────────┐     ┌────────┐     ┌────────────────┐     ┌────────────────────┐
│  Push    │────▶│  CI    │────▶│  Build & Push   │────▶│  Deploy to Azure   │
│  to     │     │  Pass  │     │  Docker to ACR  │     │  Container Apps    │
│  master │     │  ✅    │     │                 │     │                    │
└─────────┘     └────────┘     └────────────────┘     └────────────────────┘
```

## Prerequisites

- **Step 1 completed**: OIDC federated identity is set up (see `docs/01-oidc-azure-authentication.md`)
- Azure CLI installed locally
- An Azure Container Registry (we'll create one below)
- An Azure Container Apps environment (we'll create one below)

## Step-by-Step Instructions

### Step 2.1: Create Azure Container Registry (ACR)

ACR is where your Docker images will be stored (like Docker Hub, but private and in your Azure subscription):

```bash
# Create the registry (name must be globally unique, alphanumeric only)
az acr create \
  --resource-group rg-kakak-prod \
  --name acrkakakprod \
  --sku Basic \
  --admin-enabled false

# Verify it was created
az acr show --name acrkakakprod --query "{name:name, loginServer:loginServer}" -o table
```

> **What is ACR?**
> Azure Container Registry is a managed Docker registry. Your CI/CD pipeline pushes images here, and Azure Container Apps pulls from here. The `Basic` SKU is cheapest (~$0.167/day) and sufficient for dev/small projects.

### Step 2.2: Grant Your Service Principal Access to ACR

The GitHub Actions service principal needs permission to push images:

```bash
APP_ID=$(az ad app list --display-name "github-actions-kakak" --query "[0].appId" -o tsv)
SP_OBJECT_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)
ACR_ID=$(az acr show --name acrkakakprod --query id -o tsv)

# Grant AcrPush role (push and pull images)
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPush" \
  --scope $ACR_ID
```

### Step 2.3: Create Azure Container Apps Environment

Container Apps is a serverless container platform — you don't manage VMs or Kubernetes clusters:

```bash
# Install the Container Apps extension (if not already installed)
az extension add --name containerapp --upgrade

# Create a Container Apps environment
az containerapp env create \
  --name cae-kakak-prod \
  --resource-group rg-kakak-prod \
  --location australiaeast
```

> **What is Azure Container Apps?**
> It's a fully managed serverless container service. You give it a Docker image, and it handles scaling, networking, TLS certificates, and health checks. Think of it as "Vercel for Docker containers." It's built on Kubernetes but you don't need to manage any Kubernetes cluster.

### Step 2.4: Create the Container App

```bash
# First, build and push an initial image (so the container app has something to start with)
az acr build \
  --registry acrkakakprod \
  --image kakak:initial \
  --file Dockerfile \
  .

# Create the container app
az containerapp create \
  --name ca-kakak-prod \
  --resource-group rg-kakak-prod \
  --environment cae-kakak-prod \
  --image acrkakakprod.azurecr.io/kakak:initial \
  --registry-server acrkakakprod.azurecr.io \
  --registry-identity system \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --env-vars \
    "DATABASE_URL=secretref:database-url" \
    "NEXTAUTH_SECRET=secretref:nextauth-secret" \
    "NEXTAUTH_URL=https://ca-kakak-prod.<region>.azurecontainerapps.io" \
    "AZURE_KEY_VAULT_URL=https://akv-prod-eau-01.vault.azure.net/"
```

### Step 2.5: Add the `AZURE_ACR_NAME` GitHub Secret

Go to your repository → **Settings** → **Secrets and variables** → **Actions** and add:

| Secret Name | Value |
|---|---|
| `AZURE_ACR_NAME` | `acrkakakprod` |

### Step 2.6: Create the CD Workflow File

Create `.github/workflows/deploy.yml`:

```yaml
name: CD — Deploy to Azure

on:
  # Only deploy when CI passes on master
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [master]

# OIDC permissions
permissions:
  id-token: write
  contents: read

env:
  ACR_NAME: acrkakakprod
  CONTAINER_APP_NAME: ca-kakak-prod
  RESOURCE_GROUP: rg-kakak-prod
  IMAGE_NAME: kakak

jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    # Only run if CI succeeded AND was triggered by a push (not a PR)
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      # ── Authenticate to Azure using OIDC ──
      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # ── Build and push Docker image to ACR ──
      - name: Build and push to ACR
        run: |
          # Generate a unique tag using the short commit SHA
          IMAGE_TAG="${{ github.event.workflow_run.head_sha }}"
          SHORT_SHA="${IMAGE_TAG:0:7}"

          echo "Building image: $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA"

          # Login to ACR
          az acr login --name $ACR_NAME

          # Build and push with both the SHA tag and "latest"
          docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA \
                       -t $ACR_NAME.azurecr.io/$IMAGE_NAME:latest \
                       .
          docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA
          docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:latest

          echo "IMAGE_TAG=$SHORT_SHA" >> $GITHUB_ENV

      # ── Deploy to Azure Container Apps ──
      - name: Deploy to Container Apps
        run: |
          az containerapp update \
            --name $CONTAINER_APP_NAME \
            --resource-group $RESOURCE_GROUP \
            --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

      # ── Verify deployment ──
      - name: Verify deployment
        run: |
          # Get the app URL
          FQDN=$(az containerapp show \
            --name $CONTAINER_APP_NAME \
            --resource-group $RESOURCE_GROUP \
            --query "properties.configuration.ingress.fqdn" -o tsv)

          echo "🚀 Deployed to: https://$FQDN"

          # Wait for the new revision to be ready
          sleep 30

          # Health check
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$FQDN" || echo "000")
          echo "Health check status: $HTTP_STATUS"

          if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 400 ]; then
            echo "✅ Deployment successful!"
          else
            echo "⚠️ Health check returned $HTTP_STATUS — check the app logs"
          fi
```

## Understanding the Workflow

### Why `workflow_run` instead of `on: push`?

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [master]
```

This means: "Run this workflow **only after** the CI workflow finishes on master." This ensures:
- You never deploy code that hasn't passed all tests
- Lint, type-check, unit tests, E2E tests, and Docker build must all pass first
- The CD workflow only runs on `master` (not on PRs)

### Why tag with both SHA and `latest`?

```bash
docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA \
             -t $ACR_NAME.azurecr.io/$IMAGE_NAME:latest .
```

- **SHA tag** (e.g., `kakak:a1b2c3d`): Immutable — you can always roll back to a specific commit
- **`latest` tag**: Convenient for Container Apps to know which is the newest image

### How rollback works

If a deployment goes wrong, you can instantly roll back:

```bash
# List recent revisions
az containerapp revision list \
  --name ca-kakak-prod \
  --resource-group rg-kakak-prod \
  -o table

# Activate a previous revision
az containerapp revision activate \
  --name ca-kakak-prod \
  --resource-group rg-kakak-prod \
  --revision <previous-revision-name>
```

## Alternative: Deploy on Tag/Release

If you prefer to deploy only when you create a release tag:

```yaml
on:
  push:
    tags:
      - 'v*'  # Only deploy on v1.0.0, v2.1.3, etc.
```

This gives you more control but requires manual tag creation.

## How to Verify It Works

1. Merge a PR to `master`
2. Watch the CI workflow run and complete successfully
3. The "CD — Deploy to Azure" workflow should automatically start
4. Check the workflow run for the deployment URL
5. Visit the URL to confirm the app is running

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| CD workflow doesn't trigger | CI didn't complete or wasn't on master | Check CI workflow status; ensure it's the `push` event on `master` |
| `az acr login` fails | OIDC not set up or missing `AcrPush` role | Re-run Step 2.2 to assign the role |
| Container App shows "Failed" revision | Missing environment variables or DB connection | Check `az containerapp logs show --name ca-kakak-prod --resource-group rg-kakak-prod` |
| Health check returns 500 | Database not migrated or secrets not configured | Ensure DATABASE_URL and other secrets are set on the Container App |

## Cost Estimate

| Resource | Cost (approx.) |
|---|---|
| Container Registry (Basic) | ~$5/month |
| Container Apps (with scale-to-zero) | $0 when idle, ~$10-30/month with moderate traffic |
| **Total** | **~$5-35/month** |

## What's Next?

Now that you have automated deployments, the next step is **Step 3: Branch Protection Rules** to ensure nobody can push directly to `master` and bypass CI/CD.

---

## References

- [Azure Container Apps Overview](https://learn.microsoft.com/en-us/azure/container-apps/overview)
- [Azure Container Registry](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-intro)
- [GitHub Actions: workflow_run event](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run)
