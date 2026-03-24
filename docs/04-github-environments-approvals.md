# Step 4: GitHub Environments with Deployment Approvals

## Why This Matters

Even with CI passing and branch protection, your CD pipeline deploys **immediately** when code is merged to `master`. This is fine for small projects, but for production apps:

- **No human gate** — A passing test suite doesn't guarantee the feature is ready for users
- **No staging validation** — You can't test with real-ish data before going live
- **No audit trail** — You can't see who approved which deployment

**GitHub Environments** solve this by adding:
1. **Approval gates** — A designated person must click "Approve" before deployment proceeds
2. **Environment-specific secrets** — Production secrets are separate from staging secrets
3. **Deployment history** — See exactly what was deployed, when, and by whom
4. **Wait timers** — Optional delay between approval and deployment (e.g., "deploy after 30 minutes")

```
Code merged to master
        │
        ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    CI Passes  │────▶│   Staging     │────▶│  Production   │
│               │     │   (auto)      │     │  (approval    │
│   lint ✅     │     │   Deploy ✅   │     │   required)   │
│   test ✅     │     │   Smoke ✅    │     │               │
│   e2e  ✅     │     │              │     │   👤 Approve? │
│   docker ✅   │     └───────────────┘     └───────────────┘
└───────────────┘
```

## Prerequisites

- **Repository admin access** on `maadityo/sample-roster-v2`
- Azure resources set up (from Steps 1-2)
- CD workflow created (from Step 2)

## Step-by-Step Instructions

### Step 4.1: Create the "staging" Environment

1. Go to your repository: https://github.com/maadityo/sample-roster-v2
2. Click **Settings** → **Environments** (left sidebar, under "Code and automation")
3. Click **New environment**
4. Name: `staging`
5. Click **Configure environment**

#### Settings for staging:

| Setting | Value | Why |
|---|---|---|
| Required reviewers | ❌ None | Staging deploys automatically — it's for testing |
| Wait timer | 0 minutes | No delay needed for staging |
| Deployment branches | `master` only | Only deploy from master |

#### Add environment secrets:

Click **Add secret** for each:

| Secret | Value |
|---|---|
| `AZURE_ACR_NAME` | `acrkakakstaging` (or same ACR with different tag) |
| `CONTAINER_APP_NAME` | `ca-kakak-staging` |
| `RESOURCE_GROUP` | `rg-kakak-staging` |

### Step 4.2: Create the "production" Environment

1. Back to **Settings** → **Environments** → **New environment**
2. Name: `production`
3. Click **Configure environment**

#### Settings for production:

| Setting | Value | Why |
|---|---|---|
| **Required reviewers** | ✅ Add yourself (and team leads) | Human must approve before production deploy |
| Wait timer | 0 (or 5-15 minutes for cool-down) | Optional "are you sure?" delay |
| Deployment branches | `master` only | Only deploy from master |

#### Add environment secrets:

| Secret | Value |
|---|---|
| `AZURE_ACR_NAME` | `acrkakakprod` |
| `CONTAINER_APP_NAME` | `ca-kakak-prod` |
| `RESOURCE_GROUP` | `rg-kakak-prod` |

> **Environment secrets vs. repository secrets:**
> - **Repository secrets** are available to all workflows
> - **Environment secrets** are only available when a workflow runs in that specific environment
> - This means your production database URL is never accessible to staging deployments

### Step 4.3: Update the CD Workflow to Use Environments

Replace your `deploy.yml` with a multi-environment version:

