import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  ADMIN_SECRET: z.string().min(16),
  PRODUCER_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
});
export const config = configSchema.parse(process.env);
