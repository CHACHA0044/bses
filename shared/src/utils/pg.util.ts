/**
 * Postgres connection-string helpers.
 *
 * `pg-connection-string` v2 emits a deprecation warning whenever a connection
 * string contains `sslmode` (except `sslmode=verify-full`). Our PrismaPg
 * clients always set TLS explicitly via the `ssl` config option, so the
 * `sslmode` query parameter is redundant. Removing it silences the one-time
 * startup warning while preserving the exact same TLS behavior
 * (`ssl: { rejectUnauthorized: false }`).
 */
export const withPgSslMode = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    if (url.searchParams.has('sslmode')) {
      url.searchParams.delete('sslmode');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};

import dns from 'node:dns';
import type { PoolConfig } from 'pg';
import type winston from 'winston';

const resolveIPv4 = async (hostname: string, logger: winston.Logger): Promise<string | null> => {
  const override = process.env['DATABASE_HOST'];
  if (override && override !== hostname) {
    logger.debug(`Using DATABASE_HOST override ${override} for ${hostname}`);
    return override;
  }
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses && addresses.length > 0) return addresses[0]!;
  } catch {
    /* fall through */
  }
  const publicResolvers = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
  const beforeServers = dns.getServers();
  for (const resolver of publicResolvers) {
    try {
      dns.setServers([resolver]);
      const result = await dns.promises.lookup(hostname, { family: 4, verbatim: true, hints: 0 });
      const address = typeof result === 'string' ? result : result.address;
      if (address) {
        logger.debug(`Resolved ${hostname} -> ${address} via public DNS ${resolver}`);
        return address;
      }
    } catch {
      /* try next */
    } finally {
      dns.setServers(beforeServers);
    }
  }
  return null;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Derive the Neon `options=endpoint=<id>` query parameter from the hostname.
 *
 * Neon's serverless proxy routes connections by endpoint. When we pre-resolve
 * DNS to an IPv4 literal and connect by IP, the endpoint info is lost from the
 * URL — `node-postgres` sends the raw `options` field in the startup packet,
 * and Neon's proxy uses that to identify the endpoint. Without it, every
 * *actual* query fails with P1010 ("Endpoint ID is not specified") even though
 * `$connect()` succeeds.
 */
const neonOptionsParam = (parsed: URL, hostname: string): string | undefined => {
  const existing = parsed.searchParams.get('options');
  const existingParts = existing ? existing.split('&') : [];
  if (existingParts.some((p) => p.startsWith('endpoint='))) return existing ?? undefined;
  if (!hostname.endsWith('.neon.tech')) return existing ?? undefined;
  const label = hostname.split('.')[0] ?? '';
  let endpointId = label;
  if (endpointId.endsWith('-pooler')) endpointId = endpointId.slice(0, -'-pooler'.length);
  if (!endpointId || !endpointId.startsWith('ep-')) return existing ?? undefined;
  const endpointVal = `endpoint=${endpointId}`;
  return existing ? `${existing}&${endpointVal}` : endpointVal;
};

/**
 * Build a `pg.PoolConfig` that targets the IPv4 address of the Postgres host,
 * preserving Neon's `options=endpoint` for SNI routing and setting
 * `ssl.servername` so the TLS handshake carries the original hostname even
 * though the TCP socket connects to a literal IP.
 *
 * Falls back to the raw connection string for localhost / unresolvable hosts.
 */
export const buildPostgresPoolConfig = async (logger: winston.Logger): Promise<PoolConfig> => {
  const raw = process.env['DATABASE_URL'];
  if (!raw) throw new Error('DATABASE_URL is not set');
  const baseSsl = { rejectUnauthorized: false } as const;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { connectionString: withPgSslMode(raw), ssl: baseSsl };
  }

  const hostname = parsed.hostname;
  if (!hostname || LOCAL_HOSTS.has(hostname) || hostname.endsWith('.local')) {
    return { connectionString: withPgSslMode(raw), ssl: baseSsl };
  }

  const ipv4 = await resolveIPv4(hostname, logger);
  if (ipv4) {
    logger.debug(`Resolved ${hostname} -> ${ipv4} (IPv4 forced for Postgres)`);
    const options = neonOptionsParam(parsed, hostname);
    return {
      host: ipv4,
      port: parsed.port ? Number(parsed.port) : 5432,
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: parsed.pathname.replace(/^\//, '') || undefined,
      ssl: { rejectUnauthorized: false, servername: hostname },
      options,
    };
  }

  logger.warn(`IPv4 pre-resolve failed for ${hostname}; falling back to connection string`);
  return { connectionString: withPgSslMode(raw), ssl: baseSsl };
};