```yaml
name: CD — Deploy to Azure

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [master]

permissions:
  id-token: write
  contents: read

env:
  IMAGE_NAME: kakak

jobs:
  # ── Stage 1: Deploy to Staging (automatic) ──
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging  # ← Links to the "staging" environment
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push'

    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Build and push to ACR
        run: |
          SHORT_SHA="${{ github.event.workflow_run.head_sha }}"
          SHORT_SHA="${SHORT_SHA:0:7}"
          ACR_NAME="${{ secrets.AZURE_ACR_NAME }}"

          az acr login --name $ACR_NAME
          docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA \
                       -t $ACR_NAME.azurecr.io/$IMAGE_NAME:latest .
          docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA
          docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:latest
          echo "IMAGE_TAG=$SHORT_SHA" >> $GITHUB_ENV
          echo "ACR_NAME=$ACR_NAME" >> $GITHUB_ENV

      - name: Deploy to Staging
        run: |
          az containerapp update \
            --name ${{ secrets.CONTAINER_APP_NAME }} \
            --resource-group ${{ secrets.RESOURCE_GROUP }} \
            --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

      - name: Smoke Test
        run: |
          FQDN=$(az containerapp show \
            --name ${{ secrets.CONTAINER_APP_NAME }} \
            --resource-group ${{ secrets.RESOURCE_GROUP }} \
            --query "properties.configuration.ingress.fqdn" -o tsv)
          sleep 30
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$FQDN")
          echo "Staging health check: $STATUS"
          [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 400 ]

  # ── Stage 2: Deploy to Production (requires approval) ──
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging       # ← Only runs after staging succeeds
    environment: production     # ← Triggers the approval gate!
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push'

    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Production
        run: |
          SHORT_SHA="${{ github.event.workflow_run.head_sha }}"
          SHORT_SHA="${SHORT_SHA:0:7}"
          ACR_NAME="${{ secrets.AZURE_ACR_NAME }}"

          az containerapp update \
            --name ${{ secrets.CONTAINER_APP_NAME }} \
            --resource-group ${{ secrets.RESOURCE_GROUP }} \
            --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$SHORT_SHA

      - name: Verify Production
        run: |
          FQDN=$(az containerapp show \
            --name ${{ secrets.CONTAINER_APP_NAME }} \
            --resource-group ${{ secrets.RESOURCE_GROUP }} \
            --query "properties.configuration.ingress.fqdn" -o tsv)
          echo "🚀 Production deployed: https://$FQDN"
```

## How the Approval Flow Works

When the workflow reaches the `deploy-production` job:

1. GitHub **pauses the workflow** and shows a yellow "Waiting" status
2. The required reviewers receive an **email notification**
3. On the workflow run page, you'll see:

```
┌──────────────────────────────────────────────┐
│  ⏳ Waiting for review                      │
│                                              │
│  deploy-production requires approval from:   │
│  • @maadityo                                 │
│                                              │
│  [ Review deployments ]                      │
└──────────────────────────────────────────────┘
```

4. Click **Review deployments** → Select "production" → Click **Approve and deploy**
5. The production deployment proceeds

### Rejecting a deployment

If you spot something wrong in staging, click **Reject** instead. The workflow will be cancelled and nothing is deployed to production.

## Viewing Deployment History

Go to your repository → **Deployments** (in the sidebar or via the "Environments" link). You'll see:

```
production
  ✅ #42 — Deployed by @maadityo — 2 hours ago — commit a1b2c3d
  ✅ #41 — Deployed by @maadityo — 1 day ago — commit e5f6g7h
  ❌ #40 — Rejected by @maadityo — 2 days ago

staging
  ✅ #42 — Auto-deployed — 2 hours ago — commit a1b2c3d
  ✅ #41 — Auto-deployed — 1 day ago — commit e5f6g7h
  ✅ #40 — Auto-deployed — 2 days ago — commit i9j0k1l
```

This gives you a complete audit trail of every deployment.

## Environment Protection Rules Summary

| Feature | Staging | Production |
|---|---|---|
| Auto-deploy | ✅ Yes | ❌ No (requires approval) |
| Required reviewers | None | 1+ team leads |
| Wait timer | 0 min | 0-15 min (optional) |
| Secrets | Staging DB, ACR | Production DB, ACR |
| Branch restriction | master only | master only |

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| No approval prompt appears | Environment name in workflow doesn't match GitHub config | Ensure `environment: production` matches exactly |
| Reviewer doesn't get email | GitHub notification settings | Check Settings → Notifications → ensure "Deployments" is enabled |
| Secrets not available | Wrong environment name | Double-check the environment name is identical in workflow and GitHub settings |

## What's Next?

Now that you have staged deployments with approval gates, the next step is **Step 5: Infrastructure as Code with Azure Bicep** to define your Azure resources as version-controlled code.

---

## References

- [GitHub: Using environments for deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub: Reviewing deployments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/reviewing-deployments)
- [GitHub: Environment protection rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#environment-protection-rules)
