import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
export const pool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
});
