import { MongoClient, GridFSBucket, Db } from 'mongodb';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'mongo-client' });

let mongoClientInstance: MongoClient | null = null;
let dbInstance: Db | null = null;
let gridfsBucketInstance: GridFSBucket | null = null;

export interface MongoConfigOptions {
  uri: string;
  bucketName?: string;
  maxPoolSize?: number;
}

export const connectMongoDB = async (
  options: MongoConfigOptions,
  maxRetries = 5,
  initialDelayMs = 1000,
): Promise<{ client: MongoClient; db: Db; bucket: GridFSBucket }> => {
  const { uri, bucketName = 'documents', maxPoolSize = 10 } = options;
  let attempts = 0;
  let delay = initialDelayMs;

  // Redact the password from a MongoSRV URI for safe logging.
  const redactUri = (raw: string): string =>
    raw.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1***$3');

  while (attempts < maxRetries) {
    try {
      attempts++;
      logger.info(
        `Connecting to MongoDB Atlas (Attempt ${attempts}/${maxRetries}) -> ${redactUri(uri)}`,
      );

      if (!mongoClientInstance) {
        mongoClientInstance = new MongoClient(uri, {
          maxPoolSize,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
        });
      }

      await mongoClientInstance.connect();
      dbInstance = mongoClientInstance.db();
      gridfsBucketInstance = new GridFSBucket(dbInstance, { bucketName });

      logger.info(`Successfully connected to MongoDB. GridFS bucket '${bucketName}' initialized.`);
      return { client: mongoClientInstance, db: dbInstance, bucket: gridfsBucketInstance };
    } catch (err: unknown) {
      logger.warn(
        `MongoDB connection attempt ${attempts}/${maxRetries} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempts >= maxRetries) {
        logger.error('Max MongoDB connection retries reached. Database unavailable.');
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error('Failed to connect to MongoDB');
};

export const getGridFSBucket = (): GridFSBucket => {
  if (!gridfsBucketInstance) {
    throw new Error('GridFS Bucket is not initialized. Call connectMongoDB() first.');
  }
  return gridfsBucketInstance;
};

export const disconnectMongoDB = async (): Promise<void> => {
  if (mongoClientInstance) {
    logger.info('Disconnecting MongoDB client...');
    await mongoClientInstance.close();
    mongoClientInstance = null;
    dbInstance = null;
    gridfsBucketInstance = null;
    logger.info('MongoDB client disconnected cleanly.');
  }
};

export const checkMongoHealth = async (): Promise<{
  ready: boolean;
  details?: Record<string, unknown>;
}> => {
  try {
    if (!dbInstance) {
      return { ready: false, details: { database: 'MongoDB GridFS', status: 'not_connected' } };
    }
    await dbInstance.admin().ping();
    return {
      ready: true,
      details: { database: 'MongoDB GridFS', status: 'connected', bucket: 'documents' },
    };
  } catch (err: unknown) {
    return {
      ready: false,
      details: {
        database: 'MongoDB GridFS',
        error: err instanceof Error ? err.message : 'MongoDB ping failed',
      },
    };
  }
};
