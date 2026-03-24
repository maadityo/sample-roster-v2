# Step 7: Dependabot & Security Scanning

## Why This Matters

Your project has **30+ npm dependencies** (Next.js, Prisma, NextAuth, Playwright, etc.). Each dependency can have security vulnerabilities discovered at any time. Right now:

- **No automatic alerts** — If a critical vulnerability is found in `next@15.0.3`, you won't know until you manually check
- **No automatic updates** — Dependencies get stale, and updating 6 months of changes at once is painful and risky
- **No code scanning** — Potential security issues in your own code (SQL injection, XSS, etc.) go undetected

**Dependabot** and **GitHub Security features** solve this by:

1. ✅ **Dependabot Alerts** — Notifies you when a dependency has a known vulnerability
2. ✅ **Dependabot Version Updates** — Automatically opens PRs to update dependencies weekly
3. ✅ **Secret Scanning** — Detects accidentally committed API keys, passwords, tokens
4. ✅ **Code Scanning (CodeQL)** — Analyzes your source code for security vulnerabilities

```
┌─────────────────────────────────────────────────┐
│ Weekly (Monday 9 AM):                           │
│                                                  │
│  Dependabot checks all dependencies              │
│       │                                          │
│       ├── next 15.0.3 → 15.1.0 available        │
│       │   └── Opens PR: "Bump next to 15.1.0"   │
│       │                                          │
│       ├── prisma 5.22.0 → 5.23.0 available      │
│       │   └── Opens PR: "Bump prisma to 5.23.0" │
│       │                                          │
│       └── zod 4.3.6 (no update)                  │
│           └── Skip                               │
│                                                  │
│  Each PR runs your CI pipeline automatically!    │
│  If tests pass ✅ → safe to merge                │
│  If tests fail ❌ → investigate before merging   │
└─────────────────────────────────────────────────┘
```

## Prerequisites

- Repository admin access on `maadityo/sample-roster-v2`
- CI workflow (`ci.yml`) already working (to validate Dependabot PRs)

## Step-by-Step Instructions

### Step 7.1: Create Dependabot Configuration

Create the file `.github/dependabot.yml`:

```yaml
# .github/dependabot.yml
# Docs: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file

version: 2
updates:
  # ── npm dependencies ─────────────────────────────────────────
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Jakarta"    # Adjust to your timezone
    # Group related updates into a single PR to reduce noise
    groups:
      # Group all production dependencies together
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "minor"
          - "patch"
      # Group all dev dependencies together
      dev-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
    # Limit the number of open PRs at a time
    open-pull-requests-limit: 10
    # Auto-assign reviewers
    reviewers:
      - "maadityo"
    # Add labels to Dependabot PRs
    labels:
      - "dependencies"
      - "automated"
    # Commit message preferences
    commit-message:
      prefix: "chore"
      include: "scope"
    # Allow specific major version updates (breaking changes)
    # These create individual PRs so you can review carefully
    allow:
      - dependency-type: "all"

  # ── GitHub Actions dependencies ──────────────────────────────
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Jakarta"
    labels:
      - "dependencies"
      - "ci"
    # Keep actions up to date (e.g., actions/checkout@v4 → v5)
    reviewers:
      - "maadityo"
```

> **What does each section mean?**
> - `package-ecosystem: "npm"` — Scan `package.json` and `package-lock.json` for updates
> - `package-ecosystem: "github-actions"` — Scan workflow files for action version updates
> - `groups` — Combine multiple minor/patch updates into one PR (reduces noise)
> - `open-pull-requests-limit: 10` — Don't create more than 10 PRs at once
> - `schedule.interval: "weekly"` — Check once a week (daily is also an option but can be noisy)

### Step 7.2: Enable Dependabot Alerts

1. Go to repository → **Settings** → **Code security and analysis**
2. Enable:
   - ✅ **Dependency graph** (usually enabled by default)
   - ✅ **Dependabot alerts** — Notifies you of known vulnerabilities
   - ✅ **Dependabot security updates** — Auto-creates PRs for vulnerable dependencies

> **Dependabot Alerts vs. Version Updates:**
> - **Alerts + Security Updates**: React to known CVEs immediately (creates PRs for critical fixes)
> - **Version Updates** (from `dependabot.yml`): Proactively keep dependencies current on a schedule

### Step 7.3: Enable Secret Scanning

1. Go to repository → **Settings** → **Code security and analysis**
2. Enable:
   - ✅ **Secret scanning** — Detects API keys, tokens, passwords in your code
   - ✅ **Push protection** — Blocks pushes that contain secrets

> **What does secret scanning detect?**
> It scans for patterns like:
> - AWS access keys (`AKIA...`)
> - Google API keys
> - GitHub tokens (`ghp_...`)
> - Azure connection strings
> - Database URLs with passwords
>
> If it finds one, it alerts you and (with push protection) prevents the commit from being pushed.

### Step 7.4: Set Up CodeQL Code Scanning

CodeQL analyzes your source code for security vulnerabilities like SQL injection, XSS, and insecure configurations.

Create `.github/workflows/codeql.yml`:

