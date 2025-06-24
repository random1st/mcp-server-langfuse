import dotenv from 'dotenv';
import { z } from 'zod/v4';

dotenv.config();

const Config = z.object({
  LANGFUSE_BASEURL: z.string(),
  LANGFUSE_PUBLIC_KEY: z.string(),
  LANGFUSE_SECRET_KEY: z.string(),
  PORT: z.string().transform(Number),
});

type Config = z.infer<typeof Config>;

const config = Config.parse(process.env);

export default config;
