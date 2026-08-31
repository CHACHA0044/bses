import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';
import dns from 'node:dns';

const logger = createLogger({ service: 'prisma-client' });

/**
 * Force IPv4 DNS resolution for the entire process.
 *
 * Many PaaS providers (Render free tier, some serverless runtimes) only expose
 * IPv4 networking. When a managed Postgres hostname (e.g. Supabase's
 * `db.<ref>.supabase.co`) returns an AAAA record, node-postgres throws
 * `connect ENETUNREACH ::<ip>:5432`. Setting the default DNS result order to
 * `ipv4first` makes every `dns.lookup` (which is what pg/Prisma use) return the
 * A record when one exists, sidestepping the problem on every host.
 *
 * This is a process-wide, one-time setting and is safe — IPv4 is universally
 * supported and is the more common Postgres endpoint today.
 */
dns.setDefaultResultOrder('ipv4first');

let prismaInstance: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prismaInstance) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
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
    return { ready: true, details: { database: 'PostgreSQL', status: 'connected' } };
  } catch (err: unknown) {
    return {
      ready: false,
      details: {
        database: 'PostgreSQL',
        error: err instanceof Error ? err.message : 'Database ping failed',
      },
    };
  }
};
