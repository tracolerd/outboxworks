import test from 'node:test';
import assert from 'node:assert';
import { pool } from './db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
test('Database Migrations Integrity', async (t) => {
  const client = await pool.connect();
  try {
    // We run the test in a transaction and rollback at the end
    // so we don't pollute the database state during automated tests.
    await client.query('BEGIN');
    // Ensure migrations table exists
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
    // Test running 001_initial_schema.sql
    const migrationsDir = path.join(process.cwd(), 'src', 'migrations');
    const sql = await fs.readFile(path.join(migrationsDir, '001_initial_schema.sql'), 'utf-8');
    const cleanSql = sql.replace(/^\uFEFF/, '');
    // This should execute successfully if syntax is valid
    await client.query(cleanSql);
    // Verify core tables were created
    const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = result.rows.map(r => r.table_name);
    assert.ok(tables.includes('endpoints'), 'endpoints table missing');
    assert.ok(tables.includes('events'), 'events table missing');
    assert.ok(tables.includes('deliveries'), 'deliveries table missing');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    // Do not end the pool here because other test files might be running concurrently
  }
});
