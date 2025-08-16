// app/databases/hadith.ts
// Seeding from JSON (with optional `tokens`) + DAO functions.
// Partitioning is by `collection` (your chosen group identifier).

import { runSql, runTransaction } from "./client";
import {
  normalizeArabicText,
  tokenizeArabicText,
  tokensToSearchKeys,
} from "./text";
import { log } from "../utils/logger";

// Seed file must include: { id, collection, text_ar, tokens? }
import seedData from "../../assets/hadiths/seed-lite.json";

// ---------- Types ----------

export type HadithRow = {
  id: string;              // per-collection id (string)
  collection: string;      // group identifier (unique key you chose)
  text_ar: string;         // original Arabic text
  text_norm: string;       // normalized Arabic (no diacritics, etc.)
  tokens_json: string;     // JSON string of normalized tokens
  search_keys: string;     // space-joined normalized tokens for LIKE search
  uid: string;             // stable global key = collection + ":" + id
};

export type CollectionRow = {
  id: string;              // e.g., 'Bukhari', 'Muslim'
  name: string;            // display name (can be same as id)
  version?: string | null;
  description?: string | null;
};

type SeedItem = {
  id: string;
  collection: string;
  text_ar: string;
  tokens?: string[];       // optional; if provided, we normalize & use them
};

// ---------- Helpers ----------

function isValidSeedItem(item: SeedItem): boolean {
  return Boolean(item && item.id && item.collection && item.text_ar);
}

function upsertCollection(
  collectionId: string,
  displayName?: string,
  version?: string,
  description?: string
) {
  runSql(
    `INSERT OR IGNORE INTO collections (id, name, version, description)
     VALUES (?, ?, ?, ?)`,
    [collectionId, displayName || collectionId, version || null, description || null]
  );
}

// ---------- Seeding (one-time) ----------

/**
 * Imports seed JSON on a fresh install, then sets meta('seeded') = '1'.
 * If rows already exist or the meta flag is set, this is a no-op.
 */
