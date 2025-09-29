import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import {
  DATE_PATTERN,
  DEV_LOG_LEVEL,
  ERROR_LOG_LEVEL,
  LOG_COLORS,
  LOG_FILE_SETTINGS,
  LOG_PATHS,
  PROD_LOG_LEVEL,
  TIMESTAMP_FORMAT,
} from './constants';

winston.addColors(LOG_COLORS);

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: TIMESTAMP_FORMAT }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: TIMESTAMP_FORMAT }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const prodConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: TIMESTAMP_FORMAT }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level}]: ${message}`;
  }),
);

const createErrorFileTransport = () =>
  new DailyRotateFile({
    filename: LOG_PATHS.ERROR,
    datePattern: DATE_PATTERN,
    level: LOG_FILE_SETTINGS.ERROR.level,
    maxSize: LOG_FILE_SETTINGS.ERROR.maxSize,
    maxFiles: LOG_FILE_SETTINGS.ERROR.maxFiles,
    zippedArchive: true,
    format: prodFormat,
  });

const createCombinedFileTransport = () =>
  new DailyRotateFile({
    filename: LOG_PATHS.COMBINED,
    datePattern: DATE_PATTERN,
    level: LOG_FILE_SETTINGS.COMBINED.level,
    maxSize: LOG_FILE_SETTINGS.COMBINED.maxSize,
    maxFiles: LOG_FILE_SETTINGS.COMBINED.maxFiles,
    zippedArchive: true,
    format: prodFormat,
  });

const createDevConsoleTransport = (isDevelopment: boolean) =>
  new winston.transports.Console({
    level: isDevelopment ? DEV_LOG_LEVEL : ERROR_LOG_LEVEL,
    format: devFormat,
    silent: !isDevelopment && process.env.VERBOSE_TESTS !== 'true',
  });

const createProdConsoleTransport = () =>
  new winston.transports.Console({
    level: ERROR_LOG_LEVEL,
    format: prodConsoleFormat,
  });

const createExceptionHandler = () =>
  new winston.transports.File({
    filename: LOG_PATHS.EXCEPTIONS,
    format: prodFormat,
  });

const createRejectionHandler = () =>
  new winston.transports.File({
    filename: LOG_PATHS.REJECTIONS,
    format: prodFormat,
  });

export const createLogger = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';
  const isProduction = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [];

  if (isDevelopment || isTest) {
    transports.push(createDevConsoleTransport(isDevelopment));
  } else {
    transports.push(
      createErrorFileTransport(),
      createCombinedFileTransport(),
      createProdConsoleTransport(),
    );
  }

  return winston.createLogger({
    level:
      process.env.LOG_LEVEL ?? (isDevelopment ? DEV_LOG_LEVEL : PROD_LOG_LEVEL),
    format: isDevelopment ? devFormat : prodFormat,
    transports,
    exitOnError: false,
    exceptionHandlers: isProduction ? [createExceptionHandler()] : [],
    rejectionHandlers: isProduction ? [createRejectionHandler()] : [],
  });
};
