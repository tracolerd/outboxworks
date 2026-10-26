import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
export const pool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  max: 20, // Max concurrent connections to prevent pool exhaustion
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
// Catch idle client errors to prevent process crashes
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client', err);
});
