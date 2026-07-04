/**
 * Nutrition tracking — local, on-device food & hydration log.
 *
 * Entries live in the same on-device SQLite database as the rest of the
 * app. Nothing is uploaded. When Apple Health integration is available the
 * app also mirror-writes each entry to HealthKit (see nutrition-health.ts),
 * but this store is the source of truth for the Nutrition tab, so totals
 * are never double-counted.
 *
 * Daily targets are persisted with expo-secure-store (like other prefs).
 */
import * as SQLite from 'expo-sqlite';

import { getSecret, setSecret } from './storage';

const DB_NAME = 'pulsenexus.db';
const SCHEMA_VERSION = 1;

export type NutritionKind = 'food' | 'water';

export type NutritionEntry = {
  id: number;
  ts: number;
  name: string;
  kind: NutritionKind;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  caffeineMg: number;
};

export type NewFoodEntry = {
  name: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  caffeineMg?: number;
  ts?: number;
};

export type DayTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  caffeineMg: number;
  entryCount: number;
};

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};

export const DEFAULT_TARGETS: NutritionTargets = {
  calories: 2200,
  proteinG: 140,
  carbsG: 220,
  fatG: 70,
  waterMl: 2500,
};

const TARGETS_KEY = 'nutrition.targets.v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS nutrition_entry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          INTEGER NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        calories    REAL NOT NULL DEFAULT 0,
        protein_g   REAL NOT NULL DEFAULT 0,
        carbs_g     REAL NOT NULL DEFAULT 0,
        fat_g       REAL NOT NULL DEFAULT 0,
        water_ml    REAL NOT NULL DEFAULT 0,
        caffeine_mg REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_nutrition_ts ON nutrition_entry(ts);
    `);
    return db;
  })();
  return dbPromise;
}

export function startOfDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts = Date.now()): number {
  return startOfDay(ts) + 24 * 60 * 60 * 1000;
}

function n(v: number | undefined | null): number {
  return v != null && Number.isFinite(v) ? v : 0;
}

export async function addFoodEntry(entry: NewFoodEntry): Promise<number> {
  const db = await getDb();
  const ts = entry.ts ?? Date.now();
  const result = await db.runAsync(
    `INSERT INTO nutrition_entry
       (ts, name, kind, calories, protein_g, carbs_g, fat_g, water_ml, caffeine_mg)
     VALUES (?, ?, 'food', ?, ?, ?, ?, 0, ?)`,
    ts,
    entry.name.trim() || 'Food',
    n(entry.calories),
    n(entry.proteinG),
    n(entry.carbsG),
    n(entry.fatG),
    n(entry.caffeineMg),
  );
  return result.lastInsertRowId;
}

export async function addWaterEntry(waterMl: number, ts = Date.now()): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO nutrition_entry
       (ts, name, kind, calories, protein_g, carbs_g, fat_g, water_ml, caffeine_mg)
     VALUES (?, 'Water', 'water', 0, 0, 0, 0, ?, 0)`,
    ts,
    n(waterMl),
  );
  return result.lastInsertRowId;
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM nutrition_entry WHERE id = ?', id);
}

function mapEntry(r: Record<string, number | string>): NutritionEntry {
  return {
    id: Number(r.id),
    ts: Number(r.ts),
    name: String(r.name),
    kind: (String(r.kind) as NutritionKind) ?? 'food',
    calories: Number(r.calories),
    proteinG: Number(r.protein_g),
    carbsG: Number(r.carbs_g),
    fatG: Number(r.fat_g),
    waterMl: Number(r.water_ml),
    caffeineMg: Number(r.caffeine_mg),
  };
}

export async function getEntriesForDay(dayTs = Date.now()): Promise<NutritionEntry[]> {
  const db = await getDb();
  const from = startOfDay(dayTs);
  const to = endOfDay(dayTs);
  const rows = await db.getAllAsync<Record<string, number | string>>(
    'SELECT * FROM nutrition_entry WHERE ts >= ? AND ts < ? ORDER BY ts DESC',
    from,
    to,
  );
  return rows.map(mapEntry);
}

export async function getDayTotals(dayTs = Date.now()): Promise<DayTotals> {
  const db = await getDb();
  const from = startOfDay(dayTs);
  const to = endOfDay(dayTs);
  const row = await db.getFirstAsync<{
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    water_ml: number | null;
    caffeine_mg: number | null;
    n: number | null;
  }>(
    `SELECT
       SUM(calories) AS calories,
       SUM(protein_g) AS protein_g,
       SUM(carbs_g) AS carbs_g,
       SUM(fat_g) AS fat_g,
       SUM(water_ml) AS water_ml,
       SUM(caffeine_mg) AS caffeine_mg,
       COUNT(*) AS n
     FROM nutrition_entry WHERE ts >= ? AND ts < ?`,
    from,
    to,
  );
  return {
    calories: n(row?.calories),
    proteinG: n(row?.protein_g),
    carbsG: n(row?.carbs_g),
    fatG: n(row?.fat_g),
    waterMl: n(row?.water_ml),
    caffeineMg: n(row?.caffeine_mg),
    entryCount: n(row?.n),
  };
}

export async function loadTargets(): Promise<NutritionTargets> {
  const raw = await getSecret(TARGETS_KEY);
  if (!raw) return DEFAULT_TARGETS;
  try {
    return { ...DEFAULT_TARGETS, ...(JSON.parse(raw) as Partial<NutritionTargets>) };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export async function saveTargets(targets: NutritionTargets): Promise<void> {
  await setSecret(TARGETS_KEY, JSON.stringify(targets));
}

/** kcal from macros, using Atwater factors (4/4/9). Handy to auto-fill calories. */
export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(n(proteinG) * 4 + n(carbsG) * 4 + n(fatG) * 9);
}
