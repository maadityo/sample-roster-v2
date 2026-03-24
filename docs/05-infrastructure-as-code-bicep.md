# Step 5: Infrastructure as Code (IaC) with Azure Bicep

## Why This Matters

So far, you've been creating Azure resources (Container Registry, Container Apps, etc.) using **manual `az` commands** in the terminal. This has several problems:

- **Not repeatable** — If you need a second environment (staging), you have to remember and re-run every command
- **No version control** — If someone changes a setting in the Azure portal, there's no record of what changed
- **Drift** — The actual infrastructure slowly diverges from what you intended
- **Disaster recovery** — If the resource group is accidentally deleted, you can't easily recreate everything

**Infrastructure as Code (IaC)** means you define your Azure resources in code files that are:
- ✅ Version-controlled (in git, reviewed in PRs)
- ✅ Repeatable (run the same template to create staging, production, DR environments)
- ✅ Self-documenting (the code IS the documentation of your infrastructure)
- ✅ Auditable (git history shows who changed what and when)

```
❌ Before (manual):
$ az containerapp create --name ca-kakak-prod --resource-group rg-kakak-prod ...
$ az acr create --name acrkakakprod ...
# 6 months later: "What settings did I use? I don't remember..."

✅ After (IaC):
$ az deployment group create --template-file infra/main.bicep --parameters env=prod
# All resources created exactly as defined. Same command works for staging.
```

## Why Bicep (and not Terraform)?

| Feature | Bicep | Terraform |
|---|---|---|
| Provider | Azure-native (by Microsoft) | Multi-cloud |
| Syntax | Clean, concise | HCL (also clean) |
| State file | No (Azure is the source of truth) | Yes (must manage `.tfstate`) |
| Learning curve | Low (if you know Azure) | Medium |
| Best for | Azure-only projects | Multi-cloud projects |

**For your project** (Azure-only with Container Apps, ACR, Key Vault, PostgreSQL), **Bicep is the best choice** — simpler, no state file to manage, and first-class Azure support.

## Prerequisites

- Azure CLI installed with Bicep support (included in modern az CLI)
- Verify: `az bicep version` (if not installed: `az bicep install`)

## Step-by-Step Instructions

### Step 5.1: Create the Infrastructure Directory Structure

```
infra/
├── main.bicep              # Entry point — orchestrates all modules
├── main.bicepparam         # Parameter values (per environment)
├── modules/
│   ├── containerRegistry.bicep
│   ├── containerApp.bicep
│   ├── containerAppEnv.bicep
│   ├── keyVault.bicep
│   └── postgreSQL.bicep
```

### Step 5.2: Create the Main Bicep Template

Create `infra/main.bicep`:

```bicep
// ── Parameters ──────────────────────────────────────────────────────────────
@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Container image to deploy (e.g., acrkakakprod.azurecr.io/kakak:latest)')
param containerImage string = ''

// ── Variables ───────────────────────────────────────────────────────────────
var envSuffix = environment == 'prod' ? 'prod' : environment
var acrName = 'acrkakak${envSuffix}'
var tags = {
  project: 'kakak'
  environment: environment
  managedBy: 'bicep'
}

// ── Module: Azure Container Registry ────────────────────────────────────────
module acr 'modules/containerRegistry.bicep' = {
  name: 'acr-${envSuffix}'
  params: {
    name: acrName
    location: location
    tags: tags
  }
}

// ── Module: Azure Key Vault ─────────────────────────────────────────────────
module keyVault 'modules/keyVault.bicep' = {
  name: 'kv-${envSuffix}'
  params: {
    name: 'akv-${envSuffix}-eau-01'
    location: location
    tags: tags
  }
}

// ── Module: Container Apps Environment ──────────────────────────────────────
module containerAppEnv 'modules/containerAppEnv.bicep' = {
  name: 'cae-${envSuffix}'
  params: {
    name: 'cae-kakak-${envSuffix}'
    location: location
    tags: tags
  }
}

// ── Module: Container App ───────────────────────────────────────────────────
module containerApp 'modules/containerApp.bicep' = {
  name: 'ca-${envSuffix}'
  params: {
    name: 'ca-kakak-${envSuffix}'
    location: location
    tags: tags
    environmentId: containerAppEnv.outputs.environmentId
    acrLoginServer: acr.outputs.loginServer
    containerImage: !empty(containerImage) ? containerImage : '${acr.outputs.loginServer}/kakak:latest'
    keyVaultUrl: keyVault.outputs.vaultUri
  }
}

// ── Outputs ─────────────────────────────────────────────────────────────────
output acrLoginServer string = acr.outputs.loginServer
output containerAppFqdn string = containerApp.outputs.fqdn
output keyVaultUri string = keyVault.outputs.vaultUri
```

### Step 5.3: Create the Modules

