#!/usr/bin/env bash
# =============================================================================
# scripts/azure-setup.sh — One-time Azure infrastructure provisioning
#
# SAFE TO COMMIT: contains only resource names/shapes, never secret values.
# Idempotent — safe to re-run. Skips resources that already exist.
#
# ── Quick start ───────────────────────────────────────────────────────────────
#   cp scripts/.azure.local.example scripts/.azure.local
#   # Fill in POSTGRES_SERVER (and any name overrides) in .azure.local
#   az login
#   az account set --subscription "your-subscription-name-or-id"
#   bash scripts/azure-setup.sh
#
# ── What this creates (skips if already exists) ───────────────────────────────
#   · Managed Identity     umi-kakak-prod-01
#   · Container Registry   acrkakakprod01   (Basic, no admin password)
#   · Container Apps Env   cae-kakak-prod
#   · Container App        ca-kakak-prod-01 (placeholder; replaced on first CI deploy)
#   · App Registration     sp-kakak-github-actions  (OIDC for GitHub Actions)
#   · OIDC credentials     master branch + pull_request
#   · Role assignments     AcrPush (SP), AcrPull (MI), Contributor on RG (SP)
#   · Key Vault RBAC       Secrets Officer (you), Secrets User (MI)
#   · PostgreSQL Entra ID  Managed Identity as Entra admin (passwordless)
#
# ── Already exists — discovered, not recreated ────────────────────────────────
#   · Resource Group       rg-kakak-prod-eau
#   · Key Vault            akv-prod-eau-01
#   · PostgreSQL Server    (you specify the name in .azure.local)
# =============================================================================

set -euo pipefail

# ── Git Bash on Windows: prevent /path → C:\path conversion ──────────────────
export MSYS_NO_PATHCONV=1

# ── Defaults (can be overridden in scripts/.azure.local) ─────────────────────
RESOURCE_GROUP="rg-kakak-prod-eau"
KEY_VAULT="akv-prod-eau-01"
KEY_VAULT_RG="rg-security-prod-eau"  # set explicitly — KV lives in a separate security RG
IDENTITY_RG="rg-identity-prod"       # set explicitly — MI lives in a separate identity RG
MANAGED_IDENTITY="umi-kakak-prod-01"
ACR_NAME="acrkakakprod01"
CAE_NAME="cae-kakak-prod"
CONTAINER_APP="ca-kakak-prod-01"
APP_REGISTRATION="sp-kakak-github-actions"
POSTGRES_SERVER=""          # REQUIRED — set in .azure.local
GITHUB_REPO="maadityo/sample-roster-v2"
LOCATION="australiaeast"
DB_NAME="kakak"

# ── Load local overrides (gitignored file, never committed) ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_FILE="$SCRIPT_DIR/.azure.local"

if [[ -f "$LOCAL_FILE" ]]; then
  echo "[local] Loading $LOCAL_FILE"
  # Strip Windows CRLF line endings before sourcing (file may be edited on Windows)
  # shellcheck disable=SC1090
  source <(sed 's/\r//' "$LOCAL_FILE")
else
  echo "[local] No $LOCAL_FILE found — using defaults"
  echo "        Tip: cp scripts/.azure.local.example scripts/.azure.local"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "\033[0;34m[INFO]\033[0m  $*"; }
