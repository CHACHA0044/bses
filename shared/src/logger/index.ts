import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const readableFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, service, stack, ...meta }) => {
    const levelStr = String(level).toUpperCase();
    const serviceStr = String(service ?? 'app');
    const msgStr = String(stack ?? message);

    let metaParts: string[] = [];
    if (Object.keys(meta).length > 0) {
      metaParts = Object.entries(meta).map(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          try {
            return `${k}=${JSON.stringify(v)}`;
          } catch {
            return `${k}=[object]`;
          }
        }
        return `${k}=${String(v)}`;
      });
    }

    const metaStr = metaParts.length > 0 ? ` (${metaParts.join(', ')})` : '';
    return `[${String(timestamp)}] [${serviceStr}] ${levelStr}: ${msgStr}${metaStr}`;
  }),
);

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, service, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${String(timestamp)}] [${String(service ?? 'app')}] ${level}: ${String(stack ?? message)}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export interface LoggerOptions {
  service: string;
  logDir?: string;
}

export const createLogger = ({ service, logDir = 'logs' }: LoggerOptions): winston.Logger => {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const isTest = process.env['NODE_ENV'] === 'test';
  const logFormat = process.env['LOG_FORMAT'] ?? 'pretty';
  const resolvedLogDir = path.resolve(process.cwd(), logDir);

  const consoleFormat =
    logFormat === 'json' ? prodFormat : isProduction ? readableFormat : devFormat;

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: consoleFormat,
      silent: isTest,
    }),
  ];

  if (isProduction) {
    transports.push(
      new DailyRotateFile({
        dirname: resolvedLogDir,
        filename: `${service}-%DATE%-combined.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: prodFormat,
      }),
      new DailyRotateFile({
        dirname: resolvedLogDir,
        filename: `${service}-%DATE%-error.log`,
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '30d',
        format: prodFormat,
      }),
    );
  }

  // Production defaults to 'info' so request logs, login attempts, and other
  // diagnostic logs are visible in Render's log stream. Operators can dial
  // this down via LOG_LEVEL=warn if they want less noise. Dev defaults to
  // 'debug' for verbose local development.
  const defaultLevel = isProduction ? 'info' : 'debug';
  const level = process.env['LOG_LEVEL'] || defaultLevel;

  return winston.createLogger({
    level,
    defaultMeta: { service },
    transports,
    exitOnError: false,
  });
};