#### `infra/modules/containerRegistry.bicep`

```bicep
@description('Name of the container registry (globally unique)')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

output loginServer string = acr.properties.loginServer
output acrId string = acr.id
```

#### `infra/modules/keyVault.bicep`

```bicep
@description('Key Vault name')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

output vaultUri string = keyVault.properties.vaultUri
output keyVaultId string = keyVault.id
```

#### `infra/modules/containerAppEnv.bicep`

```bicep
@description('Container Apps Environment name')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    zoneRedundant: false
  }
}

output environmentId string = env.id
```

#### `infra/modules/containerApp.bicep`

```bicep
@description('Container App name')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Container Apps Environment resource ID')
param environmentId string

@description('ACR login server')
param acrLoginServer string

@description('Container image (full path with tag)')
param containerImage string

@description('Azure Key Vault URL')
param keyVaultUrl string

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'kakak'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_KEY_VAULT_URL', value: keyVaultUrl }
            { name: 'PORT', value: '3000' }
            { name: 'NODE_ENV', value: 'production' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
```

### Step 5.4: Create a Parameter File

Create `infra/main.bicepparam`:

```bicep
using './main.bicep'

param environment = 'prod'
```

### Step 5.5: Deploy the Infrastructure

```bash
# Preview what will be created (no actual changes)
az deployment group what-if \
  --resource-group rg-kakak-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam

# If the preview looks good, deploy
az deployment group create \
  --resource-group rg-kakak-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

> **What is `what-if`?**
> It's a dry-run that shows you what Azure would create, update, or delete — without actually doing anything. Always run `what-if` first!

### Step 5.6: Deploy a Different Environment (staging)

Create `infra/staging.bicepparam`:

```bicep
using './main.bicep'

param environment = 'staging'
```

```bash
# Create the staging resource group
az group create --name rg-kakak-staging --location australiaeast

# Deploy staging
az deployment group create \
  --resource-group rg-kakak-staging \
  --template-file infra/main.bicep \
  --parameters infra/staging.bicepparam
```

That's it! The same template, different parameters, creates an identical (but separate) environment.

### Step 5.7: (Optional) Add IaC Deployment to GitHub Actions

Add a workflow that deploys infrastructure changes:

```yaml
# .github/workflows/infra.yml
name: Infrastructure

on:
  push:
    branches: [master]
    paths:
      - 'infra/**'  # Only run when infra files change
  pull_request:
    branches: [master]
    paths:
      - 'infra/**'

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  preview:
    name: Preview Changes
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: What-If Preview
        run: |
          az deployment group what-if \
            --resource-group rg-kakak-prod \
            --template-file infra/main.bicep \
            --parameters infra/main.bicepparam \
            --no-pretty-print > /tmp/what-if-output.txt 2>&1
          cat /tmp/what-if-output.txt

      - name: Comment PR with preview
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const output = fs.readFileSync('/tmp/what-if-output.txt', 'utf8');
            const body = `## 🏗️ Infrastructure Changes Preview\n\n\`\`\`\n${output.substring(0, 60000)}\n\`\`\``;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

  deploy:
    name: Deploy Infrastructure
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy Infrastructure
        run: |
          az deployment group create \
            --resource-group rg-kakak-prod \
            --template-file infra/main.bicep \
            --parameters infra/main.bicepparam
```

## Key Concepts

### Idempotent Deployments

Bicep deployments are **idempotent** — running the same template twice does nothing the second time. If a resource already exists with the same settings, Azure skips it. This makes deployments safe to re-run.

### Modules

Modules let you organize your infrastructure into reusable pieces. Each module defines one resource type, and `main.bicep` wires them together. You can reuse the same module for staging and production with different parameters.

### Tags

Every resource gets tagged with `project`, `environment`, and `managedBy`. This helps with:
- **Cost tracking** — Filter Azure Cost Analysis by `project:kakak`
- **Governance** — Find all resources belonging to a specific environment
- **Cleanup** — Identify resources managed by Bicep vs. manually created

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `The resource name is already taken` | ACR names must be globally unique | Choose a different, more specific name |
| `Template validation failed` | Syntax error in Bicep | Run `az bicep build --file infra/main.bicep` to see detailed errors |
| `what-if` shows unexpected deletes | Resources not defined in template | Add missing resources to the template, or use `--mode Incremental` (default) |

## What's Next?

With infrastructure defined as code, the next step is **Step 6: PR Status Checks & CI Automation** to automatically comment test results and infrastructure changes on your PRs.

---

## References

- [Azure Bicep Documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview)
- [Bicep Playground (try in browser)](https://aka.ms/bicepdemo)
- [Azure Container Apps Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/containerapps)
- [Bicep vs Terraform comparison](https://learn.microsoft.com/en-us/azure/developer/terraform/comparing-terraform-and-bicep)
