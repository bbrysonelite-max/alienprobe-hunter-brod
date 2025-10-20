# Git Commit Checklist

## ✅ Pre-Commit Review

Use this checklist **before** committing and pushing code to ensure nothing sensitive or unnecessary is included.

---

## 🔒 Security Review

### Environment Variables & Secrets
- [ ] **.env file is NOT committed** (should be in .gitignore)
- [ ] **No API keys in code** (check for hardcoded keys)
- [ ] **No passwords in code**
- [ ] **No database credentials in code**
- [ ] **Session secrets are in environment variables**

### Current Project Secrets to NEVER Commit:
❌ `OPENAI_API_KEY`  
❌ `SENDGRID_API_KEY`  
❌ `STRIPE_SECRET_KEY`  
❌ `DATABASE_URL`  
❌ `SESSION_SECRET`  
❌ `PGPASSWORD`  

**Instead:** These should all be in `.env` (which is gitignored)

---

## 📁 File Review

### Files That Should NOT Be Committed

#### Node Modules & Dependencies
- [ ] `node_modules/` is excluded
- [ ] Package lock files are committed: `package-lock.json` ✓

#### Build Outputs
- [ ] `dist/` is excluded
- [ ] `build/` is excluded
- [ ] `server/public/` is excluded

#### Database Files
- [ ] `*.db` files are excluded
- [ ] `*.sqlite` files are excluded  
- [ ] Local database backups are excluded

#### Logs & Temp Files
- [ ] `*.log` files are excluded
- [ ] `tmp/` directory is excluded
- [ ] `.DS_Store` (Mac) is excluded

#### IDE Files
- [ ] `.vscode/` is excluded (or committed if team uses same settings)
- [ ] `.idea/` is excluded
- [ ] `*.swp` files are excluded

#### Large Assets
- [ ] Large images are in object storage, not repo
- [ ] Videos are referenced, not committed
- [ ] `attached_assets/` may be excluded

---

## ✅ Files That SHOULD Be Committed

### Configuration Files
✓ `.env.example` - Template with dummy values  
✓ `package.json` - Dependencies  
✓ `package-lock.json` - Lock file  
✓ `tsconfig.json` - TypeScript config  
✓ `vite.config.ts` - Build config  
✓ `drizzle.config.ts` - Database config  
✓ `tailwind.config.ts` - Styling config  

### Source Code
✓ `client/src/**/*.tsx` - React components  
✓ `client/src/**/*.ts` - TypeScript files  
✓ `server/**/*.ts` - Backend code  
✓ `shared/**/*.ts` - Shared types  

### Documentation
✓ `README.md`  
✓ `PRODUCT_INSTRUCTIONS.md`  
✓ `design_guidelines.md`  
✓ This file! `GIT_COMMIT_CHECKLIST.md`  

### Migrations
✓ `migrations/**/*.ts` - Database migrations (if using SQL files, be careful)

### Assets
✓ Small logos/icons in `client/public/`  
⚠️ Large images should be in object storage

---

## 🔍 Code Quality Review

### Before Committing
- [ ] **Code compiles** (`npm run build` succeeds)
- [ ] **No TypeScript errors** (or acceptable errors documented)
- [ ] **Linter passes** (or warnings are acceptable)
- [ ] **No console.log() left in production code**
- [ ] **No TODO comments without tickets**
- [ ] **No commented-out code blocks**

### Testing
- [ ] **Tested locally** (app runs without errors)
- [ ] **Critical paths tested** (main features work)
- [ ] **Database migrations tested** (if schema changed)
- [ ] **No broken imports**

---

## 📝 Commit Message Standards

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Formatting, missing semicolons, etc.
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### Examples

**Good:**
```
feat(admin): add real-time activity monitoring with SSE

- Implemented Server-Sent Events endpoint
- Created ActivityFeed component
- Added activity_events table to database
- Connected admin dashboard to live event stream

Closes #123
```

**Bad:**
```
fixed stuff
```

