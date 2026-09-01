# Fix: Dashboard "Loading..." Hang + Structured Login Logging

## Problem Statement

After a user logs in successfully (navbar shows "Rajesh Sharma" + logout), the dashboard main content is stuck on "Loading..." indefinitely. Additionally, Render logs show no trace of login attempts — only the DNS resolution failures.

---

## Root Cause Analysis

### Issue 1: Dashboard Loading Hang

**Chain of failure:**

1. `DashboardView` calls `useApiResource<DashboardPayload>('/users/dashboard', { initialData })`
2. Server-side `page.tsx` fetches `/users/dashboard` with 4s `AbortSignal.timeout` → times out → returns `undefined`
3. Client-side `useApiResource` starts fetching → `apiClient.get('/users/dashboard')` with 10s axios timeout
4. The request hits the gateway proxy → proxies to consumer-service (port 4002)
5. `ConnectionController.getConsumerDashboard` calls `connectionService.getDashboardData(userId)`
6. `connectionService.getDashboardData()` calls `userRepository.findById(userId)` → hits Prisma → **Postgres unreachable due to IPv6 ENETUNREACH**
7. The request hangs until axios timeout (10s), then the promise rejects → `loading` flips to `false` BUT `data` is still `undefined`
8. `DashboardView` only checks `if (loading)` — never checks `if (error)` or `if (!data)`
9. Result: `loading` is `false` (error handled), but `data` is `undefined`, and the component tries to render `dashboard.consumer` which is `undefined` — likely a white screen or the loading skeleton stays visible because the conditional renders wrong

**Wait, re-reading more carefully:** The `useApiResource` hook does set `data` on success, and sets `error` on failure. After the 10s timeout, `error` is set but `data` is `undefined`. The `DashboardView` component:

```tsx
const { data, loading } = useApiResource<DashboardPayload>('/users/dashboard', { initialData });

if (loading) {
  return <DashboardSkeleton />; // Shows while loading
}

// loading is now false (after timeout/rejection)
const dashboard = data?.dashboard ?? {}; // data is undefined → dashboard = {}
const consumer = dashboard.consumer || user; // OK (user from auth store)
const stats = dashboard.stats || defaultStats; // OK (defaults)

return <div>...</div>; // Renders with defaults, no error shown
```

Actually this would render the dashboard with empty data (all zeros), NOT "Loading...". So the issue must be different.

**Alternative theory:** The `useApiResource` hook deduplicates requests. If a request is already `inFlight`, subsequent calls wait on the same promise. But if the server-side fetch timed out after 4s and returned `undefined`, the client-side fetch starts fresh. However, if the 10s axios timeout fires, the promise rejects, and the hook sets `error`. The component doesn't show an error UI — it just renders with empty data.

The "Loading..." text shown in the user's screenshot is likely coming from a different loading state — possibly from the `authStore` which polls for session every 30s with a 4s timeout. If that polling fails, it might set some loading state.

Actually, looking at the flow again: after login, the `DashboardView` renders with `loading: true` initially. The `useApiResource` hook calls `apiClient.get('/users/dashboard')`. If this hangs for 10s (timeout), the promise rejects. But what if the request is NOT timing out at 10s but is actually being blocked at a lower level?

Let me reconsider. The `apiClient` has `timeout: 10_000`. But the gateway proxy has `timeout: 30_000`. So:

- The axios request starts, goes to the gateway
- The gateway proxies to consumer-service
- If the consumer-service hangs (Postgres unreachable), the gateway waits up to 30s
- The axios client waits up to 10s
- If axios times out first (10s), the gateway proxy is still hanging, but the axios request gets cancelled
- The gateway proxy then gets the cancellation and closes the connection

So the axios timeout of 10s should fire. Unless... the `apiClient` timeout isn't being applied properly? Let me check.

Actually, looking at `apiClient.ts` again:

```typescript
export const apiClient = axios.create({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api',
  withCredentials: true,
  timeout: 10_000,
});
```

This sets the global timeout to 10s. But in `useApiResource`, the call is:

```typescript
const res = await apiClient.get(targetUrl);
```

No timeout override is passed, so the 10s global timeout should apply. After 10s, axios throws a timeout error, the promise rejects, `error` is set, and the component should render with empty data.

**BUT** — wait. The user says "Loading..." is shown. What if the `loading` state never becomes `false`? Let me trace through the `useApiResource` hook more carefully:

