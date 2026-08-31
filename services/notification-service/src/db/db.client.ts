import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-db' });

let prismaClient: PrismaClient | null = null;

/**
 * Lazily-created Prisma client for the notification service. Only used to
 * persist `notification_logs` rows for audit / DPDP traceability — the
 * notification dispatch itself never depends on the database.
 */
export const getPrismaClient = (): PrismaClient => {
  if (!prismaClient) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info('Notification Service database disconnected');
  }
};
