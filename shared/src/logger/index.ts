import winston from 'winston';

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
}

export const createLogger = ({ service }: LoggerOptions): winston.Logger => {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const isTest = process.env['NODE_ENV'] === 'test';
  const logFormat = process.env['LOG_FORMAT'] ?? 'pretty';

  const consoleFormat =
    logFormat === 'json' ? prodFormat : isProduction ? readableFormat : devFormat;

  // Production uses Console only — Render captures stdout/stderr directly.
  // File logging (DailyRotateFile) is removed to eliminate disk I/O contention,
  // reduce memory overhead (10 file handles + rotation timers across 5 processes),
  // and fix delayed log visibility in Render's dashboard.
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: consoleFormat,
      silent: isTest,
    }),
  ];

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
