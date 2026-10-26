import fs from 'fs/promises';
import path from 'path';
import { pool } from './db.js';
async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('⏳ Starting database migration...');
    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'src', 'schema.sql');
    let sql = await fs.readFile(sqlPath, 'utf-8');
    // Windows PowerShell-এর UTF-8 BOM রিমুভ করা
    sql = sql.replace(/^\uFEFF/, '');
    // Execute inside a transaction
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:');
    if (error instanceof Error) {
        console.error(error.message);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
runMigrations();
