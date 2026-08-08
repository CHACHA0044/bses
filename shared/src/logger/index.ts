import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

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
  const resolvedLogDir = path.resolve(process.cwd(), logDir);

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isProduction ? prodFormat : devFormat,
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

  return winston.createLogger({
    level: isProduction ? 'warn' : 'debug',
    defaultMeta: { service },
    transports,
    exitOnError: false,
  });
};
