/**
 * Structured Logging with Pino
 *
 * Provides a singleton Pino logger with structured JSON output.
 * In development, uses pino-pretty for human-readable logs.
 * In production, outputs JSON for log aggregation systems.
 *
 * Configuration:
 * - LOG_LEVEL env var (default: 'info')
 * - NODE_ENV controls pretty-printing
 *
 * @module lib/logger
 */

import pino from 'pino'

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const IS_DEV = process.env.NODE_ENV === 'development'

/**
 * Singleton logger instance.
 * Pretty-prints in development, JSON in production.
 */
export const logger = pino({
  level: LOG_LEVEL,
  ...(IS_DEV
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: JSON output with timestamp
        formatters: {
          level(label) {
            return { level: label }
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
})

/**
 * Context for child loggers, typically bound to a request.
 */
export interface LoggerContext {
  requestId?: string
  userId?: string
  projectId?: string
  method?: string
  path?: string
}

/**
 * Create a child logger with bound context fields.
 *
 * @example
 * ```ts
 * const log = createLogger({ requestId: 'abc', userId: '123' })
 * log.info('Processing request')
 * // => {"level":"info","requestId":"abc","userId":"123","msg":"Processing request"}
 * ```
 */
export function createLogger(context: LoggerContext): pino.Logger {
  return logger.child(context)
}
