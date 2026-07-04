/**
 * Winston-based structured logger with correlation ID support.
 * Every request gets a UUID so you can trace it through all steps.
 */
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, correlationId, ...rest }) => {
          const cid = correlationId ? ` [${correlationId}]` : '';
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} ${level}${cid}: ${message}${extra}`;
        })
      )
    })
  ]
});

module.exports = logger;
