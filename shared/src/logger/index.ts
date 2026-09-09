import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/**
 * Compact, human-readable production format.
 *
 * Renders as:
 *   [HH:mm:ss] [service] 🔧 message | key=value
 *
 * Render already provides timestamps at the platform level, but we include
 * a short HH:mm:ss for local/dev readability. The emoji prefix is part of
 * the message — operators can scan the log stream visually.
 */
const readableFormat = combine(
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, service, stack, ...meta }) => {
    const svc = String(service ?? 'app');
    const msg = String(stack ?? message);

    const metaParts: string[] = [];
    if (Object.keys(meta).length > 0) {
      for (const [k, v] of Object.entries(meta)) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'object') {
          try {
            metaParts.push(`${k}=${JSON.stringify(v)}`);
          } catch {
            metaParts.push(`${k}=[object]`);
          }
        } else {
          metaParts.push(`${k}=${String(v)}`);
        }
      }
    }
    const suffix = metaParts.length > 0 ? ` | ${metaParts.join(' | ')}` : '';
    return `[${timestamp}] [${svc}] ${msg}${suffix}`;
  }),
);

/**
 * Colorized dev format — same structure but with ANSI colors for terminal.
 */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, service, stack, ...meta }) => {
    const svc = String(service ?? 'app');
    const msg = String(stack ?? message);
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${svc}] ${msg}${metaStr}`;
  }),
);

/** JSON format for machine-parseable output (LOG_FORMAT=json). */
const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

export interface LoggerOptions {
  service: string;
}

export const createLogger = ({ service }: LoggerOptions): winston.Logger => {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const isTest = process.env['NODE_ENV'] === 'test';
  const logFormat = process.env['LOG_FORMAT'] ?? 'pretty';

  const consoleFormat =
    logFormat === 'json' ? jsonFormat : isProduction ? readableFormat : devFormat;

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: consoleFormat,
      silent: isTest,
    }),
  ];

  const defaultLevel = isProduction ? 'info' : 'debug';
  const level = process.env['LOG_LEVEL'] || defaultLevel;

  return winston.createLogger({
    level,
    defaultMeta: { service },
    transports,
    exitOnError: false,
  });
};
