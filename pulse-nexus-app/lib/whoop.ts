/**
 * WHOOP integration.
 *
 * Pulse Nexus talks to the WHOOP strap **directly over Bluetooth** — no WHOOP
 * account, no WHOOP cloud, no subscription. See `lib/whoop-ble.ts` for the
 * BLE client that owns scanning, pairing, and the live-HR stream.
 *
 * This module used to sign in against WHOOP's Developer OAuth API. That
 * codepath has been removed because it defeated the purpose of local-first:
 * it required a WHOOP account and, in practice, a WHOOP subscription, since
 * the developer API only returns data WHOOP's cloud has already ingested.
 *
 * Stage 1 of the BLE work (this file's current state):
 *  - `isWhoopConnected()` reflects whether the strap is BLE-paired.
 *  - `connectWhoop()` is intentionally not the entry point any more —
 *    pairing happens on the dedicated /whoop-connect scan screen, which
 *    the Connect screen deep-links into.
 *  - Live heart rate is streaming (public Bluetooth Heart Rate profile).
 *  - Deeper metrics — recovery, HRV, strain, sleep — return `null` because
 *    they need WHOOP's proprietary encrypted frames decoded on top of a
 *    GATT bond. That's Stage 2 (see `lib/whoop-ble.ts` for the hooks).
 *
 * The type exports below (WhoopRecovery / WhoopSleep / WhoopCycle) keep
 * their existing shape so the rest of the app (dashboard, chat, sleep,
 * workouts) typechecks. Once Stage 2 lands, these will get filled in from
 * decoded strap frames instead of returning null.
 */
import { forgetWhoopStrap, getWhoopBle, isWhoopStrapPaired } from './whoop-ble';

const NEEDS_BLE_PAIRING_MESSAGE =
  'Pair your WHOOP strap over Bluetooth from Connect \u2192 WHOOP. Pulse Nexus no longer signs in to WHOOP\u2019s cloud.';

export function isWhoopConfigured(): boolean {
  return true;
}

export async function connectWhoop(): Promise<never> {
  throw new Error(NEEDS_BLE_PAIRING_MESSAGE);
}

export async function disconnectWhoop(): Promise<void> {
  await forgetWhoopStrap();
}

export async function isWhoopConnected(): Promise<boolean> {
  return isWhoopStrapPaired();
}

export type WhoopRecovery = {
  cycle_id: number;
  score: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number };
  updated_at: string;
};

export type WhoopSleep = {
  id: number;
  start: string;
  end: string;
  score: {
    sleep_performance_percentage: number;
    sleep_efficiency_percentage: number;
    sleep_needed_milli: number;
    stage_summary: { total_in_bed_time_milli: number };
  };
};

export type WhoopCycle = {
  id: number;
  start: string;
  end: string | null;
  score: { strain: number; average_heart_rate: number };
};

/**
 * Stage 2 will decode these from the strap's own frames. Until then, we
 * report "no data" — the dashboard falls back to Apple Health / Fitbit /
 * Garmin sources for these metrics, and the WHOOP live-HR card carries
 * the "connected" experience by itself.
 */
export async function getLatestWhoopRecovery(): Promise<WhoopRecovery | null> {
  return null;
}

export async function getLatestWhoopSleep(): Promise<WhoopSleep | null> {
  return null;
}

export async function getLatestWhoopCycle(): Promise<WhoopCycle | null> {
  return null;
}

/**
 * Live heart rate the strap is currently emitting, or null if nothing has
 * arrived yet. Uses the same BLE singleton the /whoop-connect screen owns.
 */
export function getLatestWhoopLiveHR(): { bpm: number; timestamp: number } | null {
  const last = getWhoopBle().getLastHR();
  return last ? { bpm: last.bpm, timestamp: last.timestamp } : null;
}