success() { echo -e "\033[0;32m[OK]\033[0m    $*"; }
warn()    { echo -e "\033[0;33m[SKIP]\033[0m  $*"; }
err()     { echo -e "\033[0;31m[ERR]\033[0m   $*" >&2; exit 1; }
heading() { echo -e "\n\033[1;37m── $* ──\033[0m"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
heading "Preflight"

command -v az &>/dev/null || err "Azure CLI not found. Install: https://aka.ms/installazurecli"
az account show &>/dev/null   || err "Not logged in. Run: az login"

if [[ -z "$POSTGRES_SERVER" ]]; then
  err "POSTGRES_SERVER is not set.\n       Set it in scripts/.azure.local:\n         POSTGRES_SERVER=your-existing-server-name"
fi

# Resolve KEY_VAULT_RG — default to RESOURCE_GROUP if not set
KEY_VAULT_RG="${KEY_VAULT_RG:-$RESOURCE_GROUP}"

if [[ "$KEY_VAULT_RG" != "$RESOURCE_GROUP" ]]; then
  info "Key Vault RG ($KEY_VAULT_RG) differs from app RG ($RESOURCE_GROUP)"
  info "SP and MI role assignments will be scoped to the KV in $KEY_VAULT_RG"
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
CURRENT_USER_OID=$(az ad signed-in-user show --query id -o tsv)
SUB_NAME=$(az account show --query name -o tsv)

info "Subscription : $SUB_NAME ($SUBSCRIPTION_ID)"
info "Tenant       : $TENANT_ID"
info "Repo (OIDC)  : $GITHUB_REPO"
echo ""

# Verify the resource group exists (should have been created manually)
az group show --name "$RESOURCE_GROUP" &>/dev/null \
  || err "Resource group '$RESOURCE_GROUP' not found in this subscription.\n       Create it first or switch subscription/tenant."

# Verify Key Vault exists (should have been created manually)
az keyvault show --name "$KEY_VAULT" --resource-group "$KEY_VAULT_RG" &>/dev/null \
  || err "Key Vault '$KEY_VAULT' not found in '$KEY_VAULT_RG'. Create it first or check KEY_VAULT_RG."

# Verify PostgreSQL exists
az postgres flexible-server show \
  --name "$POSTGRES_SERVER" \
  --resource-group "$RESOURCE_GROUP" &>/dev/null \
  || err "PostgreSQL server '$POSTGRES_SERVER' not found in '$RESOURCE_GROUP'."

echo "Existing resources verified ✓"
echo ""
echo "Will create (if missing):"
echo "  · Managed Identity:    $MANAGED_IDENTITY"
echo "  · Container Registry:  $ACR_NAME"
echo "  · Container Apps Env:  $CAE_NAME"
echo "  · Container App:       $CONTAINER_APP"
echo "  · App Registration:    $APP_REGISTRATION + OIDC credentials"
echo "  · Role assignments across the above resources"
echo ""
read -rp "Continue? [y/N] " _confirm
[[ "$_confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── 1. Managed Identity ───────────────────────────────────────────────────────
heading "1 / 6  Managed Identity"

if az identity show --name "$MANAGED_IDENTITY" --resource-group "$IDENTITY_RG" &>/dev/null; then
  warn "'$MANAGED_IDENTITY' already exists in $IDENTITY_RG — skipping"
else
  az identity create \
    --name "$MANAGED_IDENTITY" \
    --resource-group "$IDENTITY_RG" \
    --output none
  success "Created: $MANAGED_IDENTITY in $IDENTITY_RG"
fi

MI_CLIENT_ID=$(az identity show \
  --name "$MANAGED_IDENTITY" \
  --resource-group "$IDENTITY_RG" \
  --query clientId -o tsv)
MI_RESOURCE_ID=$(az identity show \
  --name "$MANAGED_IDENTITY" \
  --resource-group "$IDENTITY_RG" \
  --query id -o tsv)
MI_PRINCIPAL_ID=$(az identity show \
  --name "$MANAGED_IDENTITY" \
  --resource-group "$IDENTITY_RG" \
  --query principalId -o tsv)

info "Client ID  : $MI_CLIENT_ID"

# ── 2. Key Vault RBAC (idempotent) ────────────────────────────────────────────
heading "2 / 6  Key Vault RBAC"

KV_RESOURCE_ID=$(az keyvault show \
  --name "$KEY_VAULT" \
  --resource-group "$KEY_VAULT_RG" \
  --query id -o tsv)
KV_URL="https://${KEY_VAULT}.vault.azure.net/"

# Confirm KV is in RBAC mode (not access policies)
KV_RBAC=$(az keyvault show \
  --name "$KEY_VAULT" \
  --resource-group "$KEY_VAULT_RG" \
  --query properties.enableRbacAuthorization -o tsv)
if [[ "$KV_RBAC" != "true" ]]; then
  info "Enabling RBAC authorization on Key Vault..."
  az keyvault update \
    --name "$KEY_VAULT" \
    --resource-group "$KEY_VAULT_RG" \
    --enable-rbac-authorization true \
    --output none
  success "Key Vault RBAC mode enabled"
else
  info "Key Vault already in RBAC mode ✓"
fi

# Key Vault Secrets Officer → current CLI user (so you can write secrets)
az role assignment create \
  --assignee "$CURRENT_USER_OID" \
  --role "Key Vault Secrets Officer" \
  --scope "$KV_RESOURCE_ID" \
  --output none 2>/dev/null \
  && success "Granted: Secrets Officer (current user)" \
  || warn "Secrets Officer already assigned to current user"

# Key Vault Secrets User → managed identity (runtime secret reads)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KV_RESOURCE_ID" \
  --output none 2>/dev/null \
  && success "Granted: Secrets User (managed identity)" \
  || warn "Secrets User already assigned to managed identity"

# ── 3. PostgreSQL Entra ID authentication (passwordless) ──────────────────────
heading "3 / 6  PostgreSQL → Entra ID (passwordless)"

PSQL_FQDN=$(az postgres flexible-server show \
  --name "$POSTGRES_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --query fullyQualifiedDomainName -o tsv)

# Allow Azure services to connect (0.0.0.0 rule = Azure backbone access)
if ! az postgres flexible-server firewall-rule show \
       --rule-name allow-azure-services \
       --resource-group "$RESOURCE_GROUP" \
       --name "$POSTGRES_SERVER" &>/dev/null; then
  az postgres flexible-server firewall-rule create \
    --rule-name allow-azure-services \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER" \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0 \
    --output none
  success "PostgreSQL firewall: Azure services allowed"
else
  warn "Firewall rule 'allow-azure-services' already exists"
fi

# Verify Entra admin is set on the PostgreSQL server
ENTRA_ADMIN_COUNT=$(az postgres flexible-server microsoft-entra-admin list \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" \
  --query "length(@)" -o tsv 2>/dev/null || echo "0")

if [[ "$ENTRA_ADMIN_COUNT" -eq 0 ]]; then
  info "Setting $MANAGED_IDENTITY as Entra admin on $POSTGRES_SERVER..."
  az postgres flexible-server microsoft-entra-admin create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$POSTGRES_SERVER" \
    --display-name "$MANAGED_IDENTITY" \
    --object-id "$MI_PRINCIPAL_ID" \
    --type ServicePrincipal \
    --output none
  success "Entra admin set: $MANAGED_IDENTITY"
else
  info "Entra admin already configured on $POSTGRES_SERVER ✓"
fi

echo ""
info "PostgreSQL FQDN: $PSQL_FQDN"
echo ""
echo "  Next: create the PostgreSQL role for the managed identity."
echo "  Connect as Entra admin and run:"
echo ""
echo "  # Get token + connect"
echo "  export PGPASSWORD=\$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)"
echo "  psql \"host=$PSQL_FQDN dbname=postgres user=$MANAGED_IDENTITY sslmode=require\""
echo ""
echo "  # Then run in psql:"
echo "  SELECT * FROM pgaadauth_create_principal_with_oid('$MANAGED_IDENTITY', '$MI_PRINCIPAL_ID', 'service', false, false);"
echo ""
echo "  # Switch to kakak database and grant permissions:"
echo "  \\c kakak"
echo "  GRANT ALL PRIVILEGES ON DATABASE kakak TO \"$MANAGED_IDENTITY\";"
echo "  GRANT ALL ON ALL TABLES IN SCHEMA public TO \"$MANAGED_IDENTITY\";"
echo "  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO \"$MANAGED_IDENTITY\";"
echo "  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$MANAGED_IDENTITY\";"
echo "  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"$MANAGED_IDENTITY\";"
echo ""
read -rp "Press ENTER once you have run those commands (or CTRL+C to abort) "

# ── 4. Container Registry ─────────────────────────────────────────────────────
heading "4 / 6  Container Registry"

if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  warn "'$ACR_NAME' already exists — skipping"
else
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Basic \
    --admin-enabled false \
    --output none
  success "Created: $ACR_NAME (Basic, admin disabled)"
fi

ACR_LOGIN_SERVER=$(az acr show \
  --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" \
  --query loginServer -o tsv)
ACR_RESOURCE_ID=$(az acr show \
  --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv)

info "Login server: $ACR_LOGIN_SERVER"

# AcrPull → managed identity (Container App pulls images at runtime)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPull" \
  --scope "$ACR_RESOURCE_ID" \
  --output none 2>/dev/null \
  && success "Granted: AcrPull (managed identity)" \
  || warn "AcrPull already assigned to managed identity"

# ── 5. Container Apps Environment + App ───────────────────────────────────────
heading "5 / 6  Container Apps"

az extension add --name containerapp --upgrade --output none 2>/dev/null || true

if az containerapp env show \
     --name "$CAE_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  warn "Environment '$CAE_NAME' already exists — skipping"
else
  az containerapp env create \
    --name "$CAE_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
  success "Created: $CAE_NAME"
fi

if az containerapp show \
     --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  warn "Container App '$CONTAINER_APP' already exists — skipping"
else
  az containerapp create \
    --name "$CONTAINER_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CAE_NAME" \
    --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
    --target-port 80 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 3 \
    --user-assigned "$MI_RESOURCE_ID" \
    --env-vars \
        "AZURE_KEY_VAULT_URL=${KV_URL}" \
        "AZURE_CLIENT_ID=${MI_CLIENT_ID}" \
        "POSTGRES_HOST=${PSQL_FQDN}" \
        "NEXTAUTH_URL=https://placeholder.update-after-first-deploy.example" \
        "MAX_ABSENCES_PER_MONTH=2" \
        "MAX_ABSENCES_PER_SUNDAY=3" \
    --output none
  success "Created placeholder Container App: $CONTAINER_APP"
fi

APP_FQDN=$(az containerapp show \
  --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

info "App FQDN: $APP_FQDN"

# ── 6. App Registration + OIDC + Role assignments ─────────────────────────────
heading "6 / 6  App Registration & OIDC"

EXISTING_APP_ID=$(az ad app list \
  --display-name "$APP_REGISTRATION" \
  --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [[ -n "$EXISTING_APP_ID" && "$EXISTING_APP_ID" != "None" ]]; then
  warn "'$APP_REGISTRATION' already exists (appId: $EXISTING_APP_ID)"
  APP_ID="$EXISTING_APP_ID"
else
  APP_ID=$(az ad app create \
    --display-name "$APP_REGISTRATION" \
    --query appId -o tsv)
  success "Created app registration: $APP_REGISTRATION ($APP_ID)"
fi

# Service principal
if ! az ad sp show --id "$APP_ID" &>/dev/null; then
  az ad sp create --id "$APP_ID" --output none
  success "Created service principal"
else
  warn "Service principal already exists"
fi
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)

# OIDC — master branch
if ! az ad app federated-credential list --id "$APP_ID" \
       --query "[?name=='github-actions-master'].name" -o tsv 2>/dev/null | grep -q .; then
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"github-actions-master\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_REPO}:ref:refs/heads/master\",
    \"description\": \"GitHub Actions — master branch\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
  success "OIDC credential: master branch"
else
  warn "OIDC 'github-actions-master' already exists"
fi

# OIDC — pull requests
if ! az ad app federated-credential list --id "$APP_ID" \
       --query "[?name=='github-actions-pull-request'].name" -o tsv 2>/dev/null | grep -q .; then
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"github-actions-pull-request\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_REPO}:pull_request\",
    \"description\": \"GitHub Actions — pull requests\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
  success "OIDC credential: pull requests"
else
  warn "OIDC 'github-actions-pull-request' already exists"
fi

RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"

# Contributor on RG → SP (deploy Container Apps, update jobs)
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "$RG_SCOPE" \
  --output none 2>/dev/null \
  && success "Granted: Contributor on $RESOURCE_GROUP (service principal)" \
  || warn "Contributor already assigned to service principal"

# AcrPush → SP (push Docker images from CI)
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPush" \
  --scope "$ACR_RESOURCE_ID" \
  --output none 2>/dev/null \
  && success "Granted: AcrPush on $ACR_NAME (service principal)" \
  || warn "AcrPush already assigned to service principal"

# ── Summary ───────────────────────────────────────────────────────────────────
NEXTAUTH_URL_VAL="https://${APP_FQDN}"

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║  Infrastructure ready — 2 steps remaining                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"

echo ""
echo "┌───────────────────────────────────────────────────────────────────────┐"
echo "│  STEP A — Add these 11 values as GitHub Actions Secrets              │"
echo "│  Repo → Settings → Secrets and variables → Actions                  │"
echo "└───────────────────────────────────────────────────────────────────────┘"
echo ""
printf "  %-35s  %s\n" "Secret name"                   "Value"
printf "  %-35s  %s\n" "──────────────────────────────" "───────────────────────────────"
printf "  %-35s  %s\n" "AZURE_CLIENT_ID"               "$APP_ID"
printf "  %-35s  %s\n" "AZURE_TENANT_ID"               "$TENANT_ID"
printf "  %-35s  %s\n" "AZURE_SUBSCRIPTION_ID"         "$SUBSCRIPTION_ID"
printf "  %-35s  %s\n" "ACR_NAME"                      "$ACR_NAME"
printf "  %-35s  %s\n" "ACR_LOGIN_SERVER"              "$ACR_LOGIN_SERVER"
printf "  %-35s  %s\n" "RESOURCE_GROUP"                "$RESOURCE_GROUP"
printf "  %-35s  %s\n" "CONTAINER_APP_NAME"            "$CONTAINER_APP"
printf "  %-35s  %s\n" "MANAGED_IDENTITY_CLIENT_ID"    "$MI_CLIENT_ID"
printf "  %-35s  %s\n" "MANAGED_IDENTITY_RESOURCE_ID"  "$MI_RESOURCE_ID"
printf "  %-35s  %s\n" "KEY_VAULT_URL"                 "$KV_URL"
printf "  %-35s  %s\n" "POSTGRES_HOST"                 "$PSQL_FQDN"
printf "  %-35s  %s\n" "NEXTAUTH_URL"                  "$NEXTAUTH_URL_VAL"
echo ""

echo "┌───────────────────────────────────────────────────────────────────────┐"
echo "│  STEP B — Add 3 remaining Key Vault secrets (run locally)            │"
echo "└───────────────────────────────────────────────────────────────────────┘"
echo ""
echo "  # Generate NEXTAUTH_SECRET:"
echo "  openssl rand -base64 32"
echo "  az keyvault secret set --vault-name \"$KEY_VAULT\" \\"
echo "    --name sc-nextauth-kakak-sec --value \"<PASTE_ABOVE>\""
echo ""
echo "  az keyvault secret set --vault-name \"$KEY_VAULT\" \\"
echo "    --name sc-goauth-client-id --value \"<GOOGLE_CLIENT_ID>\""
echo ""
echo "  az keyvault secret set --vault-name \"$KEY_VAULT\" \\"
echo "    --name sc-goauth-client-sc --value \"<GOOGLE_CLIENT_SECRET>\""
echo ""
echo "  Then push to master to trigger the first deployment:"
echo "  git commit --allow-empty -m 'chore: trigger first Azure deploy'"
echo "  git push origin master"
echo ""
echo "  After deploy, update NEXTAUTH_URL GitHub Secret to the live FQDN."
