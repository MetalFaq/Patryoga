import pg from "pg";

const { Pool } = pg;

type DatabaseGlobal = typeof globalThis & {
  __patryogaPool?: pg.Pool;
};

const databaseGlobal = globalThis as DatabaseGlobal;

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before using PostgreSQL persistence.");
  }

  databaseGlobal.__patryogaPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10
  });

  return databaseGlobal.__patryogaPool;
}
