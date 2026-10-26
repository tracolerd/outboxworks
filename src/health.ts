import { pool } from './db.js';
async function checkHealth() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version();');
    console.log('✅ Database connection successful!');
    console.log('PostgreSQL Version:', result.rows[0].version);
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:');
    if (error instanceof Error) {
        console.error(error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}
checkHealth();
