/**
 * Optional Apple Health mirror-write for nutrition entries.
 *
 * The local SQLite store (lib/nutrition.ts) is the source of truth for the
 * Nutrition tab. This module additionally writes each logged item into
 * Apple Health so it shows up in the Health app and is available to other
 * apps the user trusts. It is entirely best-effort: every call is wrapped
 * so a HealthKit failure (permission denied, non-iOS, etc.) never blocks
 * logging a meal locally.
 *
 * iOS only. On other platforms these are no-ops.
 */
import { Platform } from 'react-native';
import AppleHealthKit, { type HealthKitPermissions } from 'react-native-health';

import type { NewFoodEntry } from './nutrition';

const { Permissions } = AppleHealthKit.Constants;

const NUTRITION_PERMS: HealthKitPermissions = {
  permissions: {
    read: [],
    write: [
      Permissions.EnergyConsumed,
      Permissions.Protein,
      Permissions.Carbohydrates,
      Permissions.FatTotal,
      Permissions.Water,
      Permissions.Caffeine,
    ],
  },
};

let initialized = false;

async function ensureInit(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (initialized) return true;
  return new Promise<boolean>((resolve) => {
    AppleHealthKit.initHealthKit(NUTRITION_PERMS, (err) => {
      initialized = !err;
      resolve(!err);
    });
  });
}

type SaveFoodOptions = {
  foodName?: string;
  mealType?: string;
  date?: string;
  energy?: number;
  protein?: number;
  carbohydrates?: number;
  fatTotal?: number;
  caffeine?: number;
};

/**
 * Mirror a food entry to Apple Health. Uses saveFood, which writes the
 * bundled nutrients as a correlated food sample. Returns true on success.
 */
export async function mirrorFoodToHealth(entry: NewFoodEntry): Promise<boolean> {
  if (!(await ensureInit())) return false;
  const saveFood = (AppleHealthKit as unknown as {
    saveFood?: (o: SaveFoodOptions, cb: (e: string) => void) => void;
  }).saveFood;
  if (!saveFood) return false;

  const iso = new Date(entry.ts ?? Date.now()).toISOString();
  return new Promise<boolean>((resolve) => {
    saveFood(
      {
        foodName: entry.name,
        date: iso,
        energy: entry.calories,
        protein: entry.proteinG,
        carbohydrates: entry.carbsG,
        fatTotal: entry.fatG,
        caffeine: entry.caffeineMg,
      },
      (err) => resolve(!err),
    );
  });
}

/** Mirror a water entry (ml) to Apple Health. */
export async function mirrorWaterToHealth(waterMl: number, ts = Date.now()): Promise<boolean> {
  if (!(await ensureInit())) return false;
  const saveWater = (AppleHealthKit as unknown as {
    saveWater?: (o: { value: number; date?: string }, cb: (e: string) => void) => void;
  }).saveWater;
  if (!saveWater) return false;

  const iso = new Date(ts).toISOString();
  return new Promise<boolean>((resolve) => {
    // react-native-health expects water in litres.
    saveWater({ value: waterMl / 1000, date: iso }, (err) => resolve(!err));
  });
}
