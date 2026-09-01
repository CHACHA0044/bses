import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';
import dns from 'node:dns';
import { URL } from 'node:url';
import type { PoolConfig } from 'pg';

const logger = createLogger({ service: 'document-db' });

/**
 * Resolve a hostname to an IPv4 literal.
 *
 * Three independent strategies, tried in order:
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
 * 3. Public DNS resolvers (Google 8.8.8.8, Cloudflare 1.1.1.1) via
 *    `dns.lookup` with `family: 4`. Some authoritative DNS servers (like
 *    Supabase's) only publish AAAA records for certain hostnames, but
 *    public resolvers may have cached A records from a different path.
 *
 * Returns null if none of the strategies work — caller falls back to the
 * raw connection string (which will then use the OS resolver and may hit
 * IPv6).
 */
const resolveIPv4 = (hostname: string): string | null => {
  // Strategy 2 — hard-coded override wins.
  const override = process.env['DATABASE_HOST'];
  if (override && override !== hostname) {
    logger.info(`Using DATABASE_HOST override ${override} for ${hostname}`);
    return override;
  }

  // Strategy 1 — Node's internal DNS, callback form.
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

  // Strategy 3 — try public DNS resolvers (Google 8.8.8.8, Cloudflare 1.1.1.1)
  // via dns.lookup with explicit family. We temporarily swap the global
  // server list, run the lookup, and restore. dns.lookup with a callback
  // is synchronous on most resolvers (c-ares), so the result is populated
  // before the call returns.
  const publicResolvers = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
  const beforeServers = dns.getServers();
  for (const resolver of publicResolvers) {
    try {
      let resolved: string | null = null;
      let finished = false;
      dns.setServers([resolver]);
      try {
        dns.lookup(
          hostname,
          { family: 4, verbatim: true, hints: 0 },
          (err, address) => {
            finished = true;
            if (!err && address) {
              resolved = address;
            }
          },
        );
      } finally {
        dns.setServers(beforeServers);
      }
      if (finished && resolved) {
        logger.info(`Resolved ${hostname} -> ${resolved} via public DNS ${resolver}`);
        return resolved;
      }
    } catch {
      // try next resolver
    }
  }

  return null;
};

/**
 * Build a pg.PoolConfig that targets the IPv4 address of the Postgres host.
 *
 * Render's free tier does not expose IPv6. Supabase hostnames resolve to AAAA
 * records and the `pg` pool can still pick the IPv6 address depending on the
 * resolver — even with `dns.setDefaultResultOrder('ipv4first')`, which only
 * affects `dns.lookup`, not every code path pg may take.
 *
 * By pre-resolving the hostname ourselves and passing the literal IPv4
 * address into `PoolConfig.host`, DNS is taken out of the runtime path
 * entirely: pg will only see the IPv4 socket and ENETUNREACH is
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
