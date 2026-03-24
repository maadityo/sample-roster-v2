# Step 3: Configure Branch Protection Rules

## Why This Matters

Right now, anyone with write access to your repository can:

- Push directly to `master` — bypassing all CI checks
- Force-push to `master` — rewriting history and potentially losing commits
- Merge a PR even if tests are failing
- Merge without any code review

This is dangerous because:
- **Broken code reaches production** — A typo in a direct push can take down your app
- **No peer review** — Bugs that a second pair of eyes would catch slip through
- **CI becomes optional** — If developers can bypass it, they will (especially under time pressure)

**Branch protection rules** enforce that every change to `master` must:
1. Come through a Pull Request
2. Pass all CI checks (lint, tests, Docker build)
3. Be reviewed by at least one teammate

```
❌ Before (no protection):
Developer → git push origin master → Deployed (maybe broken!)

✅ After (with protection):
Developer → Open PR → CI passes ✅ → Review approved ✅ → Merge → CD deploys
```

## Prerequisites

- **Repository admin access** on `maadityo/sample-roster-v2`
- CI workflow (`ci.yml`) already set up and running

## Step-by-Step Instructions

### Step 3.1: Navigate to Branch Protection Settings

1. Go to your repository: https://github.com/maadityo/sample-roster-v2
2. Click **Settings** (gear icon, top right)
3. In the left sidebar, click **Branches** (under "Code and automation")
4. Click **Add branch protection rule** (or **Add classic branch protection rule**)

### Step 3.2: Configure the Protection Rule

Fill in the following settings:

#### Branch name pattern
```
master
```

> This applies the rule to the `master` branch. You can use patterns like `main`, `release/*`, etc.

#### Required Settings (Recommended)

| Setting | Enable? | Why |
|---|---|---|
| **Require a pull request before merging** | ✅ Yes | Prevents direct pushes to master |
| → Required approving reviews | `1` | At least one person must review |
| → Dismiss stale pull request approvals when new commits are pushed | ✅ Yes | If you push new code, old approvals are invalidated |
| **Require status checks to pass before merging** | ✅ Yes | CI must pass before merge is allowed |
| → Require branches to be up to date before merging | ✅ Yes | Prevents merging stale branches |
| **Require conversation resolution before merging** | ✅ Yes | All review comments must be resolved |
| **Do not allow bypassing the above settings** | ✅ Yes | Even admins must follow the rules |

#### Status Checks to Require

When you enable "Require status checks to pass," you need to search for and add the CI job names:

1. Click the search box under "Status checks that are required"
2. Search for and add each of these (they match your `ci.yml` job names):
   - `Lint & Type-check`
   - `API Integration Tests (Vitest)`
   - `E2E Tests (Playwright)`
   - `Docker Build`

> **How do status checks work?**
> GitHub tracks the result of each CI job. When you set a job as "required," the merge button is disabled until that job reports a ✅ success. If any required check fails, the PR cannot be merged.

#### Optional but Recommended

| Setting | Enable? | Why |
|---|---|---|
| **Require signed commits** | Consider | Ensures commits are from verified authors |
| **Include administrators** | ✅ Yes | Admins should follow the same rules |
| **Restrict who can push to matching branches** | Optional | Limit who can merge (useful for teams) |
| **Allow force pushes** | ❌ No | Never allow force push to master |
| **Allow deletions** | ❌ No | Never allow deleting master |

### Step 3.3: Save the Rule

Click **Create** (or **Save changes**) at the bottom of the page.

### Step 3.4: Verify the Protection

Test that the protection works:

```bash
# Try to push directly to master — this should be REJECTED
git checkout master
echo "test" > test.txt
git add test.txt
git commit -m "test direct push"
git push origin master
# Expected: ! [remote rejected] master -> master (protected branch hook declined)
```

## What the Developer Experience Looks Like After This

### Before (no protection):
```
$ git push origin master
Everything up-to-date  ← Code goes straight to production 😱
```

### After (with protection):
```
$ git push origin master
 ! [remote rejected] master -> master (protected branch hook declined)
error: failed to push some refs

$ # Must create a PR instead:
$ git checkout -b feature/my-change
$ git push origin feature/my-change
$ # → Open PR on GitHub → Wait for CI → Get review → Merge ✅
```

### PR merge button states:

```
┌─────────────────────────────────────────────┐
│  ❌ Merge blocked                           │
│                                             │
│  ⏳ Lint & Type-check — Running...          │
│  ⏳ API Integration Tests — Running...      │
│  ⏳ E2E Tests — Waiting...                  │
│  ⏳ Docker Build — Running...               │
│                                             │
│  ❌ Review required — 0 of 1 required       │
│     reviews have approved                   │
│                                             │
│  [ Merge pull request ] (disabled)          │
└─────────────────────────────────────────────┘

                    ↓ After CI passes + review approved ↓

┌─────────────────────────────────────────────┐
│  ✅ Ready to merge                          │
│                                             │
│  ✅ Lint & Type-check — Passed              │
│  ✅ API Integration Tests — Passed          │
│  ✅ E2E Tests — Passed                      │
│  ✅ Docker Build — Passed                   │
│                                             │
│  ✅ Review approved by @teammate            │
│                                             │
│  [ Merge pull request ] (enabled)           │
└─────────────────────────────────────────────┘
```

## For Solo Developers

If you're the only contributor, requiring a review is impractical. In that case:

1. Set **Required approving reviews** to `0`
2. Keep all other protections enabled (especially required status checks)
3. This still ensures CI passes before merging — just without a human review

You can always increase the review requirement later when you have teammates.

## Using GitHub CLI (Alternative to Web UI)

You can also configure branch protection via the GitHub CLI:

```bash
# Install GitHub CLI: https://cli.github.com/
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/maadityo/sample-roster-v2/branches/master/protection \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=Lint & Type-check" \
  -f "required_status_checks[contexts][]=API Integration Tests (Vitest)" \
  -f "required_status_checks[contexts][]=E2E Tests (Playwright)" \
  -f "required_status_checks[contexts][]=Docker Build" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -F "enforce_admins=true" \
  -F "restrictions=null"
```

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Status checks not appearing in the search | CI has never run on a PR to master | Open a test PR to trigger CI, then configure the checks |
| "Merge blocked" but CI hasn't started | Branch protection requires up-to-date branches | Click "Update branch" on the PR to rebase/merge with master |
| Admin can still bypass | "Do not allow bypassing" not enabled | Edit the rule and check that box |

## What's Next?

With branch protection in place, the next step is **Step 4: GitHub Environments with Deployment Approvals** to add human approval gates before deploying to production.

---

## References

- [GitHub: Managing a branch protection rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitHub: About required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)
