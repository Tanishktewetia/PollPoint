import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
