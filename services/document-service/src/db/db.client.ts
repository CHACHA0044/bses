import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'document-db' });

/**
 * Synchronously resolve a hostname to an IPv4 literal using the callback-style
 * dns.lookup. The callback form is the only unambiguous way to invoke
 * dns.lookup synchronously through TypeScript's overloaded signatures.
 * Returns null on failure.
 */
const resolveIPv4 = (hostname: string): string | null => {
  const nodeDns = dns as unknown as {
    lookup(
      hostname: string,
      options: { family: 4; verbatim: true },
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ): void;
  };
  let resolved: string | null = null;
  try {
    nodeDns.lookup(hostname, { family: 4, verbatim: true }, (err, address) => {
      if (!err && address) {
        resolved = address;
      }
    });
  } catch {
    return null;
  }
  return resolved;
};

/**
 * Build a pg.PoolConfig that targets the IPv4 address of the Postgres host.
 *
 * Render's free tier does not expose IPv6. Supabase hostnames resolve to AAAA
 * records and the `pg` pool can still pick the IPv6 address depending on the
 * resolver — even with `dns.setDefaultResultOrder('ipv4first')`, which only
 * affects `dns.lookup`. Pre-resolving the hostname ourselves and passing the
 * literal IPv4 address into `PoolConfig.host` removes DNS from the runtime
 * path entirely: pg will only see the IPv4 socket and ENETUNREACH is
 * impossible. Falls back to the raw connection string on lookup failure.
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

let prismaClient: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prismaClient) {
    const adapter = new PrismaPg(buildPoolConfig());
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info('Document Service database disconnected');
  }
};
