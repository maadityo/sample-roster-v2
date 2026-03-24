# Step 1: Set Up OIDC Federated Identity for GitHub → Azure Authentication

## Why This Matters

Right now, if you want GitHub Actions to deploy to Azure, you'd typically store an Azure service principal secret (`AZURE_CREDENTIALS`) as a GitHub secret. This approach has problems:

- **Secrets expire** — Azure AD app credentials expire (max 2 years), and your pipeline silently breaks when they do.
- **Secrets can leak** — Anyone with repo admin access can read the secret value.
- **No audit trail** — It's hard to track which pipeline run used which credential.

**OIDC (OpenID Connect) federated identity** solves all of this. Instead of storing a long-lived password, GitHub Actions requests a **short-lived token** directly from Azure AD every time a workflow runs. No secrets to rotate, no credentials to leak.

```
┌──────────────┐    1. "I am repo X, branch Y"    ┌──────────────┐
│   GitHub      │ ─────────────────────────────────▶│   Azure AD   │
│   Actions     │                                   │   (Entra ID) │
│   Runner      │ ◀─────────────────────────────────│              │
└──────────────┘    2. "Here's a 1-hour token"     └──────────────┘
       │                                                  │
       │          3. Use token to deploy                  │
       ▼                                                  │
┌──────────────┐                                          │
│   Azure       │  ◀──── Trust relationship ──────────────┘
│   Resources   │        (federated credential)
└──────────────┘
```

## Prerequisites

- An Azure subscription with **Owner** or **Contributor + User Access Administrator** role
- Azure CLI installed locally (`az` command) — [Install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- Your GitHub repository: `maadityo/sample-roster-v2`

## Step-by-Step Instructions

### Step 1.1: Log in to Azure CLI

```bash
az login
```

Verify you're in the correct subscription:

```bash
az account show --query "{name:name, id:id}" -o table
```

### Step 1.2: Create a Resource Group (if you don't have one)

```bash
# Choose a location close to you (e.g., eastasia, southeastasia, australiaeast)
az group create \
  --name rg-kakak-prod \
  --location australiaeast
```

> **What is a Resource Group?**
> A Resource Group is a logical container in Azure that holds related resources (databases, web apps, etc.). Think of it like a folder — when you delete the folder, everything inside is deleted too.

### Step 1.3: Create an Azure AD App Registration

This creates an "identity" that GitHub Actions will use to authenticate:

```bash
az ad app create --display-name "github-actions-kakak"
```

Save the output `appId` — you'll need it. Let's also store it in a variable:

```bash
APP_ID=$(az ad app list --display-name "github-actions-kakak" --query "[0].appId" -o tsv)
echo "App ID: $APP_ID"
```

### Step 1.4: Create a Service Principal for the App

A service principal is the "runtime identity" tied to the app registration:

```bash
az ad sp create --id $APP_ID
```

### Step 1.5: Assign the Service Principal a Role on Your Resource Group

Grant it **Contributor** access to the resource group where you'll deploy:

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

az role assignment create \
  --assignee $APP_ID \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-kakak-prod"
```

> **What is the Contributor role?**
> It allows creating, updating, and deleting Azure resources within the scope, but it cannot manage access (i.e., it can't give other users permissions). This follows the **principle of least privilege**.

### Step 1.6: Add Federated Credentials for GitHub

This is the key step — you're telling Azure AD: "Trust tokens that come from GitHub Actions for this specific repository."

You need to create **two federated credentials** — one for your `master` branch (for deployments on push) and one for pull requests (for CI checks):

#### Credential for `master` branch:

```bash
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-master",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:maadityo/sample-roster-v2:ref:refs/heads/master",
    "description": "GitHub Actions - master branch",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

#### Credential for pull requests:

```bash
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-pull-request",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:maadityo/sample-roster-v2:pull_request",
    "description": "GitHub Actions - pull requests",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

#### (Optional) Credential for a specific environment (e.g., "production"):

```bash
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-production",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:maadityo/sample-roster-v2:environment:production",
    "description": "GitHub Actions - production environment",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

> **How does the `subject` claim work?**
> Azure AD checks the `subject` field against the token GitHub sends. If you configure `ref:refs/heads/master`, only workflows running on the `master` branch can authenticate. This prevents a rogue PR from deploying to production.

### Step 1.7: Add GitHub Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** and add:

| Secret Name | Value | How to Get It |
|---|---|---|
| `AZURE_CLIENT_ID` | The App Registration's Application (client) ID | `az ad app list --display-name "github-actions-kakak" --query "[0].appId" -o tsv` |
| `AZURE_TENANT_ID` | Your Azure AD tenant ID | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID | `az account show --query id -o tsv` |

> **Note:** There is NO client secret! That's the whole point of OIDC — no passwords to store or rotate.

### Step 1.8: Use OIDC in Your GitHub Actions Workflow

Here's how to use it in a workflow file. Add these `permissions` and the `azure/login` step:

```yaml
# .github/workflows/deploy.yml (example snippet)
name: Deploy to Azure

on:
  push:
    branches: [master]

# REQUIRED: These permissions allow the workflow to request an OIDC token
permissions:
  id-token: write   # Needed to get the OIDC token
  contents: read     # Needed to checkout code

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # After this step, you can use any Azure CLI command
      - name: Verify Azure connection
        run: |
          az account show
          az group list -o table
```

## How to Verify It Works

1. Push a commit to `master` or open a PR
2. In the workflow run, the "Azure Login (OIDC)" step should show:
   ```
   Login successful.
   ```
3. The "Verify Azure connection" step should show your subscription details

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `AADSTS70021: No matching federated identity record found` | The `subject` claim doesn't match | Check that the branch name or environment name in the federated credential matches exactly |
| `AADSTS700016: Application not found` | Wrong `AZURE_CLIENT_ID` | Re-run `az ad app list --display-name "github-actions-kakak"` and verify the appId |
| `Error: Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | Missing `permissions: id-token: write` | Add the `permissions` block to your workflow |

## Clean Up (If Needed)

If you ever want to remove this setup:

```bash
# Delete the app registration (also removes service principal and federated creds)
az ad app delete --id $APP_ID
```

## What's Next?

Once OIDC is configured, you're ready for **Step 2: Create a CD Workflow** that uses this authentication to deploy your Docker image to Azure Container Apps.

---

## References

- [Microsoft: Configure OIDC for GitHub Actions](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-github)
- [GitHub: Configuring OpenID Connect in Azure](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-azure)
- [azure/login Action](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended)
