/**
 * Shared CORS origin checker used by the API gateway and any service that
 * serves CORS-relevant responses (proxied streams, file downloads, etc.).
 *
 * Policy:
 *   - Any localhost / 127.0.0.1 / ::1 host on any port (dev / local testing)
 *   - Any vercel.app subdomain or bare vercel.app host (all Vercel
 *     deployments, including auto-generated <project>-<hash>-<team>.vercel.app
 *     preview URLs)
 *   - Any origin verbatim-listed in the provided allowlist
 *   - Missing origin (server-to-server, curl, mobile) is allowed
 */
export const isAllowedOrigin = (
  origin: string | undefined,
  allowlist: readonly string[] = [],
): boolean => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host === 'vercel.app' || host.endsWith('.vercel.app')) return true;
    if (allowlist.includes(origin)) return true;
    return false;
  } catch {
    return false;
  }
};