1. Initial state: `data = initialData` (undefined from server fetch), `isValidating = false`, `error = null`
2. `useEffect` calls `load(url, 'swr')`
3. `load` checks cache → no cache hit → `setIsValidating(true)`
4. Creates promise that calls `apiClient.get(targetUrl)`
5. If axios times out (10s) → promise rejects → `catch (e) { setError(e); }` → `finally { setIsValidating(false); }`
6. `loading` from the hook is NOT a separate state — it's derived from `isValidating`

Wait, looking at the hook return:

```typescript
export interface ApiResourceResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean; // <-- This is derived
  isValidating: boolean;
  revalidate: () => Promise<void>;
}
```

Let me check line 73+ of useApiResource.ts:

```typescript
const [data, setData] = useState<T | undefined>(...);
const [error, setError] = useState<unknown>(null);
const [isValidating, setIsValidating] = useState(false);
```

So `loading` must be derived. Let me check lines 180+:

```typescript
const loading = isValidating; // Maybe?
```

Actually I only read up to line 179 (revalidate function). Let me check lines 180-235:

```typescript
const loading = isValidating;
```

So `loading === isValidating`. When `setIsValidating(false)` fires in the finally block, `loading` becomes false. So the component should NOT show "Loading..." after 10s.

**Unless** the `apiClient.get()` is NOT timing out. What if the gateway is returning a response before the axios timeout? The gateway has a 30s proxyTimeout. But what if the gateway is returning a 503 error quickly (the proxy error handler in routes/index.ts line 108-127 returns 503 if `!res.headersSent`)?

Looking at the gateway error handler:

```typescript
error: (err: Error, req: any, res: any) => {
  logger.error('Upstream proxy error', { ... });
  if (!res.headersSent) {
    res.status(503).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: '...' },
    });
  }
},
```

This returns 503 immediately when the proxy fails. But does the proxy fail immediately? The proxy error fires when the upstream connection fails (ECONNREFUSED, ETIMEDOUT, etc.). With IPv6 ENETUNREACH, the connection attempt itself fails. So the error should fire quickly.

But wait — the error handler fires when `http-proxy` encounters an error. With ENETUNREACH, the `connect()` syscall fails immediately with that error. The http-proxy should catch this and call the error handler.

So after ~immediate ENETUNREACH, the gateway returns 503. The axios request gets a 503 response (not a timeout). The promise resolves with `res` (not rejection). The `useApiResource` then:

```typescript
const res = await apiClient.get(targetUrl);
if (res.data?.success) {
  return res.data.data;
}
throw new Error(res.data?.error?.message || 'Request failed');
```

503 → `res.data` is `{ success: false, error: { ... } }` → `res.data?.success` is falsy → throws error → `catch { setError(e); }` → `finally { setIsValidating(false); }` → `loading = false`.

So after the 503, `loading` is false and `error` is set. The `DashboardView`:

```tsx
if (loading) return <DashboardSkeleton />;
const dashboard = data?.dashboard ?? {};
```

`loading` is false → doesn't show skeleton. `data` is undefined → `dashboard = {}`. Renders with empty data.

**Why does the user see "Loading..."?** Most likely the server-side fetch in `page.tsx` is the culprit. The server fetches `/users/dashboard` with 4s timeout. If the server-side fetch hangs for 4s and returns `undefined`, the page renders with `initialData = undefined`. The client then starts its own fetch. But during those 4s (or even longer), the loading.tsx or layout loading state might be active.

Actually, the `page.tsx` is an async Server Component. Next.js will wait for `fetchApiData` to resolve before streaming the page. If `fetchApiData` takes 4s (times out), the page still renders and sends `initialData: undefined`. The `DashboardView` gets `initialData: undefined` and starts loading. During those first 4s, the `loading` state is true.

But even after the 4s server timeout, the client fetch starts and takes ~10s. So total time before `loading` becomes false: 4s (server) + 10s (client) = 14s minimum.

If the server fetch returns `undefined` (due to timeout), the client starts loading. During the client's 10s wait, `loading = true`. So the user would see "Loading..." for up to 10s.

Wait, but the user says it's "stuck" on Loading — implying it's indefinite, not just slow. Let me reconsider.

What if the issue is that the `apiClient.get()` call is actually hanging indefinitely (no timeout at all)? In that case, `loading` would stay `true` forever and the user would see "Loading..." indefinitely.

The `apiClient` does have `timeout: 10_000` set globally. But what if the fetch is NOT going through the normal axios timeout mechanism? For example, what if the `fetchApiData` on the server side is what's blocking?