export function seedDatabaseIfEmpty(): void {
  // Skip if we've already seeded in a previous run
  const seededFlag =
    runSql(`SELECT value FROM meta WHERE key='seeded'`).rows?.[0]?.value;
  if (seededFlag === "1") {
    log.info("Seed skipped (meta.flag already set).");
    return;
  }

  // If rows already exist (older build), mark as seeded and exit
  const existingCount =
    (runSql("SELECT COUNT(*) AS c FROM hadith;").rows?.[0]?.c ?? 0) as number;
  if (existingCount > 0) {
    runSql(`INSERT OR REPLACE INTO meta(key,value) VALUES ('seeded','1')`);
    log.info("Seed skipped (hadith table already populated).");
    return;
  }

  const items = (seedData as SeedItem[]) || [];
  let inserted = 0;
  let skipped = 0;

  // Ensure collections exist based on the seed set
  const uniqueCollections = Array.from(
    new Set(items.filter(isValidSeedItem).map((it) => it.collection))
  );
  for (const col of uniqueCollections) {
    upsertCollection(col);
  }

  runTransaction(() => {
    for (const item of items) {
      if (!isValidSeedItem(item)) {
        skipped++;
        continue;
      }

      try {
        // If tokens are provided, normalize each token; else auto-tokenize from text_ar
        const providedTokens =
          Array.isArray(item.tokens) && item.tokens.length > 0
            ? item.tokens
            : null;

        const normalizedTokens = providedTokens
          ? providedTokens
              .map((t) => normalizeArabicText(t))
              .filter(Boolean)
          : tokenizeArabicText(item.text_ar); // tokenizeArabicText includes normalization

        const normalizedText = normalizeArabicText(item.text_ar);
        const tokensJson = JSON.stringify(normalizedTokens);
        const searchKeys = tokensToSearchKeys(normalizedTokens);
        const uid = `${item.collection}:${item.id}`;

        runSql(
          `INSERT OR REPLACE INTO hadith
            (id, collection, text_ar, text_norm, tokens_json, search_keys, uid)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.collection,
            item.text_ar,
            normalizedText,
            tokensJson,
            searchKeys,
            uid,
          ]
        );

        inserted++;
      } catch (err) {
        log.warn("Seed insert failed; skipping row", {
          id: item.id,
          collection: item.collection,
          err,
        });
        skipped++;
      }
    }

    // Mark as seeded so we never touch JSON again
    runSql(`INSERT OR REPLACE INTO meta(key,value) VALUES ('seeded','1')`);
  });

  log.info(`Seed completed. Inserted=${inserted}, Skipped=${skipped}`);
}

// ---------- Collections (groups) DAO ----------

export function listCollections(): CollectionRow[] {
  const res = runSql(
    `SELECT id, name, version, description
     FROM collections
     ORDER BY name COLLATE NOCASE ASC;`
  );
  return (res.rows ?? []) as CollectionRow[];
}

/**
 * Overwrites the user's selected collections with the given list.
 * Use this after a settings UI where the user toggles groups on/off.
 */
export function setUserSelectedCollections(collectionIds: string[]): void {
  runTransaction(() => {
    runSql(`DELETE FROM user_selected_collections;`);
    for (const id of collectionIds) {
      runSql(
        `INSERT OR REPLACE INTO user_selected_collections (id) VALUES (?);`,
        [id]
      );
    }
  });
}

/** Returns the list of collection ids the user has chosen. */
export function getUserSelectedCollections(): string[] {
  const res = runSql(`SELECT id FROM user_selected_collections;`);
  return (res.rows ?? []).map((r: any) => String(r.id));
}

// ---------- Hadith DAO (queries) ----------

/** Fetch a single hadith using its global UID: `${collection}:${id}` */
export function getHadithByUid(uid: string): HadithRow | null {
  const res = runSql(`SELECT * FROM hadith WHERE uid = ?`, [uid]);
  return (res.rows?.[0] as HadithRow) ?? null;
}

/** List all hadith for a single collection. */
export function listHadithByCollection(collectionId: string): HadithRow[] {
  const res = runSql(
    `SELECT * FROM hadith
     WHERE collection = ?
     ORDER BY CAST(id AS INTEGER) ASC`,
    [collectionId]
  );
  return (res.rows ?? []) as HadithRow[];
}

/** List hadith across multiple collections (or all if empty). */
export function listHadithByCollections(collectionIds: string[]): HadithRow[] {
  if (!collectionIds || collectionIds.length === 0) {
    const all = runSql(
      `SELECT * FROM hadith
       ORDER BY collection, CAST(id AS INTEGER) ASC;`
    );
    return (all.rows ?? []) as HadithRow[];
  }
  const placeholders = collectionIds.map(() => "?").join(",");
  const res = runSql(
    `SELECT * FROM hadith
     WHERE collection IN (${placeholders})
     ORDER BY collection, CAST(id AS INTEGER) ASC`,
    collectionIds
  );
  return (res.rows ?? []) as HadithRow[];
}

/** Simple LIKE-based search across all collections. */
export function searchHadithByText(queryText: string): HadithRow[] {
  const q = normalizeArabicText(queryText);
  const res = runSql(
    `SELECT * FROM hadith
     WHERE search_keys LIKE ?
     ORDER BY collection, CAST(id AS INTEGER) ASC
     LIMIT 100`,
    [`%${q}%`]
  );
  return (res.rows ?? []) as HadithRow[];
}

/** LIKE-based search limited to selected collections. */
export function searchHadithWithinCollections(
  queryText: string,
  collectionIds: string[]
): HadithRow[] {
  const q = normalizeArabicText(queryText);

  if (!collectionIds || collectionIds.length === 0) {
    return searchHadithByText(queryText);
  }

  const placeholders = collectionIds.map(() => "?").join(",");
  const params = [`%${q}%`, ...collectionIds];

  const res = runSql(
    `SELECT * FROM hadith
     WHERE search_keys LIKE ?
       AND collection IN (${placeholders})
     ORDER BY collection, CAST(id AS INTEGER) ASC
     LIMIT 100`,
    params
  );
  return (res.rows ?? []) as HadithRow[];
}
