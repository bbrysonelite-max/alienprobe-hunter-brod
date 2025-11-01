# Admin Panel Authentication Setup

## Problem
The admin panel at `/admin` requires authentication. Without proper API keys configured, you'll see zeros for all metrics even though scans are working.

## Solution: API Key Authentication

### Step 1: Configure Replit Environment Variables

1. Open your Replit project: `alien-probe-deploy-bbrysonelite`

2. Click on "Tools" → "Secrets" (or the lock icon 🔒 in the sidebar)

3. Add these environment variables:

   **Server-side (Backend):**
   ```
   ADMIN_API_KEY=sCgHcxWnwB6IrasfvBRb0gcnl2vJLjsp1LGgceW4+Y8=
   ```

   **Client-side (Frontend):**
   ```
   VITE_ADMIN_API_KEY=sCgHcxWnwB6IrasfvBRb0gcnl2vJLjsp1LGgceW4+Y8=
   ```

4. **IMPORTANT**: Both values must be identical

### Step 2: Restart Your Replit Deployment

After adding the secrets:
1. Click "Stop" to stop the current deployment
2. Click "Run" to start with new environment variables
3. Wait for the build to complete

### Step 3: Verify Admin Access

1. Navigate to: `https://alien-probe-deploy-bbrysonelite.replit.app/admin`
2. You should now see:
   - ✅ Total Leads count (actual number, not 0)
   - ✅ Scans Completed count
   - ✅ Revenue metrics
   - ✅ System Health: "connected" (not "unknown")

## Security Notes

- **Keep this API key secret** - it grants full admin access
- Never commit `.env` files to Git (already in `.gitignore`)
- To regenerate key if compromised: `openssl rand -base64 32`

## How It Works

1. **Server** validates API key using `ADMIN_API_KEY` environment variable
2. **Client** sends API key in `x-api-key` header using `VITE_ADMIN_API_KEY`
3. All `/api/admin/*` routes require valid API key to return data
4. Without valid key → 401 Unauthorized → admin shows zeros

## Troubleshooting

### Still seeing zeros after setup?

1. **Verify environment variables are set in Replit Secrets**
2. **Hard refresh** the admin page: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows)
3. **Check browser console** for 401 errors
4. **Verify both secrets match exactly** (no extra spaces)
5. **Restart Replit deployment** after changing secrets

### Check if API key is working:

Open browser console on `/admin` page and run:
```javascript
fetch('/api/admin/overview', {
  headers: { 'x-api-key': 'sCgHcxWnwB6IrasfvBRb0gcnl2vJLjsp1LGgceW4+Y8=' }
}).then(r => r.json()).then(console.log)
```

Should return actual metrics, not errors.

## What Changed

**Files modified:**
- `client/src/lib/queryClient.ts` - Added automatic `x-api-key` header for admin routes
- `server/routes.ts` - Already had API key authentication, just needed env var
- `.env` files created locally for testing

**No changes to:**
- Scan functionality
- Payment processing
- Database schema
- User-facing features
