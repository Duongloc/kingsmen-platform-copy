# 🚀 VPS Deployment Checklist — Lessons Learned

> A battle-tested checklist of every issue found and fixed while migrating a React + Supabase
> monolith from localStorage to a production VPS deployment. Reuse this as test cases for future apps.

---

## Table of Contents

1. [Database Request Storms](#1-database-request-storms)
2. [Data Persistence — localStorage vs Database](#2-data-persistence--localstorage-vs-database)
3. [Concurrency & Race Conditions](#3-concurrency--race-conditions)
4. [Security — API Keys & Authentication](#4-security--api-keys--authentication)
5. [Row Level Security (RLS)](#5-row-level-security-rls)
6. [Session Management](#6-session-management)
7. [Data Migration & Integrity](#7-data-migration--data-integrity)
8. [Frontend Performance](#8-frontend-performance)
9. [Docker & Nginx Deployment](#9-docker--nginx-deployment)
10. [Supabase Edge Functions](#10-supabase-edge-functions)
11. [Database Schema Design](#11-database-schema-design)
12. [Git & CI/CD](#12-git--cicd)

---

## 1. Database Request Storms

### 🐛 BUG: Full-table upsert on every keystroke
**Severity**: 🔴 Critical — crashes database  
**Symptom**: Hundreds of `knowledge?columns=...` requests in Network tab, DB connection pool exhausted  
**Root Cause**: `onChange` handler on text inputs called a save function that upserted ALL rows in the table on every character typed.

```
User types 50 chars × 30 rows in table = 1,500 row upserts in seconds
```

**Fix**:
1. **Debounce** saves — only write to DB after 800ms of inactivity
2. **Single-row upsert** — when editing one item, only upsert that row, not the entire table
3. **Separate UI state from DB writes** — update React state immediately, debounce the DB call

```js
// ❌ BAD: Saves entire array on every keystroke
const updKnowledge = (data) => {
  setKnowledge(data);
  save("km-knowledge", data); // Upserts ALL rows immediately
};

// ✅ GOOD: Debounced + single-row
const updKnowledge = (data, changedId) => {
  setKnowledge(data);           // UI updates instantly
  cacheSet("knowledge", data);  // Local cache updates instantly
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(async () => {
    if (changedId) {
      // Only upsert the ONE changed row
      const row = data.find(k => k.id === changedId);
      await supabase.from("knowledge").upsert(toSnake(row));
    } else {
      // Fallback: full save for bulk operations (add/delete)
      save("km-knowledge", data);
    }
  }, 800);
};
```

**Test Cases**:
- [ ] Open Network tab → edit a text field → verify only **1 request** fires (after debounce)
- [ ] Verify the request body contains **1 row**, not the entire table
- [ ] Rapid typing (50+ chars) → should produce only 1-3 requests total
- [ ] Add/delete items → should save immediately (no debounce)
- [ ] Refresh page → verify debounced changes persisted

---

### 🐛 BUG: Button-click saves should not be debounced
**Severity**: 🟡 Medium  
**Root Cause**: Using the same debounced save for both keystroke edits and intentional actions (add/delete/import)

**Fix**: Create two save functions:
- `updKnowledgeNow()` — for add, delete, import, AI generation (immediate, full-array)
- `updKnowledge(data, changedId)` — for typing in forms (debounced, single-row)

**Test Cases**:
- [ ] Click "Add" → new item appears in DB immediately (no 800ms delay)
- [ ] Click "Delete" → item removed from DB immediately
- [ ] Import file → content saved to DB immediately

---

## 2. Data Persistence — localStorage vs Database

### 🐛 BUG: Data lost on browser clear / different device
**Severity**: 🔴 Critical  
**Root Cause**: Business-critical data stored in `localStorage` instead of database

**Fix**: Migrate all state to Supabase tables. Use `localStorage` only as a short-lived cache (TTL-based).

```js
// Cache helpers with TTL
const CACHE_TTL = {
  accounts: 30000,    // 30s — volatile data
  knowledge: 300000,  // 5min — stable data
  settings: 300000,
};
const cacheGet = (key) => {
  const raw = localStorage.getItem("kc_" + key);
  if (!raw) return null;
  const { ts, data } = JSON.parse(raw);
  if (Date.now() - ts > (CACHE_TTL[key] ?? 30000)) {
    localStorage.removeItem("kc_" + key);
    return null;
  }
  return data;
};
```

**Test Cases**:
- [ ] Clear browser data → login → all data still present
- [ ] Open app on different device → same data visible
- [ ] Disable JavaScript localStorage → app still functions (no crash)
- [ ] Two tabs open → edit in tab A → tab B eventually sees changes

---

## 3. Concurrency & Race Conditions

### 🐛 BUG: Read-modify-write race on XP updates
**Severity**: 🔴 Critical  
**Root Cause**: Two users read XP=100, both add 10, both write 110 → lost update (should be 120)

```
Tab A: read xp=100, write xp=110   ←  Lost!
Tab B: read xp=100, write xp=110   ←  Wins
```

**Fix**: Use database-side atomic operations (RPCs) instead of client-side read-modify-write.

```sql
-- Atomic XP increment — no race condition possible
CREATE OR REPLACE FUNCTION increment_xp(
  p_user_id uuid, p_amount integer, p_date text
) RETURNS void AS $$
BEGIN
  UPDATE profiles SET
    xp = GREATEST(0, COALESCE(xp,0) + p_amount),
    last_xp_gain_date = CASE
      WHEN p_amount > 0 THEN p_date
      ELSE last_xp_gain_date
    END
  WHERE id = p_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```

```js
// ❌ BAD: Client-side read-modify-write
const { data } = await supabase.from("profiles").select("xp").eq("id", id);
await supabase.from("profiles").update({ xp: data.xp + amount }).eq("id", id);

// ✅ GOOD: Atomic server-side increment
await supabase.rpc("increment_xp", {
  p_user_id: id,
  p_amount: amount,
  p_date: today()
});
```

**Test Cases**:
- [ ] Two users complete a quiz simultaneously → both get correct XP
- [ ] XP cannot go below 0 (enforced by `GREATEST(0, ...)`)
- [ ] Network failure during XP update → retry mechanism kicks in

---

### 🐛 BUG: Challenge completion race — full-array overwrite
**Severity**: 🟠 High  
**Root Cause**: Employee completing a challenge triggered a full-array upsert of ALL challenges, overwriting another user's concurrent completion

**Fix**: Use atomic RPC for employee challenge completion:

```js
// ✅ Employees use atomic RPC — no overwrite possible
await supabase.rpc('complete_challenge', {
  p_challenge_id: challengeId,
  p_user_id: userId
});
```

**Test Cases**:
- [ ] Two employees complete the same challenge at the same time → both recorded
- [ ] Employee cannot overwrite other users' challenge data

---

## 4. Security — API Keys & Authentication

### 🐛 BUG: API keys exposed in frontend JavaScript
**Severity**: 🔴 Critical — security vulnerability  
**Root Cause**: Third-party API keys (Claude/Anthropic, etc.) hardcoded in frontend code, visible in browser DevTools

**Fix**: Route all sensitive API calls through a **server-side proxy** (Supabase Edge Function):

```
Browser → Supabase Edge Function (has API key) → Anthropic API
         ↑ Auth token validated here
```

**Security layers in the proxy**:
1. Require valid Supabase auth token (JWT)
2. Verify user account is active
3. Enforce model and token limits server-side
4. Role-based limits (admin: 6000 tokens, employee: 2000 tokens)

**Test Cases**:
- [ ] Search entire frontend bundle for API keys → should find NONE except Supabase anon key
- [ ] Call Edge Function without auth token → 401 Unauthorized
- [ ] Call Edge Function with inactive account → 403 Forbidden
- [ ] Employee cannot exceed token limit even if they modify the request
- [ ] Admin gets higher token limit automatically

---

### 🐛 BUG: Supabase anon key treated as secret
**Severity**: 🟡 Medium (misconception)  
**Clarification**: The Supabase `anon key` is designed to be public. Security comes from **RLS policies**, not key secrecy. However, the `service_role` key must NEVER be in frontend code.

**Test Cases**:
- [ ] Search frontend code for `service_role` → must find NOTHING
- [ ] `.env` not committed to git (in `.gitignore`)
- [ ] `.env.example` has placeholder values, not real keys

---

## 5. Row Level Security (RLS)

### 🐛 BUG: Any authenticated user can read/write all data
**Severity**: 🔴 Critical  
**Root Cause**: Tables created without RLS policies

**Fix**: Enable RLS on all tables and create appropriate policies:

```sql
-- Example: Results — employees can only read their own
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own results"
  ON results FOR SELECT
  USING (emp_id = auth.uid());

CREATE POLICY "Admins read all results"
  ON results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (emp_id = 'admin' OR acc_role = 'director')
    )
  );
```

**Test Cases**:
- [ ] Employee cannot see other employees' quiz results
- [ ] Admin/Director can see all results
- [ ] Employee cannot modify other users' profiles
- [ ] RLS is ON for every table (check via Supabase dashboard)

---

## 6. Session Management

### 🐛 BUG: User has to login every time they open the app
**Severity**: 🟡 Medium — bad UX  
**Root Cause**: No session persistence or auto-restore

**Fix**: Use Supabase's built-in session management with `getSession()`:

```js
// On app load: check for existing session
const { data: { session } } = await supabase.auth.getSession();
if (session && session.user) {
  const { data: profile } = await supabase
    .from("profiles").select("*")
    .eq("id", session.user.id).single();
  if (profile?.status === "active") {
    setCurrentUser(profile);
    setScreen("home");
  }
}
```

**Test Cases**:
- [ ] Login → close tab → reopen → still logged in
- [ ] Login → clear cookies → must login again
- [ ] Inactive account → session exists but app signs out automatically
- [ ] Token expires → app handles gracefully (redirect to login)

---

## 7. Data Migration & Data Integrity

### 🐛 BUG: Legacy data lost during migration
**Severity**: 🔴 Critical  
**Root Cause**: Migrating from localStorage/JSON backup to Supabase without mapping old IDs to new UUIDs

**Fix**:
1. Export full backup as JSON first
2. Create `auth.users` entries for each employee
3. Map old employee IDs to new Supabase UUIDs
4. Import profiles → knowledge → quizzes → results (respecting foreign keys)

**Test Cases**:
- [ ] All employees can login with their existing credentials
- [ ] Historical XP, streaks, and check-in data preserved
- [ ] Quiz results linked to correct quizzes (foreign key integrity)
- [ ] No orphaned records after migration

---

### 🐛 BUG: Foreign key violations on delete
**Severity**: 🟠 High  
**Root Cause**: Deleting a quiz that has results referencing it → FK violation

**Fix**: Unlink results before deleting:

```js
// Unlink results first, then delete quiz
await supabase.from("results").update({ quiz_id: null }).eq("quiz_id", quizId);
await supabase.from("quizzes").delete().eq("id", quizId);
```

**Test Cases**:
- [ ] Delete quiz that has results → no error, results preserved with `quiz_id = null`
- [ ] Delete knowledge that has quizzes → handle gracefully
- [ ] Check DB for orphaned foreign keys after bulk operations

---

## 8. Frontend Performance

### 🐛 BUG: App loads blank screen for 3+ seconds
**Severity**: 🟡 Medium — bad UX  
**Root Cause**: Waiting for ALL Supabase queries to complete before rendering

**Fix**: Phased loading strategy:
1. **Phase 1 (instant)**: Restore from localStorage cache → render immediately
2. **Phase 2 (fast)**: Check auth session (single query)
3. **Phase 3 (background)**: Refresh from Supabase without blocking UI

```js
// Show UI immediately with cached data
const cached = { accounts: cacheGet("accounts"), ... };
if (cached.accounts) setAccounts(cached.accounts);
setReady(true);  // Render NOW

// Then refresh in background
loadAllData();  // Non-blocking
```

**Test Cases**:
- [ ] App renders in < 500ms with cached data
- [ ] Background refresh doesn't cause UI flicker
- [ ] Works offline with cached data (read-only)
- [ ] Stale cache auto-expires based on TTL

---

### 🐛 BUG: Screen navigation refetches ALL tables
**Severity**: 🟡 Medium  
**Root Cause**: Every screen change triggered a full database reload

**Fix**: Selective auto-reload — only fetch tables needed for the current screen:

```js
const SCREEN_TABLES = {
  emp_home: ["accounts", "results", "challenges", "notifications"],
  emp_knowledge: ["knowledge"],
  admin_lessons: ["knowledge"],
  // ...each screen lists only what it needs
};

// + 8-second throttle between reloads
// + Skip if cache is still fresh
if (Date.now() - lastReload < 8000) return;
if (cacheGet("knowledge")?.length) return; // Cache fresh, skip
```

**Test Cases**:
- [ ] Navigate to Knowledge screen → only `knowledge` table queried (check Network tab)
- [ ] Rapidly switch tabs → throttle prevents request spam
- [ ] Fresh cache → no network requests on navigation

---

## 9. Docker & Nginx Deployment

### Architecture

```
Internet → Cloudflare DNS → VPS:443 (SSL)
  → Docker container (Nginx:80)
    → Static files (Vite build output in /dist)
  → Supabase cloud (database + auth + edge functions)
```

### Deployment Files

**Dockerfile** — Multi-stage build:
```dockerfile
# Stage 1: Build with Node
FROM node:20-alpine AS builder
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s CMD wget --spider http://localhost/ || exit 1
```

**docker-compose.yml** — Reads env vars from `.env`:
```yaml
services:
  web:
    build:
      context: .
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    ports:
      - "${PORT:-3000}:80"
    restart: unless-stopped
```

**nginx.conf** — SPA-ready:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    # Long cache for hashed assets
    location ~* \.(js|css|png|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — all routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Block hidden files (.env, .git, etc.)
    location ~ /\. {
        deny all;
    }
}
```

**Deploy command**:
```bash
docker compose up -d --build
```

**Test Cases**:
- [ ] `docker compose up -d --build` completes without errors
- [ ] Health check passes: `docker inspect --format='{{.State.Health.Status}}' kingsmen-platform`
- [ ] Navigate to any route → page loads (SPA fallback working)
- [ ] `.env` file not accessible via browser (`curl https://domain/.env` → 403)
- [ ] JavaScript bundle is gzipped (check `Content-Encoding: gzip` header)
- [ ] Static assets have `Cache-Control: public, immutable` header

---

## 10. Supabase Edge Functions

### API Proxy Pattern
**Purpose**: Keep sensitive API keys on the server, never expose them to the browser.

```
Browser (auth token) → Edge Function → validates token → calls external API → returns response
```

**Key security checks in the proxy**:
```typescript
// 1. Require auth token
const authHeader = req.headers.get("Authorization");
if (!authHeader) return 401;

// 2. Validate user exists and is active
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from("profiles")
  .select("status, acc_role").eq("id", user.id).single();
if (profile.status !== "active") return 403;

// 3. Enforce limits server-side
const MAX_TOKENS = isAdmin ? 6000 : 2000;
safeBody.max_tokens = Math.min(clientBody.max_tokens, MAX_TOKENS);
safeBody.model = "claude-sonnet-4-6"; // Force model server-side
```

**Test Cases**:
- [ ] Edge function deployed and reachable
- [ ] API key stored as Edge Function secret (not in code)
- [ ] Unauthenticated request → 401
- [ ] Inactive user → 403
- [ ] Employee cannot override model or token limits
- [ ] Edge function handles malformed JSON gracefully

---

## 11. Database Schema Design

### Key Design Decisions

| Decision | Why |
|----------|-----|
| `profiles.id` = `auth.users.id` (UUID) | Single source of truth for user identity |
| `text` primary keys (not UUID) for content tables | Allows client-generated IDs for optimistic UI |
| `jsonb` for flexible fields (questions, stages, etc.) | Schema flexibility without migrations |
| `SECURITY DEFINER` RPCs for atomic operations | Bypass RLS for server-trusted operations |
| `settings` table with `CHECK (id = 1)` | Singleton config — can only have one row |
| `GREATEST(0, ...)` in XP function | Prevents negative XP at the database level |

**Test Cases**:
- [ ] Every table has a primary key
- [ ] Foreign keys reference correct tables
- [ ] `ON DELETE` behavior defined for all FKs
- [ ] `CHECK` constraints prevent invalid data
- [ ] Default values set for all nullable columns
- [ ] `created_at` auto-populates via `DEFAULT now()`

---

## 12. Git & CI/CD

### 🐛 BUG: `.env` committed to repository
**Severity**: 🔴 Critical — security vulnerability

**Fix**:
```gitignore
# .gitignore
.env
.env.local
.env.production
node_modules/
dist/
```

**Test Cases**:
- [ ] `git log --all --full-history -- .env` → no results
- [ ] `.env.example` exists with placeholder values
- [ ] `node_modules/` not in repo
- [ ] `dist/` not in repo (built in Docker)

---

### 🐛 BUG: Git branch divergence after force push
**Severity**: 🟡 Medium  
**Fix**: Configure pull strategy:
```bash
git config pull.rebase false  # or true, depending on preference
git pull origin main
```

---

## Quick Reference — Deploy Checklist

```
Pre-deploy:
  □ .env file configured on VPS
  □ Supabase schema + RLS policies applied
  □ RPCs (increment_xp, etc.) deployed
  □ Edge functions deployed with secrets
  □ No API keys in frontend code

Deploy:
  □ docker compose up -d --build
  □ Health check passes
  □ SSL/TLS configured (Cloudflare or certbot)

Post-deploy:
  □ Login works (session persistence)
  □ Data loads from database (not localStorage)
  □ Edit knowledge → only 1 request after typing stops
  □ Quiz completion → XP updates atomically
  □ Network tab clean (no request storms)
  □ Browser console clean (no errors)
  □ .env not accessible via browser
  □ Test on mobile device
```

---

*Last updated: 2026-04-21*
*Generated from Kingsmen Training Platform migration (localStorage → Supabase → VPS)*