---

## 🚀 Pre-Push Checklist

### Final Checks Before `git push`

- [ ] **Pulled latest changes** (`git pull origin main`)
- [ ] **Resolved merge conflicts** (if any)
- [ ] **Reviewed all changed files** (`git status`, `git diff`)
- [ ] **No sensitive data in commits**
- [ ] **Commit message is descriptive**
- [ ] **Branch is up to date**
- [ ] **Tests pass** (if you have automated tests)

### Quick Review Commands

```bash
# See what will be committed
git status

# Review changes in detail
git diff

# Review staged changes
git diff --staged

# See commit history
git log --oneline -5

# Check for secrets (basic check)
git diff | grep -i "api_key\|password\|secret"
```

---

## 🎯 Current Project Status

### What's Already Committed (Safe)
✅ Core application code  
✅ Database schema definitions  
✅ TypeScript configuration  
✅ Package dependencies  
✅ Documentation  
✅ Workflow templates  

### What Should NEVER Be Committed
❌ `.env` file (API keys, secrets)  
❌ `node_modules/` directory  
❌ Build outputs (`dist/`, `build/`)  
❌ Database files (`.db`, `.sqlite`)  
❌ Large media files  
❌ IDE settings (unless team standardized)  

### Current .gitignore Status
✓ Comprehensive .gitignore is in place  
✓ Covers all standard exclusions  
✓ Includes Replit-specific files  
✓ Protects sensitive data  

---

## ⚠️ Common Mistakes to Avoid

### 1. Committing Secrets
**Problem:** API keys exposed in public repo  
**Solution:** Use .env files, check with `git diff` before committing

### 2. Committing node_modules
**Problem:** Repo becomes huge, slow clones  
**Solution:** Ensure node_modules is in .gitignore

### 3. Committing Build Outputs
**Problem:** Merge conflicts, unnecessary files  
**Solution:** Add dist/, build/ to .gitignore

### 4. Large Binary Files
**Problem:** Repo bloat, slow performance  
**Solution:** Use Git LFS or object storage

### 5. Unclear Commit Messages
**Problem:** Can't track what changed when  
**Solution:** Write descriptive messages with context

---

## 🛠️ Tools & Commands

### Review Before Commit
```bash
# See what files changed
git status

# See detailed changes
git diff

# See changes already staged
git diff --staged

# Interactive staging (choose what to commit)
git add -p
```

### Search for Secrets
```bash
# Check for common secret patterns
git diff | grep -E "(api_key|password|secret|token)" -i

# Check all tracked files
git grep -i "api_key\|password\|secret\|token"
```

### Undo Mistakes
```bash
# Unstage a file
git reset HEAD <file>

# Discard changes in working directory
git checkout -- <file>

# Undo last commit (keep changes)
git reset --soft HEAD^

# Undo last commit (discard changes)
git reset --hard HEAD^
```

---

## 📋 Quick Reference

### Safe to Commit ✓
- Source code (.ts, .tsx, .js)
- Configuration files (package.json, tsconfig.json)
- Documentation (.md files)
- Small static assets
- Database migrations
- .env.example (template only)

### Never Commit ❌
- .env (actual secrets)
- node_modules/
- Build outputs (dist/, build/)
- Database files (.db, .sqlite)
- Log files (*.log)
- IDE settings (.vscode/, .idea/)
- Large media files
- Temporary files

---

## 🎓 Best Practices

1. **Review before staging:** Always check `git status` and `git diff`
2. **Stage selectively:** Use `git add <specific-file>` instead of `git add .`
3. **Commit often:** Small, focused commits are better
4. **Write good messages:** Future you will thank you
5. **Pull before push:** Avoid merge conflicts
6. **Never force push:** Unless you really know what you're doing
7. **Use branches:** Keep main clean

---

**Remember:** Once committed and pushed, it's hard to remove sensitive data from Git history. Review carefully!

**Last Updated:** October 18, 2025
