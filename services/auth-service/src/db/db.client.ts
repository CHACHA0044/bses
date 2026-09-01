import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'prisma-client' });

/**
 * Resolve a hostname to an IPv4 literal.
 *
 * Two independent strategies, tried in order:
 *
 * 1. `dns.resolve4` — Node's internal DNS (uses the `dns` module's
 *    configured server, NOT the OS resolver). Render's free tier has a
 *    broken/IPv6-only OS resolver that can't return A records for
 *    `db.<ref>.supabase.co`, but Node's internal DNS often can. This is
 *    the first thing we try.
 *
 * 2. `DATABASE_HOST` env var — a hard-coded IPv4 literal you set in the
 *    Render UI. Use this if even Node's internal DNS can't resolve the
 *    hostname from Render's network. Get the A record once from your own
 *    machine (`nslookup db.<ref>.supabase.co`) and paste it here.
 *
 * Returns null if neither strategy works — caller falls back to the raw
 * connection string (which will then use the OS resolver and may hit IPv6).
 */
const resolveIPv4 = (hostname: string): string | null => {
  // Strategy 2 — hard-coded override wins.
  const override = process.env['DATABASE_HOST'];
  if (override && override !== hostname) {
    logger.info(`Using DATABASE_HOST override ${override} for ${hostname}`);
    return override;
  }

  // Strategy 1 — Node's internal DNS, callback form (synchronous on most
  // resolvers but we still wrap defensively in case the callback fires async).
  try {
    let resolved: string | null = null;
    let finished = false;
    dns.resolve4(hostname, (err, addresses) => {
      finished = true;
      if (!err && addresses && addresses.length > 0) {
        resolved = addresses[0]!;
      }
    });
    if (finished && resolved) {
      return resolved;
    }
  } catch {
    // fall through
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
const buildPoolConfig = (): PoolConfig => {
  const raw = process.env['DATABASE_URL'];
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  const ssl = { rejectUnauthorized: false } as const;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { connectionString: raw, ssl };
  }

  const hostname = parsed.hostname;
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  ) {
    return { connectionString: raw, ssl };
  }

  const ipv4 = resolveIPv4(hostname);
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
  return { connectionString: raw, ssl };
};

let prismaInstance: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prismaInstance) {
    const adapter = new PrismaPg(buildPoolConfig());
    prismaInstance = new PrismaClient({
      adapter,
      log:
        process.env['NODE_ENV'] === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }
  return prismaInstance;
};

export const connectDatabase = async (
  maxRetries = 5,
  initialDelayMs = 1000,
): Promise<PrismaClient> => {
  const prisma = getPrismaClient();
  let attempts = 0;
  let delay = initialDelayMs;

  while (attempts < maxRetries) {
    try {
      attempts++;
      await prisma.$connect();
      logger.info('Successfully connected to PostgreSQL via Prisma ORM');
      return prisma;
    } catch (err: unknown) {
      logger.warn(
        `PostgreSQL connection attempt ${attempts}/${maxRetries} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempts >= maxRetries) {
        logger.error('Max PostgreSQL connection retries reached. Database unavailable.');
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  return prisma;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaInstance) {
    logger.info('Disconnecting Prisma PostgreSQL client...');
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('Prisma PostgreSQL client disconnected cleanly.');
  }
};

export const checkDatabaseHealth = async (): Promise<{
  ready: boolean;
  details?: Record<string, unknown>;
}> => {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  } catch (err: unknown) {
    return {
      ready: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }
};
