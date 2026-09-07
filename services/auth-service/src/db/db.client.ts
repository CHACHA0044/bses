import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger, buildPostgresPoolConfig } from '@bses/shared';

const logger = createLogger({ service: 'prisma-client' });

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
    const poolConfig = await buildPostgresPoolConfig(logger);
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
