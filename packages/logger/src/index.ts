import { type LoggerOptions, levels, type Logger as PinoLogger, pino } from 'pino';

/**
 * Creates a logger instance
 * @param name Service name
 * @param pid Process/cluster ID
 * @returns Pino logger instance
 */
export const createLogger = (name: string, pid?: string): PinoLogger => {
  const options: LoggerOptions = {
    name,
    level: process.env.LOGGER_LEVEL ?? 'info',
  };

  if (process.env.NODE_ENV !== 'production') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l o',
      },
    };
  }

  if (pid) {
    options.base = { pid };
  }

  return pino(options);
};

export const loggerLevels = Object.values(levels.labels);
export type { PinoLogger as Logger };
