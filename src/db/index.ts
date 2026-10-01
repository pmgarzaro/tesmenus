import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

import { DATA_DIR } from "@/lib/paths";

export { DATA_DIR };
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Db = BetterSQLite3Database<typeof schema>;

function open(): Db {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.env.MIGRATIONS_DIR ?? "drizzle") });
  return db;
}

// Reuse the connection across hot reloads in dev.
const g = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (!g.__db) g.__db = open();
  return g.__db;
}

export { schema };
