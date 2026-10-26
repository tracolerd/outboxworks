import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';
async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('⏳ Starting database migrations...');
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const migrationsDir = path.join(process.cwd(), 'src', 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const appliedMigrations = new Set(rows.map(r => r.version));
    let appliedCount = 0;
    for (const file of sqlFiles) {
      if (!appliedMigrations.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        let sql = await fs.readFile(filePath, 'utf-8');
        sql = sql.replace(/^\uFEFF/, ''); // Strip BOM for Windows PowerShell safety
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Migration ${file} applied successfully.`);
        appliedCount++;
      }
    }
    if (appliedCount === 0) {
      console.log('✅ Database is already up to date.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
// Only run automatically if called directly
if (import.meta.dirname && process.argv[1].endsWith('migrate.ts')) {
  runMigrations();
}
