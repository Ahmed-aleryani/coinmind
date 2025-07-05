import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

// Create logger that works with Next.js without worker threads
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Custom formatters for better readability
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  
  // Simple timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Pretty print in development (without pino-pretty to avoid worker issues)
  ...(isDevelopment && {
    prettyPrint: false, // Disable built-in pretty print that might cause issues
  }),
});

export default logger; 