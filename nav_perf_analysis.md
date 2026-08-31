# Navigation Performance Analysis

## Summary

The slowness you're feeling is **real and multi-layered**, not just a dev-mode artefact — though dev mode amplifies everything. Below are the root causes ranked by how much each one actually contributes.

---

## 1. Home → Login / Register

### What actually happens on click

1. Click is intercepted by `useNavigationEvent` (capture phase, instant) → progress bar starts.
2. Next.js App Router begins a **client-side RSC navigation** — it is NOT a full page reload. The `<Link prefetch={true}>` on the Navbar buttons means the JS chunks *should* already be downloaded.
3. The target page is an RSC Server Component (`login/page.tsx` is `async`-free, essentially static) — but it imports `<LoginForm>` which is `'use client'` and includes:
   - `framer-motion` (heavy — see bundle section)
   - `react-hook-form` + `zod` + `@hookform/resolvers`
   - `axios` (full Axios, not just fetch)
   - `useAuthRedirect` → `useAuth` → `authStore` → Zustand
4. The root layout **always runs `getServerSession()`** on every hard navigation ([`layout.tsx:20`](file:///d:/rep/bses/frontend/src/app/layout.tsx#L20)). For a guest this short-circuits at the cookie check with zero network. ✅ Not a problem.

### The actual blocking issue: `useAuthRedirect` on public pages

**This is the biggest single source of latency on home→login.**

`LoginForm` calls `useAuthRedirect()` ([`LoginForm.tsx:39`](file:///d:/rep/bses/frontend/src/components/auth/LoginForm.tsx#L39)), which reads `isLoading` from `authStore`. The store initialises with `isLoading: true` ([`authStore.ts:32`](file:///d:/rep/bses/frontend/src/store/authStore.ts#L32)).

The `SessionProvider` in root layout ([`SessionProvider.tsx:31-41`](file:///d:/rep/bses/frontend/src/components/providers/SessionProvider.tsx#L31-L41)) resolves this:
- **Authenticated** → sets `isLoading: false` synchronously in `useEffect`.
- **Unauthenticated** (no cookies) → also sets `isLoading: false` synchronously.
- **Unknown** → calls `checkSession()`, which fires a real network round-trip to `/api/auth/session`.

So for a guest visiting `/login` for the first time:
- No cookies → `getServerSession` returns `{ status: 'unauthenticated' }` → `setUser(null)` in `useEffect` → `isLoading = false` → `LoginForm` renders.
- **In theory, no delay.** But `useEffect` runs **after** paint, so there is always at least one frame where `isLoading === true` → `LoginForm` renders `<AuthPending />` ([`LoginForm.tsx:71`](file:///d:/rep/bses/frontend/src/components/auth/LoginForm.tsx#L71)) → then re-renders with the real form. The user sees a spinner, then the form. **This flicker is unavoidable with the current `useEffect`-based seeding.**

For a user who IS logged in and visits `/login`:
- `getServerSession` makes a real HTTP request to auth-service (up to 5s timeout: [`server.ts:31`](file:///d:/rep/bses/frontend/src/lib/server.ts#L31)).
- SSR blocks until that resolves before the page is sent to the client.
- On a slow auth-service, this is directly felt.

### Register page: same problem, compounded

`register/page.tsx` is **`'use client'`** ([`register/page.tsx:1`](file:///d:/rep/bses/frontend/src/app/(auth)/register/page.tsx#L1)) — the entire registration flow is a client component. This means:
- Next.js cannot SSR it as a Server Component. It ships as a single large JS bundle.
- It imports `framer-motion`, `react-hook-form`, `zod`, `axios`, `CustomSelect` (which also uses `framer-motion`) — all eagerly at parse time.
- The `motion` and `AnimatePresence` alone pull in Framer Motion's entire core.

---

## 2. Protected Pages Post-Login (Dashboard → Profile Waterfall)

### Request waterfall for a cold navigation (e.g. direct URL or first visit after login)

```
Browser → Next.js server
│
├─ Middleware runs (edge, ~0ms) — cookie check only, no network ✅
│
├─ Root layout RSC: getServerSession() → HTTP /api/auth/session
│   (if cookies present; up to 5s timeout)
│
├─ dashboard/page.tsx RSC: fetchApiData('/users/dashboard')
│   ← SEQUENTIAL after getServerSession resolves
│   (up to 8s timeout: server.ts:62)
│
└─ HTML streamed to client
    │
    ├─ Hydration: SessionProvider.useEffect fires
    │   → initialSession is 'authenticated' → setUser() → isLoading = false ✅
    │
    ├─ AuthGuard renders (isLoading=false, isAuthenticated=true) → children ✅
    │
    └─ DashboardView: initialData from RSC → useApiResource seeds cache
        → loading = false, renders immediately ✅
```

**The critical problem:** The two RSC fetches are **sequential**, not parallel.

`getServerSession` in the root layout must complete before `fetchApiData` in `dashboard/page.tsx` can start, because Next.js renders the layout tree top-down. Both hit the same auth-service via the gateway. So a cold dashboard load costs:

```
T_total = T_session_check + T_dashboard_fetch
```

If the gateway/auth-service is slow (~200ms each), that's 400ms of pure server waiting before the first byte arrives at the browser. In dev this is amplified by the cold-module-compilation overhead on each individual service handler.

### Client-side navigation (e.g. Sidebar: Dashboard → Profile)

```
Click → useNavigationEvent → progress bar starts
│
├─ Next.js router: does it have a prefetch for /profile?
│   • PrefetchProvider scheduled this via router.prefetch() during idle time
│   • BUT: PrefetchProvider only runs warmup on routes in CONSUMER_PREFETCH_TARGETS
│     AND only when shouldRun=true (i.e., current route is a dashboard or in targets list)
│
├─ /profile RSC request fires → server runs fetchApiData('/users/profile')
│   → getServerSession() runs AGAIN in root layout for this navigation
│   → fetchApiData('/users/profile') runs second
│   (Sequential again — same problem as cold load)
│
└─ ProfileView: initialData? → if prefetch cache hot → instant, else skeleton
```

**Key finding: `getServerSession` runs on EVERY client-side navigation to a protected route.** The root layout's RSC function (`getServerSession`) is not cached between navigations — `cache: 'no-store'` ([`server.ts:29`](file:///d:/rep/bses/frontend/src/lib/server.ts#L29)) explicitly opts out of fetch caching. This is correct for correctness, but it means every protected-page navigation pays a round-trip to the auth-service before it can even start fetching the page data.

### The `useApiResource` SWR cache — is it helping?

For **client-side navigations only**, yes. The `prefetchApiResource` calls warm the module-level `cache` Map in `useApiResource.ts`. When the destination page mounts and calls `useApiResource('/users/profile')`, if the cache has a fresh entry (within `staleMs = 30s`), it renders immediately with no network call.

**But the RSC `fetchApiData` still fires server-side** even when the client cache is warm — the server doesn't know what the client has cached. So you get a redundant fetch server-side + an instant render client-side. Not harmful, just wasted work.

**When the client cache is cold** (first navigation, or >30s since last visit), the pattern is: RSC fetch (sequential, blocked on session) + client `useApiResource` shows skeleton briefly then resolves when in-flight request settles.

### `edit/profile/page.tsx` — a notable outlier

This page does not use `fetchApiData` for server-side prefetch. Instead, it fires a raw `apiClient.get('/users/profile')` inside a `useEffect` ([`edit/page.tsx:36`](file:///d:/rep/bses/frontend/src/app/(protected)/profile/edit/page.tsx#L36)). This means:
- On mount: form renders with empty fields.
- `useEffect` fires after paint → API call → fields populate.
- Users see a brief blank form before data loads, with no loading skeleton.
- The SWR cache for `/users/profile` is **not consulted** — even if the profile was fetched 2 seconds ago, this page makes a fresh request.

---

## 3. Regression Check

| Area | Status | Finding |
|------|--------|---------|
| **Duplicate session checks** | ⚠️ **Present** | `getServerSession` runs in root layout AND `checkSession` is the fallback in `SessionProvider` for `status='unknown'`. Not a regression — by design — but on any connection issue both fire sequentially. |
| **AuthGuard spinner gate** | ✅ Clean | With `initialSession` seeded correctly, `isLoading` is set to `false` before first paint in `useEffect`. AuthGuard doesn't render a spinner. But there's always a 1-frame flicker window. |
| **Footer becoming `'use client'`** | ⚠️ Minor regression | Recently changed. Footer is now a client component. It's rendered on public pages (home, login, register). This adds Footer to the client JS bundle for those routes — previously it could have been static HTML from the server. |
| **OCR pipeline** | ✅ No impact on nav | OCR runs in `document-service` as an async background job. No frontend bundle impact. |
| **Admin module** | ✅ Isolated | `admin/*` pages are all `'use client'` with their own chunks inside `(protected)/admin/`. No bleeding into public or consumer routes. |
| **Framer Motion on every page** | ⚠️ **Existing weight** | `home/page.tsx` is `'use client'` and imports `{ motion, AnimatePresence }` from `framer-motion`. `register/page.tsx` does the same. `CustomSelect` also pulls in framer-motion. Framer Motion 13.x has a ~45KB gzipped core. It gets loaded on the first public page and cached, so it doesn't reload per navigation, but it does block first contentful paint. |
| **`window.location.href` on logout** | ⚠️ Hard reload | [`authStore.ts:59`](file:///d:/rep/bses/frontend/src/store/authStore.ts#L59) uses `window.location.href = '/login'` — this is a **full page reload**, destroying the JS module cache and forcing everything to re-download and re-compile on next navigation. Not felt often, but noticeable when it happens. |
| **PrefetchProvider scope** | ⚠️ Partial gap | `shouldRun` is `true` only on dashboards or routes listed in `CONSUMER_PREFETCH_TARGETS`. `/profile/edit`, `/connections/apply`, and admin detail pages are not in that list — navigating to them is always cold from a data perspective. |

---

## 4. Dev vs. Production Distinction

**What you're feeling is amplified dev-mode behaviour, but the underlying issues are real.**

In `next dev`:
- Every route module is compiled on-demand on the first request to that route. A cold navigation to `/register` for the first time in a dev session can take 2–5 seconds for module compilation alone, completely separate from any network latency.
- `router.prefetch()` is a **no-op in development**. The `PrefetchProvider` calls it, but Next.js ignores it in dev mode. So every navigation in dev is cold from a JS-chunks perspective, regardless of what the prefetch infrastructure does.
- React Strict Mode (`reactStrictMode: true` in `next.config.mjs:3`) double-invokes effects in dev. Every `useEffect` in `SessionProvider`, `AuthGuard`, etc. runs twice, doubling the number of state updates and re-renders.

**In production (`next build && next start`):**
- Route chunks are pre-built and served from `.next/static` — the compile-on-demand latency disappears.
- `router.prefetch()` works, so the PrefetchProvider's idle warming actually downloads chunks ahead of time.
- RSC payloads are still fetched per-navigation (the sequential session+data fetch remains a real cost).
- The `getServerSession` → `fetchApiData` sequential waterfall still happens in prod. This is the dominant remaining cost.

**No production build is available** — the server is running in `next dev` mode (confirmed by the running process: `npm run dev` in `d:\rep\bses\frontend` for 5+ hours). A prod build cannot be run right now without stopping dev.

---

## 5. Bundle Weight by Route

| Route | Type | Key heavy imports | Estimated first-load JS |
|-------|------|-------------------|------------------------|
| `/` (home) | `'use client'` | `framer-motion` (full), `lucide-react` (tree-shaken via `optimizePackageImports`), Navbar, Footer (now client) | Large — framer-motion pulled in immediately |
| `/login` | Server Component (page) | `LoginForm` (client) → axios, framer-motion (zod, react-hook-form are small) | Medium — but framer-motion already cached from home |
| `/register` | `'use client'` | Same as login + multi-step wizard state, `CustomSelect` (framer-motion again) | Large — all eager |
| `/dashboard` | Server Component | `DashboardView` (client) → lucide-react icons (14 imports), authStore, useApiResource | Medium — most deps shared |
| `/profile` | Server Component | `ProfileView` (client) → `createPortal`, edit modal, 10 lucide icons | Medium |
| `/connections/apply` | `'use client'` | Entire wizard inline — no code splitting within the file | Medium |
| `/admin/users/[id]` | `'use client'` | Full admin detail view, no RSC prefetch | Medium |

**Notable finding:** `framer-motion` at version `13.0.0` (pinned exactly — `"framer-motion": "13.0.0"`) is the heaviest single dependency. It is eagerly imported on the home page (public route), so it's in the initial bundle for all users. There's no dynamic import or lazy loading applied to it anywhere. `lucide-react` is handled correctly via `optimizePackageImports` in the Next.js config.

**Axios** (`"axios": "^1.7.2"`) is another notable weight — it ships ~14KB gzipped. It's imported everywhere via `apiClient`. Native `fetch` would save this, but it's architectural, not a quick fix.

---

## Ranked Causes of Perceived Slowness

| Rank | Cause | Scope | Severity |
|------|-------|-------|----------|
| 1 | **Dev-mode compile-on-demand** — first visit to any route compiles it fresh | All routes, dev only | Very high (disappears in prod) |
| 2 | **Sequential `getServerSession` + `fetchApiData`** — every protected-page navigation pays two serial HTTP round-trips to the auth-service before first byte | All protected pages | High (prod too) |
| 3 | **`useAuthRedirect` / `isLoading:true` initial state** — `LoginForm` shows `<AuthPending>` spinner on every render until `useEffect` fires, even for guests | Login, Register | Medium-high (visible flash) |
| 4 | **`router.prefetch()` is a no-op in dev** — PrefetchProvider's entire chunk-warming strategy does nothing during development | All protected pages, dev only | High (disappears in prod) |
| 5 | **Framer Motion eagerly loaded on public home page** — 45KB+ core pulled in before any interaction, blocks first paint | Home, Register (by share) | Medium |
| 6 | **`profile/edit/page.tsx` bypasses SWR cache** — raw `useEffect` + `apiClient.get` ignores the shared cache, forces a fresh round-trip every mount | Profile edit | Medium |
| 7 | **`window.location.href` logout = full page reload** — destroys module cache, next navigation cold-compiles again (in dev) | Post-logout | Low-medium |
| 8 | **Footer converted to `'use client'`** — adds it to the client bundle for public pages (was previously purely server HTML) | Public pages | Low |
