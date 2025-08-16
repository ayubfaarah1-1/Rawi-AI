// app/databases/migrate.ts
// One DB. Partition by `collection`. Add helper tables for metadata + user choices.

import { runSql, runTransaction } from "./client";
import { log } from "../utils/logger";

function columnExists(table: string, column: string): boolean {
  const res = runSql(`PRAGMA table_info(${table});`);
  return (res.rows || []).some((r: any) => r.name === column);
}

export function runMigrations(): void {
  runSql(`PRAGMA journal_mode = WAL;`);
  runSql(`PRAGMA foreign_keys = ON;`);

  runTransaction(() => {
    // Meta table (flags/versions)
    runSql(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // "Collections" = logical groups (use the same string as in your JSON `collection`)
    runSql(`
      CREATE TABLE IF NOT EXISTS collections (
        id          TEXT PRIMARY KEY,   -- e.g., 'Bukhari', 'Muslim'
        name        TEXT NOT NULL,      -- display name (can be same as id)
        version     TEXT,               -- optional
        description TEXT                -- optional
      );
    `);

    // Main hadith table (no bundle_id)
    // NOTE: Some earlier versions may have had different PKs; we keep this flexible.
    runSql(`
      CREATE TABLE IF NOT EXISTS hadith (
        id          TEXT NOT NULL,      -- per-collection id, e.g., "1"
        collection  TEXT NOT NULL,      -- group identifier (your chosen unique key)
        text_ar     TEXT NOT NULL,
        text_norm   TEXT NOT NULL,
        tokens_json TEXT NOT NULL,
        search_keys TEXT NOT NULL
        -- We'll add a stable 'uid' below if it's missing (collection:id)
      );
    `);

    // Add 'uid' if this DB was created before we introduced it
    if (!columnExists("hadith", "uid")) {
      runSql(`ALTER TABLE hadith ADD COLUMN uid TEXT;`);
      runSql(`UPDATE hadith SET uid = collection || ':' || id WHERE uid IS NULL;`);
    }

    // Indexes (and uniqueness on uid)
    runSql(`CREATE INDEX IF NOT EXISTS idx_hadith_collection ON hadith(collection);`);
    runSql(`CREATE INDEX IF NOT EXISTS idx_hadith_search     ON hadith(search_keys);`);
    runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hadith_uid ON hadith(uid);`);

    // User's selected collections (for filters in the UI)
    runSql(`
      CREATE TABLE IF NOT EXISTS user_selected_collections (
        id TEXT PRIMARY KEY                  -- references collections(id) logically
      );
    `);

    // If hadith rows already exist but collections table is empty,
    // backfill collections from distinct hadith.collection values.
    runSql(`
      INSERT OR IGNORE INTO collections (id, name)
      SELECT DISTINCT collection, collection FROM hadith;
    `);
  });

  log.info("Migration OK (single-DB; partitioned by collection).");
}