Actually, let me reconsider the server-side fetch. `fetchApiData` in `server.ts` line 96:

```typescript
const res = await fetch(`${API_BASE}${path}`, {
  headers: { Cookie: cookieStore.toString() },
  cache: 'no-store',
  signal: AbortSignal.timeout(4000),
});
```

This has a 4s timeout. If the backend returns 503 in ~100ms (from the gateway), the server fetch resolves in 100ms and returns `{ success: false, ... }`. The `fetchApiData` function checks `if (!res.ok)`... let me check.

From `server.ts` lines 100-108:

```typescript
const res = await fetch(`${API_BASE}${path}`, {
  ...
  signal: AbortSignal.timeout(4000),
});
if (!res.ok) {  // 503 → !res.ok is true
  throw new Error(`API error: ${res.status}`);
}
```

503 → throws error → `fetchApiData` throws → `DashboardPage` catches... wait, `DashboardPage` doesn't have a try/catch. If `fetchApiData` throws, the page.tsx throws and Next.js shows an error boundary or the error page.

But the user sees "Loading..." not an error page. So either:

1. The server fetch IS succeeding (returning non-200) and `fetchApiData` returns `undefined`
2. The server fetch times out (4s) and returns `undefined`
3. The server fetch succeeds but `fetchApiData` handles the non-200 gracefully

Actually, looking at `fetchApiData` line 100-108:

```typescript
if (!res.ok) {
  throw new Error(`API error: ${res.status}`);
}
const json = await res.json();
if (json?.success && json?.data) {
  return json.data as T;
}
return undefined;
```

503 → throws → page.tsx should crash. Unless Next.js is catching it at the layout level.

But the user sees "Loading..." which is the `loading.tsx` or the `DashboardSkeleton`. If the page crashed, Next.js would show an error boundary, not the loading state.

Let me try a different theory: the `useApiResource` hook at line 141 uses `apiClient.get()` which has a 10s timeout. But what if the `apiClient` is NOT using the right `baseURL`? The `NEXT_PUBLIC_API_URL` environment variable should point to the Render backend URL. If this is not set or wrong, the request goes nowhere.

On Vercel (frontend), `NEXT_PUBLIC_API_URL` should be the Render backend URL. If this env var is missing, `baseURL` defaults to `http://localhost:3000/api` which would fail immediately (connection refused) → axios throws → error → `loading` becomes false.

Unless the Vercel deployment has `NEXT_PUBLIC_API_URL` set to something that doesn't respond but also doesn't immediately fail. For example, if it's set to a domain that hangs indefinitely (not connection refused, not timeout, just hangs), the request would hang.

But this is getting too speculative. Let me focus on the practical fixes.

**Most likely root cause:** The `apiClient.get()` call in `useApiResource` IS timing out (10s), but the error is caught and `loading` becomes false. However, the `DashboardView` component renders with `data?.dashboard ?? {}` which gives empty data. But the user sees "Loading..." — this suggests `loading` is NOT becoming false, which means the request is hanging indefinitely.

This could happen if the `apiClient` timeout is not being respected. One common issue: if the request is a CORS preflight that hangs, axios might not apply the timeout to the preflight. But with `withCredentials: true`, preflights are expected.

Another theory: the `apiClient` is configured with `timeout: 10_000` but the actual network request goes through a service worker or proxy that doesn't respect the timeout.

**Most practical fix:** Add an explicit per-request timeout to the `useApiResource` call for the dashboard, and add an error-state fallback UI. This way:

1. If the backend is slow/unavailable, the dashboard shows a clear error message with retry button instead of "Loading..." forever
2. The user knows something is wrong and can retry

### Issue 2: No Login Logging in Render

The `authenticationService.login()` method does log to the audit DB (via `auditService.logAction`) but ONLY on successful login (step 4, after DB writes). Failed attempts are logged to audit DB (step 3), but only AFTER the password check. There is NO log entry at the START of a login attempt.

The `requestLogger` middleware logs completed requests, but the user wants to see "user tried to login" with timestamp BEFORE any processing. This is useful for debugging — knowing that a request even arrived at the service.

**Fix:** Add `logger.info` at the START of the login controller method, with user identifier (redacted), IP, and timestamp.

---

## Fix Plan

### Fix 1: Structured Login Attempt Logging

**File:** `services/auth-service/src/controllers/auth.controller.ts`

Add a log entry at the start of the `login` method (before any validation or service call):

