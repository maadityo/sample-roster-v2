# Step 6: PR Status Checks & CI Automation

## Why This Matters

Right now, when your CI pipeline runs on a PR, you have to:

1. **Manually click** into the Actions tab to see results
2. **Scroll through logs** to find what failed
3. **Download artifacts** to see test coverage or Playwright reports
4. **No visibility** on the PR page itself about test results

This is the "manual checking" problem you described. The solution is to **bring CI results directly to the PR** with:

- ✅ **Test result summaries** posted as PR comments
- ✅ **Coverage reports** showing which code is tested
- ✅ **Playwright report links** for E2E test failures
- ✅ **Job summaries** visible directly in the GitHub Actions UI

```
Before:
PR page → "CI is running" → Click Actions tab → Find workflow → 
Click job → Scroll logs → "Oh, it failed at line 847"

After:
PR page → See comment with test results, coverage %, and failure details 
right there on the PR page
```

## Prerequisites

- CI workflow (`ci.yml`) already set up
- Repository admin access for configuring GitHub Actions permissions

## Step-by-Step Instructions

### Step 6.1: Enable GitHub Actions Write Permissions

For workflows to comment on PRs, they need write permission:

1. Go to repository → **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Check **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

### Step 6.2: Add Test Result Comments to PRs

Update your `ci.yml` to add PR comments with test results. Add the following changes:

#### Add permissions at the top of the workflow:

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

# Add these permissions
permissions:
  contents: read
  pull-requests: write    # Needed to comment on PRs
  checks: write           # Needed to create check annotations
```

#### Add a test report step to the unit-tests job:

After the "Run API tests" step, add:

```yaml
      - name: Run API tests
        env:
          DATABASE_URL: ${{ env.TEST_DATABASE_URL }}
          NEXTAUTH_SECRET: ci-test-secret-not-for-production
          MAX_ABSENCES_PER_MONTH: "2"
          MAX_ABSENCES_PER_SUNDAY: "3"
        run: npm run test:unit -- --reporter=default --reporter=junit --outputFile=test-results/junit.xml

      # NEW: Post test results as a PR comment
      - name: Test Report
        uses: dorny/test-reporter@v1
        if: always() && github.event_name == 'pull_request'
        with:
          name: "Vitest Results"
          path: "test-results/junit.xml"
          reporter: java-junit
          fail-on-error: false

      # NEW: Post coverage summary
      - name: Coverage Summary
        if: always() && github.event_name == 'pull_request'
        uses: davelosert/vitest-coverage-report-action@v2
        with:
          json-summary-path: coverage/coverage-summary.json
          json-final-path: coverage/coverage-final.json
```

> **What does `dorny/test-reporter` do?**
> It reads test result files (JUnit XML format) and creates a nice summary with pass/fail counts, failure details, and annotations directly on the "Checks" tab of your PR. No more scrolling through logs!

#### Add E2E test reporting to the e2e-tests job:

After the "Run E2E tests" step, add:

```yaml
      - name: Run E2E tests
        env:
          # ... (existing env vars)
        run: npm run test:e2e

      # NEW: Post Playwright results
      - name: Playwright Report
        uses: dorny/test-reporter@v1
        if: always() && github.event_name == 'pull_request'
        with:
          name: "Playwright E2E Results"
          path: "playwright-report/results.xml"
          reporter: java-junit
          fail-on-error: false
```

### Step 6.3: Add Job Summaries

GitHub Actions supports **Job Summaries** — rich Markdown rendered directly in the Actions UI. Add this to each job:

#### For the unit-tests job:

```yaml
      # NEW: Write job summary
      - name: Write Job Summary
        if: always()
        run: |
          echo "## 🧪 API Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ -f coverage/coverage-summary.json ]; then
            LINES=$(node -e "const c=require('./coverage/coverage-summary.json');console.log(c.total.lines.pct)")
            BRANCHES=$(node -e "const c=require('./coverage/coverage-summary.json');console.log(c.total.branches.pct)")
            FUNCTIONS=$(node -e "const c=require('./coverage/coverage-summary.json');console.log(c.total.functions.pct)")
            echo "| Metric | Coverage |" >> $GITHUB_STEP_SUMMARY
            echo "|--------|----------|" >> $GITHUB_STEP_SUMMARY
            echo "| Lines | ${LINES}% |" >> $GITHUB_STEP_SUMMARY
            echo "| Branches | ${BRANCHES}% |" >> $GITHUB_STEP_SUMMARY
            echo "| Functions | ${FUNCTIONS}% |" >> $GITHUB_STEP_SUMMARY
          fi
