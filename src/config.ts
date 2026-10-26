import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const configSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
});
export const config = configSchema.parse(process.env);
