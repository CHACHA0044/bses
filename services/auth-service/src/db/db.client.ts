import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger, withPgSslMode } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'prisma-client' });

/**
 * Resolve a hostname to an IPv4 literal.
 *
 * Uses async DNS resolution to avoid the race condition where `dns.resolve4`
 * callback-based API was checked synchronously (always returning false on
 * first call, falling through to the slower public DNS resolver strategy).
 */
const resolveIPv4 = async (hostname: string): Promise<string | null> => {
  // Strategy 2 — hard-coded override wins.
  const override = process.env['DATABASE_HOST'];
  if (override && override !== hostname) {
    logger.info(`Using DATABASE_HOST override ${override} for ${hostname}`);
    return override;
  }

  // Strategy 1 — Node's internal DNS (async).
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses && addresses.length > 0) {
      return addresses[0]!;
    }
  } catch {
    // fall through
  }

  // Strategy 3 — try public DNS resolvers (Google 8.8.8.8, Cloudflare 1.1.1.1)
  // via dns.promises.lookup with explicit family: 4.
  const publicResolvers = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
  const beforeServers = dns.getServers();
  for (const resolver of publicResolvers) {
    try {
      dns.setServers([resolver]);
      const result = await dns.promises.lookup(hostname, { family: 4, verbatim: true, hints: 0 });
      const address = typeof result === 'string' ? result : result.address;
      if (address) {
        logger.info(`Resolved ${hostname} -> ${address} via public DNS ${resolver}`);
        return address;
      }
    } catch {
      // try next resolver
    } finally {
      dns.setServers(beforeServers);
    }
  }

  return null;
};

/**
 * Build a pg.PoolConfig that targets the IPv4 address of the Postgres host.
 *
 * Why: Render's free tier does not expose IPv6. Supabase hostnames
 * (`db.<ref>.supabase.co`) resolve to both A and AAAA records and the
 * underlying `pg` pool can still pick the IPv6 address depending on the
 * Node/OS resolver. By pre-resolving the hostname ourselves and passing the
 * literal IPv4 address into `PoolConfig.host`, DNS is taken out of the
 * runtime path entirely: pg will *only* see an IPv4 socket and ENETUNREACH
 * is impossible.
 *
 * Falls back to the raw connection string if IPv4 resolution fails.
 */
const buildPoolConfig = async (): Promise<PoolConfig> => {
  const raw = process.env['DATABASE_URL'];
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  const ssl = { rejectUnauthorized: false } as const;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { connectionString: withPgSslMode(raw), ssl };
  }

  const hostname = parsed.hostname;
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  ) {
    return { connectionString: withPgSslMode(raw), ssl };
  }

  const ipv4 = await resolveIPv4(hostname);
  if (ipv4) {
    logger.info(`Resolved ${hostname} -> ${ipv4} (IPv4 forced for Postgres)`);
    return {
      host: ipv4,
      port: parsed.port ? Number(parsed.port) : 5432,
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: parsed.pathname.replace(/^\//, '') || undefined,
      ssl,
    };
  }

  logger.warn(`IPv4 pre-resolve failed for ${hostname}; falling back to connection string`);
  return { connectionString: withPgSslMode(raw), ssl };
};

let prismaInstance: PrismaClient | null = null;
let prismaInitializing: Promise<PrismaClient> | null = null;

/**
 * Injects an externally-created PrismaClient (used by the merged-service
 * process so auth + consumer + notification share ONE database client).
 * Call with `null` to reset to standalone mode.
 */
export const setPrismaClient = (client: PrismaClient | null): void => {
  prismaInstance = client;
  prismaInitializing = null;
};

export const getPrismaClient = (): PrismaClient => {
  if (prismaInstance) return prismaInstance;
  // If initialization is in progress, throw to let callers use connectDatabase() instead
  if (prismaInitializing) {
    throw new Error('PrismaClient is initializing — use connectDatabase() for first access');
  }
  throw new Error('PrismaClient not initialized — call connectDatabase() first');
};

export const connectDatabase = async (): Promise<PrismaClient> => {
  if (prismaInstance) return prismaInstance;
  if (prismaInitializing) return prismaInitializing;

  prismaInitializing = (async () => {
    const poolConfig = await buildPoolConfig();
    const adapter = new PrismaPg(poolConfig);
    const client = new PrismaClient({
      adapter,
      log:
        process.env['NODE_ENV'] === 'production'
          ? ['error', 'warn']
          : ['error', 'warn', 'info', 'query'],
    });
    await client.$connect();
    prismaInstance = client;
    prismaInitializing = null;
    return client;
  })();

  try {
    return await prismaInitializing;
  } catch (err) {
    prismaInitializing = null;
    throw err;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('Auth Service database disconnected');
  }
};

export const checkDatabaseHealth = async (): Promise<{
  ready: boolean;
  details?: Record<string, unknown>;
}> => {
  try {
    if (!prismaInstance) {
      return { ready: false, details: { error: 'PrismaClient not initialized' } };
    }
    await prismaInstance.$queryRaw`SELECT 1`;
    return { ready: true };
  } catch (err) {
    logger.error('Database health check failed', { error: String(err) });
    return { ready: false, details: { error: String(err) } };
  }
};
