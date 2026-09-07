import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger, withPgSslMode } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'notification-db' });

const resolveIPv4 = async (hostname: string): Promise<string | null> => {
  const override = process.env['DATABASE_HOST'];
  if (override && override !== hostname) {
    logger.info(`Using DATABASE_HOST override ${override} for ${hostname}`);
    return override;
  }
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses && addresses.length > 0) return addresses[0]!;
  } catch { /* fall through */ }
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
    } catch { /* try next */ }
    finally { dns.setServers(beforeServers); }
  }
  return null;
};

const buildPoolConfig = async (): Promise<PoolConfig> => {
  const raw = process.env['DATABASE_URL'];
  if (!raw) throw new Error('DATABASE_URL is not set');
  const ssl = { rejectUnauthorized: false } as const;
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { return { connectionString: withPgSslMode(raw), ssl }; }
  const hostname = parsed.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local')) {
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

/**
 * Lazily-created Prisma client for the notification service. Only used to
 * persist `notification_logs` rows for audit / DPDP traceability — the
 * notification dispatch itself never depends on the database.
 */
export const getPrismaClient = (): PrismaClient => {
  if (prismaInstance) return prismaInstance;
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
    const client = new PrismaClient({ adapter });
    await client.$connect();
    prismaInstance = client;
    prismaInitializing = null;
    return client;
  })();
  try { return await prismaInitializing; }
  catch (err) { prismaInitializing = null; throw err; }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('Notification Service database disconnected');
  }
};
