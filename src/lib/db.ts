import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before using PostgreSQL persistence.");
  }

  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL
  });

  return pool;
}
