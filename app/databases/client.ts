// app/databases/client.ts
// Opens the SQLite database and provides safe helpers to run SQL.

import { open, QuickSQLiteConnection } from "react-native-quick-sqlite";
import { DBError } from "./errors";
import { log } from "../utils/logger";

let cachedConnection: QuickSQLiteConnection | null = null;

export function getDatabaseConnection(): QuickSQLiteConnection {
  if (!cachedConnection) {
    try {
      cachedConnection = open({ name: "hadith.db" });
    } catch (err) {
      log.error("Failed to open database", err);
      throw new DBError("Failed to open the local database.", undefined, err);
    }
  }
  return cachedConnection;
}

export type SqlResult = {
  rows: any[];
  rowsAffected?: number;
  insertId?: number;
};

export function runSql(sql: string, params: any[] = []): SqlResult {
  try {
    return getDatabaseConnection().execute(sql, params) as unknown as SqlResult;
  } catch (err) {
    log.error("SQL failed", { sql, params, err });
    throw new DBError("SQL execution failed.", { sql, params }, err);
  }
}

export function runTransaction<T>(doWork: () => T): T {
  const db = getDatabaseConnection();
  try {
    db.execute("BEGIN");
    const result = doWork();
    db.execute("COMMIT");
    return result;
  } catch (err) {
    try { db.execute("ROLLBACK"); } catch { /* ignore */ }
    log.error("Transaction failed", err);
    throw new DBError("Database transaction failed.", undefined, err);
  }
}