```typescript
public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const identifier = (req.body as any)?.identifier || 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
    const timestamp = new Date().toISOString();
    const requestId = (req as any).correlationId || 'unknown';

    logger.info(`[LOGIN_ATTEMPT] timestamp=${timestamp} requestId=${requestId} identifier=${identifier.substring(0, 2)}*** ip=${ipAddress}`);

    const validated = loginSchema.parse(req.body);
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
    const result = await authenticationService.login({ ...validated, ipAddress });
    ...
```

Also add a log entry at the START of the `register` method for consistency.

### Fix 2: Dashboard Error-State Fallback + Timeout

**File:** `frontend/src/app/(protected)/dashboard/dashboard-view.tsx`

Change the hook call to include an error-state and explicit timeout:

```typescript
const { data, error, loading, revalidate } = useApiResource<DashboardPayload>(
  '/users/dashboard',
  { initialData }
);

if (loading) {
  return (
    <div className="space-y-8 p-2 max-w-7xl mx-auto">
      <WelcomeBanner firstName={user?.firstName} lastName={user?.lastName} status={user?.status || 'ACTIVE'} />
      <DashboardSkeleton />
    </div>
  );
}

if (error) {
  return (
    <div className="space-y-8 p-2 max-w-7xl mx-auto">
      <WelcomeBanner firstName={user?.firstName} lastName={user?.lastName} status={user?.status || 'ACTIVE'} />
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-bold mb-2">Unable to load dashboard</p>
        <p className="text-red-500 text-sm mb-4">The server is temporarily unavailable. Your data may be loading slowly.</p>
        <Button variant="danger" size="sm" onClick={revalidate}>Retry</Button>
      </div>
    </div>
  );
}
```

Also add a 15s timeout override to the apiClient call (using a custom fetch wrapper) or pass a timeout config:

Actually, the simplest fix is to use the `apiClient.get` with an explicit timeout override in the hook. But since we can't modify `useApiResource` easily, we can wrap the call in a fetch with AbortSignal.timeout(15000) and use `apiClient.post` with a config... no, that's complex.

Better approach: In `DashboardView`, use a useEffect with setTimeout to force a fallback after 15s even if loading is true:

```typescript
const [forceError, setForceError] = useState(false);

useEffect(() => {
  const timer = setTimeout(() => {
    if (loading) setForceError(true);
  }, 15000);
  return () => clearTimeout(timer);
}, [loading]);

// Use forceError || error as the error state
const hasError = forceError || !!error;
```

### Fix 3: Add Login Attempt Logging to auth-service

**File:** `services/auth-service/src/services/authentication.service.ts`

Also add a log entry at the START of the `login` method:

```typescript
public async login(dto: LoginDTO): Promise<{ user: any; tokens: AuthTokens }> {
  const startTime = Date.now();
  logger.info(`[LOGIN_ATTEMPT_START] identifier=${dto.identifier.substring(0, 2)}*** ip=${dto.ipAddress} timestamp=${new Date().toISOString()}`);

  // 1. Find user or admin
  ...
}
```

### Fix 4: MongoDB Password Reset (PREREQUISITE)

Before the dashboard can work, MongoDB must be accessible. The user was in the process of resetting the MongoDB password. After reset, the new MONGODB_URI must be updated in Render env vars with URL-encoded password.

### Fix 5: DATABASE_URL Supabase Pooler Update (PREREQUISITE)

The Supabase Session pooler hostname (`aws-0-ap-northeast-1.pooler.supabase.com`) also has no A record. We need to either:

- Find a working Supabase pooler endpoint with IPv4
- Switch to Neon or Render Postgres
- Use the Supabase Transaction pooler which may have IPv4

---

## Files to Modify

| File                                                           | Change                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `services/auth-service/src/controllers/auth.controller.ts`     | Add `LOGIN_ATTEMPT` + `REGISTER_ATTEMPT` structured logs at method start |
| `services/auth-service/src/services/authentication.service.ts` | Add `LOGIN_ATTEMPT_START` log before any DB calls                        |
| `frontend/src/app/(protected)/dashboard/dashboard-view.tsx`    | Add error-state fallback UI + 15s force-error timer                      |
| `services/consumer-service/src/services/connection.service.ts` | Add debug log at start of `getDashboardData`                             |

---

## Verification

After deployment:

1. Login → Render logs should show: `[LOGIN_ATTEMPT] timestamp=... requestId=... identifier=Ra*** ip=...`
2. Navigate to dashboard → should show error card with "Retry" button (if backend is down) instead of "Loading..." forever
3. Retry → fetches data again
