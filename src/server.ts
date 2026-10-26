import { app } from './api.js';
import { pool } from './db.js';
import { config } from './config.js';
const server = app.listen(config.PORT, () => {
  console.log(`🚀 OutboxWorks API Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
});
// Graceful Shutdown Handler
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down HTTP server gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    await pool.end();
    console.log('Database pool closed.');
    process.exit(0);
  });
  // Force shutdown after 10 seconds if connections are hanging
  setTimeout(() => {
    console.error('Forcing shutdown due to hanging connections.');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
