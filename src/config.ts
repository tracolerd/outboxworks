import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  ADMIN_SECRET: z.string().min(16, 'ADMIN_SECRET must be at least 16 characters long for production security'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
});
// This will explicitly throw and crash at startup if required env vars are missing
export const config = configSchema.parse(process.env);
