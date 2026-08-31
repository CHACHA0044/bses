import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'prisma-client' });

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

export const connectDatabase = async (maxRetries = 5, initialDelayMs = 1000): Promise<PrismaClient> => {
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
      logger.warn(`PostgreSQL connection attempt ${attempts}/${maxRetries} failed: ${err instanceof Error ? err.message : String(err)}`);
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

export const checkDatabaseHealth = async (): Promise<{ ready: boolean; details?: Record<string, unknown> }> => {
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
