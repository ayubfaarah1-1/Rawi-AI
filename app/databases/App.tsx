// App.tsx
// Boots the DB, seeds on first run, shows a list + simple search with friendly error UI.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TextInput, Button } from "react-native";
import { runMigrations } from "./migrate";
import { seedDatabaseIfEmpty, listHadithByCollection, searchHadithByText } from "./hadith";
import { DBError } from "./errors";
import { log } from "../utils/logger";

type AnyRow = Record<string, any>;

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [searchText, setSearchText] = useState("");

  const initializeDatabase = useCallback(() => {
    setIsReady(false);
    setErrorMessage(null);

    try {
      // Create tables/indexes (safe to run every time)
      runMigrations();

      // First-run populate (skips automatically if not empty)
      seedDatabaseIfEmpty();

      // Initial view: show Bukhari as a quick sanity check
      const initialRows = listHadithByCollection("Bukhari");
      setItems(initialRows);
         } catch (err: any) {
       log.error("Database bootstrap failed", err);
       const message =
         err instanceof DBError
           ? err.message
           : (err?.message ?? "Unknown database error.");
       setErrorMessage(message);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Live search (normalize happens inside DAO)
  const onChangeSearch = (text: string) => {
    setSearchText(text);
    if (text.trim().length === 0) {
      setItems(listHadithByCollection("Bukhari"));
    } else {
      setItems(searchHadithByText(text));
    }
  };

  if (errorMessage) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, marginBottom: 8 }}>There was a problem with the local database.</Text>
        <Text style={{ opacity: 0.7, textAlign: "center", marginBottom: 16 }}>
          {errorMessage}
        </Text>
        <Button title="Try Again" onPress={initializeDatabase} />
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        Bukhari items (or search results): {items.length}
      </Text>

      <TextInput
        placeholder="Search Arabic…"
        value={searchText}
        onChangeText={onChangeSearch}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 12 }}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 12 }}>
            <Text>[{item.collection} #{item.id}]</Text>
            <Text style={{ fontSize: 20, marginTop: 4 }}>{item.text_ar}</Text>
          </View>
        )}
      />
    </View>
  );
}
