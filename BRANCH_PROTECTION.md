# Branch Protection Setup Guide

## 🛡️ Recommended Branch Protection Rules

To maintain code quality and prevent accidental changes, set up these branch protection rules on GitHub.

---

## Quick Setup (GitHub Web Interface)

### Step 1: Navigate to Settings
1. Go to your GitHub repository
2. Click **Settings** tab
3. Click **Branches** in the left sidebar
4. Click **Add rule** under "Branch protection rules"

---

## Recommended Rules for `main` Branch

### ✅ Basic Protection

**Branch name pattern:** `main`

Enable these settings:

#### 1. **Require a pull request before merging** ✓
- **Require approvals:** 1 (at least one review)
- **Dismiss stale pull request approvals** ✓
- **Require review from Code Owners** (if you have a CODEOWNERS file)

#### 2. **Require status checks to pass** ✓
- **Require branches to be up to date before merging** ✓
- Status checks to require:
  - `build` (if you have CI/CD)
  - `test` (if you have automated tests)
  - `lint` (TypeScript/ESLint checks)

#### 3. **Require conversation resolution before merging** ✓
- Ensures all PR comments are addressed

#### 4. **Include administrators** ✓
- Even admins must follow these rules

#### 5. **Restrict who can push to matching branches** ✓
- Only allow specific teams/people to push directly
- Everyone else must use pull requests

---

## Optional but Recommended

### **Require signed commits** ✓
- Ensures commits are verified
- Adds extra security layer

### **Require linear history** ✓
- Prevents merge commits
- Keeps history clean with rebase/squash

### **Limit merge strategies**
- Allow squash merging ✓
- Allow rebase merging ✓
- Disable merge commits for cleaner history

---

## Branch Strategy

### Recommended Branches

```
main              # Production-ready code
├── development   # Integration branch
├── staging       # Pre-production testing
└── feature/*     # Feature branches
```

### Protection Levels

**`main` branch:**
- Strictest protection
- Require 1+ approvals
- All checks must pass
- No direct pushes

**`development` branch:**
- Moderate protection  
- Require 1 approval (optional)
- Status checks recommended
- Allow direct pushes from core team

**Feature branches:**
- No protection needed
- Create freely
- Merge via PR to development

---

## GitHub Actions (CI/CD) Setup

### Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main, development]
  push:
    branches: [main, development]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run TypeScript check
        run: npx tsc --noEmit
        
      - name: Run linter
        run: npm run lint || true
        
      - name: Build
        run: npm run build
```

This ensures:
- Code compiles successfully
- No TypeScript errors
- Build completes before merging

---

## CODEOWNERS File (Optional)

Create `.github/CODEOWNERS` to require specific reviewers:

```
# Default owners for everything
*       @your-username

# Admin features require admin review
/server/routes.ts                    @admin-team
/client/src/pages/admin.tsx          @admin-team

# Database changes require careful review
/shared/schema.ts                    @database-team
/migrations/*                        @database-team

# Workflow system requires workflow team
/server/workflows/*                  @workflow-team
/client/src/data/workflow-templates.ts  @workflow-team
```

---

## Pull Request Template

Create `.github/pull_request_template.md`:

```markdown
## Description
<!-- Describe your changes -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated (if applicable)
- [ ] Database migrations tested (if applicable)

## Testing
<!-- Describe testing performed -->

## Screenshots
<!-- If applicable, add screenshots -->
```

---

## Quick Commands

### Create a feature branch
```bash
git checkout -b feature/your-feature-name
```

### Push to remote
```bash
git push -u origin feature/your-feature-name
```

### Create PR via GitHub CLI
```bash
gh pr create --base main --head feature/your-feature-name
```

### Update feature branch with main
```bash
git checkout main
git pull
git checkout feature/your-feature-name
git merge main
```

---

## Best Practices

### ✅ DO:
- Always create feature branches
- Write descriptive commit messages
- Keep PRs focused and small
- Request reviews from relevant team members
- Test locally before pushing
- Update documentation with code changes

### ❌ DON'T:
- Push directly to `main`
- Merge without approval
- Ignore CI/CD failures
- Leave merge conflicts
- Force push to shared branches
- Commit sensitive data (API keys, passwords)

---

## Emergency Procedures

### Hotfix Process
1. Create branch from `main`: `git checkout -b hotfix/critical-bug`
2. Make minimal changes to fix issue
3. Test thoroughly
4. Create PR with "HOTFIX" label
5. Fast-track review process
6. Merge and deploy immediately
7. Backport to development if needed

### Rollback Process
1. Use Replit checkpoints for quick rollback
2. Or revert commit: `git revert <commit-hash>`
3. Create PR with revert
4. Expedite review
5. Deploy immediately

---

## Additional Resources

- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [Git Flow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

**Last Updated:** October 18, 2025
