import path from 'path';

export const LOG_DIR = process.env.LOG_DIR ?? 'logs';

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly',
} as const;

export const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const SHORT_TIMESTAMP_FORMAT = 'HH:mm:ss';
export const DATE_PATTERN = 'YYYY-MM-DD';

export const DEV_LOG_LEVEL = LOG_LEVELS.DEBUG;
export const PROD_LOG_LEVEL = LOG_LEVELS.INFO;
export const ERROR_LOG_LEVEL = LOG_LEVELS.ERROR;

export const LOG_COLORS = {
  [LOG_LEVELS.ERROR]: 'red',
  [LOG_LEVELS.WARN]: 'yellow',
  [LOG_LEVELS.INFO]: 'blue',
  [LOG_LEVELS.HTTP]: 'magenta',
  [LOG_LEVELS.VERBOSE]: 'cyan',
  [LOG_LEVELS.DEBUG]: 'green',
  [LOG_LEVELS.SILLY]: 'gray',
};

export const LOG_FILE_SETTINGS = {
  ERROR: {
    maxSize: '10m',
    maxFiles: '30d',
    level: ERROR_LOG_LEVEL,
  },
  COMBINED: {
    maxSize: '20m',
    maxFiles: '14d',
    level: PROD_LOG_LEVEL,
  },
} as const;

export const LOG_PATHS = {
  ERROR: path.join(LOG_DIR, 'error-%DATE%.log'),
  COMBINED: path.join(LOG_DIR, 'combined-%DATE%.log'),
  EXCEPTIONS: path.join(LOG_DIR, 'exceptions.log'),
  REJECTIONS: path.join(LOG_DIR, 'rejections.log'),
} as const;
