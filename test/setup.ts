import dotenv from 'dotenv';
import path from 'path';

// Load local workspace .env if present
dotenv.config();

// Set required defaults for test environment if not set
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = process.env['PORT'] || '3000';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] || 'postgresql://postgres:postgres@localhost:5432/bses_test';
process.env['MONGODB_URI'] = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/bses_test_documents';
process.env['GRIDFS_BUCKET'] = process.env['GRIDFS_BUCKET'] || 'documents';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'a'.repeat(64);
process.env['JWT_REFRESH_SECRET'] = process.env['JWT_REFRESH_SECRET'] || 'b'.repeat(64);
process.env['COOKIE_SECRET'] = process.env['COOKIE_SECRET'] || 'c'.repeat(64);
process.env['SESSION_SECRET'] = process.env['SESSION_SECRET'] || 'd'.repeat(64);
process.env['AES_SECRET_KEY'] = process.env['AES_SECRET_KEY'] || '0123456789abcdef'.repeat(4);
process.env['AES_IV'] = process.env['AES_IV'] || '0123456789abcdef'.repeat(2);
process.env['BCRYPT_ROUNDS'] = process.env['BCRYPT_ROUNDS'] || '10';
process.env['CORS_ORIGINS'] = process.env['CORS_ORIGINS'] || 'http://localhost:3001';
process.env['INTERNAL_SERVICE_SECRET'] = process.env['INTERNAL_SERVICE_SECRET'] || 'e'.repeat(64);
process.env['AUTH_SERVICE_URL'] = process.env['AUTH_SERVICE_URL'] || 'http://localhost:3010';
process.env['CONSUMER_SERVICE_URL'] = process.env['CONSUMER_SERVICE_URL'] || 'http://localhost:3011';
process.env['DOCUMENT_SERVICE_URL'] = process.env['DOCUMENT_SERVICE_URL'] || 'http://localhost:3012';
process.env['NOTIFICATION_SERVICE_URL'] = process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3013';
