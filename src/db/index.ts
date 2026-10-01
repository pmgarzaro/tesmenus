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
  const db = drizzle(sqlite, { schema });
  // Foreign keys stay off while migrating: rebuilding a table (drop + rename)
  // would otherwise cascade-delete the rows that reference it.
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.env.MIGRATIONS_DIR ?? "drizzle") });
  sqlite.pragma("foreign_keys = ON");
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length) throw new Error(`Migration : clés étrangères invalides ${JSON.stringify(violations)}`);
  return db;
}

// Reuse the connection across hot reloads in dev.
const g = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (!g.__db) g.__db = open();
  return g.__db;
}

export { schema };
