/**
 * Local SQLite store for WHOOP-strap-over-Bluetooth samples.
 *
 * Every reading the strap emits on the standard Bluetooth Heart Rate
 * characteristic (0x2A37) — the current bpm and, when present, the R-R
 * intervals since the last packet — is persisted here. This is what lets
 * Pulse Nexus compute HRV, resting HR, and rolling HR statistics locally,
 * with no WHOOP account and no WHOOP cloud.
 *
 * Schema (versioned; migrate in a single transaction on open):
 *  - hr_sample(ts INTEGER PK, bpm INTEGER NOT NULL)
 *  - rr_interval(ts INTEGER, rr_ms INTEGER NOT NULL, seq INTEGER,
 *                PRIMARY KEY(ts, seq))
 *
 * The `ts` column is Unix milliseconds — the same clock as `Date.now()`
 * on the phone the strap is paired to. Multiple R-R intervals sharing
 * the same `ts` (one HR notification can carry a handful of R-R values)
 * are disambiguated by a monotonically-increasing `seq` per notification.
 *
 * Data is bounded by pruning anything older than a configurable window
 * (default: 14 days, matches WHOOP's own on-strap buffer). All I/O is
 * async so it never blocks the render thread.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pulsenexus.db';
const SCHEMA_VERSION = 1;

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type HrSample = { ts: number; bpm: number };
export type RrSample = { ts: number; rrMs: number };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hr_sample (
        ts   INTEGER PRIMARY KEY,
        bpm  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rr_interval (
        ts    INTEGER NOT NULL,
        seq   INTEGER NOT NULL,
        rr_ms INTEGER NOT NULL,
        PRIMARY KEY (ts, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_rr_ts ON rr_interval(ts);
    `);
    const versionRow = await db
      .getFirstAsync<{ version: number }>('SELECT version FROM schema_version LIMIT 1')
      .catch(() => null);
    if (!versionRow) {
      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', SCHEMA_VERSION);
    } else if (versionRow.version < SCHEMA_VERSION) {
      // future migrations go here
      await db.runAsync('UPDATE schema_version SET version = ?', SCHEMA_VERSION);
    }
    return db;
  })();
  return dbPromise;
}

/**
 * Persist a single BLE Heart Rate notification: one HR reading and zero or
 * more R-R intervals. Called from the BLE client's HR subscription.
 */
export async function recordHrPacket(
  ts: number,
  bpm: number,
  rrIntervalsMs: number[] | undefined,
): Promise<void> {
  const db = await getDb();
  const rounded = Math.round(ts);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO hr_sample (ts, bpm) VALUES (?, ?)',
      rounded,
      Math.round(bpm),
    );
    if (rrIntervalsMs && rrIntervalsMs.length > 0) {
      for (let i = 0; i < rrIntervalsMs.length; i++) {
        const value = rrIntervalsMs[i];
        if (!Number.isFinite(value) || value <= 0) continue;
        await db.runAsync(
          'INSERT OR REPLACE INTO rr_interval (ts, seq, rr_ms) VALUES (?, ?, ?)',
          rounded,
          i,
          Math.round(value),
        );
      }
    }
  });
}

export async function pruneOldSamples(cutoffMs = Date.now() - RETENTION_MS): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM hr_sample WHERE ts < ?', cutoffMs);
    await db.runAsync('DELETE FROM rr_interval WHERE ts < ?', cutoffMs);
  });
}

export async function getRecentRrIntervals(windowMs: number): Promise<RrSample[]> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const rows = await db.getAllAsync<{ ts: number; rr_ms: number }>(
    'SELECT ts, rr_ms FROM rr_interval WHERE ts >= ? ORDER BY ts ASC',
    since,
  );
  return rows.map((r) => ({ ts: r.ts, rrMs: r.rr_ms }));
}

export async function getRecentHrSamples(windowMs: number): Promise<HrSample[]> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const rows = await db.getAllAsync<{ ts: number; bpm: number }>(
    'SELECT ts, bpm FROM hr_sample WHERE ts >= ? ORDER BY ts ASC',
    since,
  );
  return rows;
}

export async function getHrSampleCount(windowMs = RETENTION_MS): Promise<number> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM hr_sample WHERE ts >= ?',
    since,
  );
  return row?.n ?? 0;
}

export async function getRrSampleCount(windowMs = RETENTION_MS): Promise<number> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rr_interval WHERE ts >= ?',
    since,
  );
  return row?.n ?? 0;
}

export async function clearWhoopStore(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM hr_sample');
    await db.runAsync('DELETE FROM rr_interval');
  });
}