```yaml
name: CodeQL Security Scan

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    # Run weekly on Sundays at midnight UTC
    - cron: '0 0 * * 0'

permissions:
  security-events: write
  contents: read

jobs:
  analyze:
    name: Analyze Code
    runs-on: ubuntu-latest

    strategy:
      fail-fast: false
      matrix:
        language: ['javascript-typescript']

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          # Use the extended query suite for more thorough analysis
          queries: security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

> **What does CodeQL scan for?**
> - **SQL Injection**: Unsanitized user input in database queries
> - **XSS (Cross-Site Scripting)**: User input rendered without escaping
> - **Path Traversal**: File operations with unsanitized paths
> - **Insecure Dependencies**: Usage patterns that are known to be unsafe
> - **Information Disclosure**: Sensitive data in logs or error messages

### Step 7.5: Add a Security Policy

Create `SECURITY.md` in the root of your repository:

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email: [your-email@example.com]
3. Include a description and steps to reproduce

We will respond within 48 hours and provide a fix within 7 days for critical issues.
```

## What You'll See After This

### Dependabot PRs (every Monday):

```
┌──────────────────────────────────────────────────────────────┐
│  Pull Requests                                                │
│                                                              │
│  #15 chore(deps): bump next from 15.0.3 to 15.1.0           │
│      🤖 dependabot[bot]  •  dependencies  •  CI: ✅ passing  │
│                                                              │
│  #14 chore(deps-dev): bump dev dependencies                  │
│      🤖 dependabot[bot]  •  dependencies  •  CI: ✅ passing  │
│                                                              │
│  #13 chore(deps): bump actions/checkout from v4 to v5        │
│      🤖 dependabot[bot]  •  ci  •  CI: ✅ passing            │
└──────────────────────────────────────────────────────────────┘
```

### Security tab:

```
┌──────────────────────────────────────────────────────────────┐
│  Security Overview                                           │
│                                                              │
│  Dependabot alerts:  2 open (1 critical, 1 moderate)        │
│  Code scanning:      0 alerts                                │
│  Secret scanning:    0 alerts                                │
│                                                              │
│  ❗ Critical: prototype pollution in lodash < 4.17.21       │
│     └── PR #16 auto-created to fix                           │
│                                                              │
│  ⚠️  Moderate: ReDoS in nth-check < 2.0.1                   │
│     └── PR #17 auto-created to fix                           │
└──────────────────────────────────────────────────────────────┘
```

### CodeQL results on PRs:

```
┌──────────────────────────────────────────────────────────────┐
│  Code scanning results                                       │
│                                                              │
│  ✅ CodeQL: 0 new alerts                                     │
│                                                              │
│  (or if issues found:)                                       │
│  ⚠️  CodeQL: 1 new alert                                    │
│     └── Medium: Missing rate limiting on API endpoint       │
│         src/app/api/absences/route.ts:23                     │
└──────────────────────────────────────────────────────────────┘
```

## Bonus: Auto-Merge Dependabot PRs

If you trust your CI pipeline, you can auto-merge minor/patch Dependabot updates:

Create `.github/workflows/dependabot-auto-merge.yml`:

```yaml
name: Dependabot Auto-Merge

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - name: Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Auto-merge minor and patch updates
        if: >
          steps.metadata.outputs.update-type == 'version-update:semver-minor' ||
          steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **Why only minor/patch?**
> - **Patch** (1.0.0 → 1.0.1): Bug fixes only — very safe to auto-merge
> - **Minor** (1.0.0 → 1.1.0): New features, backwards-compatible — usually safe
> - **Major** (1.0.0 → 2.0.0): Breaking changes — always review manually

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Dependabot PRs not appearing | `dependabot.yml` not in `.github/` folder | Ensure the file is at `.github/dependabot.yml` |
| CodeQL scan is slow | Large codebase or complex build | Add `timeout-minutes: 30` to the job |
| False positive alerts | CodeQL being overly cautious | Dismiss with a reason in the Security tab |
| Auto-merge not working | Branch protection requires reviews | Add Dependabot to the "bypass" list or require 0 reviews for bot PRs |

## Summary of All 7 Steps

Congratulations! Here's what you've set up across all 7 guides:

| Step | What | Status |
|---|---|---|
| 0 | CI Pipeline (lint, test, E2E, Docker build) | ✅ Already done |
| 1 | OIDC Azure Authentication | 📄 Documented |
| 2 | CD Workflow (auto-deploy to Azure) | 📄 Documented |
| 3 | Branch Protection Rules | 📄 Documented |
| 4 | GitHub Environments with Approvals | 📄 Documented |
| 5 | Infrastructure as Code (Bicep) | 📄 Documented |
| 6 | PR Status Checks & Automation | 📄 Documented |
| 7 | Dependabot & Security Scanning | 📄 Documented |

### Recommended implementation order:

```
1. OIDC Authentication → 2. CD Workflow → 3. Branch Protection → 
4. Environments → 5. IaC with Bicep → 6. PR Automation → 7. Security
```

Steps 1-2 are the foundation (deploy to Azure). Steps 3-4 add safety gates. Steps 5-7 add automation and security.

---

## References

- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- [CodeQL Documentation](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning)
- [Dependabot Auto-Merge](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions#enable-auto-merge-on-a-pull-request)