```

#### For the e2e-tests job:

```yaml
      # NEW: Write E2E job summary
      - name: Write E2E Summary
        if: always()
        run: |
          echo "## 🎭 Playwright E2E Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ -d playwright-report ]; then
            echo "📊 [View Full Report](../artifacts/playwright-report)" >> $GITHUB_STEP_SUMMARY
          fi
          if [ -d test-results ] && [ "$(ls -A test-results 2>/dev/null)" ]; then
            echo "📸 Screenshots captured for failed tests" >> $GITHUB_STEP_SUMMARY
          else
            echo "✅ All E2E tests passed — no screenshots captured" >> $GITHUB_STEP_SUMMARY
          fi
```

### Step 6.4: Add Vitest JUnit Reporter

To generate JUnit XML output, update your Vitest config:

```typescript
// vitest.config.ts - add junit reporter
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ... existing config
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    coverage: {
      reporter: ['text', 'json-summary', 'json', 'lcov'],
    },
  },
});
```

### Step 6.5: Add Playwright JUnit Reporter

Update `playwright.config.ts`:

```typescript
// playwright.config.ts - add junit reporter
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // ... existing config
  reporter: [
    ['list'],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
```

### Step 6.6: Configure Playwright to Output JUnit for CI

Alternatively, you can set the reporter only in CI using an environment variable in the workflow:

```yaml
      - name: Run E2E tests
        env:
          # ... existing env vars
          PLAYWRIGHT_JUNIT_OUTPUT_NAME: playwright-report/results.xml
        run: npx playwright test --reporter=list,junit,html
```

## What You'll See After This

### On the PR page — Checks tab:

```
┌──────────────────────────────────────────────────────────────┐
│  Checks                                                      │
│                                                              │
│  ✅ Lint & Type-check                                        │
│                                                              │
│  ✅ Vitest Results          12 passed, 0 failed, 0 skipped   │
│     └─ ✅ GET /api/schedules returns schedules               │
│     └─ ✅ POST /api/absences creates absence                 │
│     └─ ✅ PATCH /api/absences/[id] updates status            │
│     └─ ... (12 more)                                         │
│                                                              │
│  ✅ Playwright E2E Results   5 passed, 0 failed              │
│     └─ ✅ Login page loads correctly                          │
│     └─ ✅ Dashboard shows schedules                           │
│     └─ ... (5 more)                                          │
│                                                              │
│  ✅ Docker Build                                              │
└──────────────────────────────────────────────────────────────┘
```

### On the workflow run — Job Summary:

```
┌──────────────────────────────────────────┐
│  🧪 API Test Results                     │
│                                          │
│  | Metric    | Coverage |                │
│  |-----------|----------|                │
│  | Lines     | 78.5%    |                │
│  | Branches  | 65.2%    |                │
│  | Functions | 82.1%    |                │
│                                          │
│  🎭 Playwright E2E Results              │
│  ✅ All E2E tests passed                │
│  📊 View Full Report                    │
└──────────────────────────────────────────┘
```

### When a test fails — Annotations on the PR diff:

```
src/app/api/absences/route.ts
  Line 45: ❌ Test failed: "POST /api/absences validates monthly limit"
           Expected: 400
           Received: 200
```

This annotation appears directly on the code file in the PR diff — you can see exactly which line caused the failure without reading any logs.

## Bonus: Add a CI Status Badge to README

Add this to the top of your `README.md`:

```markdown
![CI](https://github.com/maadityo/sample-roster-v2/actions/workflows/ci.yml/badge.svg)
```

This shows a live badge: [![CI](https://img.shields.io/badge/CI-passing-brightgreen)]()

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Resource not accessible by integration" | Missing `pull-requests: write` permission | Add `permissions` block to workflow |
| No JUnit XML file found | Reporter not configured or path wrong | Check vitest/playwright config for reporter output path |
| Coverage comment empty | Coverage not generated | Ensure `--coverage` flag and `coverage` config are set |
| Annotations don't appear on PR diff | Test reporter action not running on `pull_request` event | Check the `if` condition on the step |

## What's Next?

The final step is **Step 7: Dependabot & Security Scanning** to automatically keep your dependencies up-to-date and scan for vulnerabilities.

---

## References

- [dorny/test-reporter Action](https://github.com/dorny/test-reporter)
- [GitHub Job Summaries](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#adding-a-job-summary)
- [Vitest JUnit Reporter](https://vitest.dev/guide/reporters.html#junit-reporter)
- [Playwright JUnit Reporter](https://playwright.dev/docs/test-reporters#junit-reporter)
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action)
