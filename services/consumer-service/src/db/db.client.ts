import { PrismaClient } from '@prisma/client';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'consumer-db' });

let prismaClient: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    prismaClient.$on('error' as never, (e: any) => {
      logger.error('Prisma Client Error', { error: e.message });
    });

    prismaClient.$on('warn' as never, (e: any) => {
      logger.warn('Prisma Client Warning', { warning: e.message });
    });
  }
  return prismaClient;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info('Consumer Service database disconnected');
  }
};
