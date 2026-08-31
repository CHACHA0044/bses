import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'document-db' });

let prismaClient: PrismaClient | null = null;

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
    logger.info('Document Service database disconnected');
  }
};
