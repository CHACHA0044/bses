import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'prisma-client' });

/**
 * Synchronously resolve a hostname to an IPv4 literal address using the
 * callback-style dns.lookup. We use the callback form rather than the
 * overloaded `dns.lookup(host, options)` because the overloaded signature
 * only exposes a Promise-based return type to TypeScript. The callback
 * form is fully synchronous when invoked with `verbatim: true` and the
 * resolver honors the family=4 hint, so the result is available before
 * the call returns.
 *
 * Returns null if resolution fails (e.g. the host has no A records).
 */
const resolveIPv4 = (hostname: string): string | null => {
  // `verbatim: true` ensures the family hint is honored (no AAAA fallback).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeDns = dns as unknown as {
    lookup(
      hostname: string,
      options: { family: 4; verbatim: true },
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ): void;
  };
  let resolved: string | null = null;
  let finished = false;
  try {
    nodeDns.lookup(hostname, { family: 4, verbatim: true }, (err, address) => {
      finished = true;
      if (!err && address) {
        resolved = address;
      }
    });
  } catch {
    return null;
  }
  return finished && resolved ? resolved : null;
};

/**
 * Build a pg.PoolConfig that targets the IPv4 address of the Postgres host.
 *
 * Why: Render's free tier does not expose IPv6. Supabase hostnames
 * (`db.<ref>.supabase.co`) resolve to both A and AAAA records and the
 * underlying `pg` pool can still pick the IPv6 address depending on the
 * Node/OS resolver — even with `dns.setDefaultResultOrder('ipv4first')`,
 * which only affects `dns.lookup`, not every code path pg may take.
 *
 * By pre-resolving the hostname ourselves and passing the literal IPv4
 * address into `PoolConfig.host`, DNS is taken out of the runtime path
 * entirely: pg will *only* see the IPv4 socket and ENETUNREACH is impossible.
 *
 * Falls back to the raw connection string (with normal DNS) if the IPv4
 * lookup fails — local dev with localhost / 127.0.0.1 is short-circuited.
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
