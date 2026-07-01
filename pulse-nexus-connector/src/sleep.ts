/**
 * Sleep endpoint: last night, with stage breakdown, from whichever providers
 * are configured.
 */
import type { Env } from './worker';
import { refresh } from './providers';

type SleepRow = {
  source: 'WHOOP' | 'Fitbit' | 'Garmin';
  start: string;
  end: string;
  asleepMs: number;
  inBedMs: number;
  efficiencyPct: number | null;
  scorePct: number | null;
  stages: { deep: number; rem: number; light: number; awake: number };
};

async function whoopSleep(env: Env): Promise<SleepRow | null> {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET || !env.WHOOP_REFRESH_TOKEN) return null;
  const { access } = await refresh({
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
    refreshToken: env.WHOOP_REFRESH_TOKEN,
    scopes: ['read:sleep', 'offline'],
  });
  const res = await fetch('https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1', {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    records?: Array<{
      start: string;
      end: string;
      score?: {
        sleep_efficiency_percentage?: number;
        sleep_performance_percentage?: number;
        stage_summary?: {
          total_in_bed_time_milli?: number;
          total_awake_time_milli?: number;
          total_light_sleep_time_milli?: number;
          total_slow_wave_sleep_time_milli?: number;
          total_rem_sleep_time_milli?: number;
        };
      };
    }>;
  };
  const r = j.records?.[0];
  if (!r) return null;
  const s = r.score?.stage_summary ?? {};
  const stages = {
    deep: s.total_slow_wave_sleep_time_milli ?? 0,
    rem: s.total_rem_sleep_time_milli ?? 0,
    light: s.total_light_sleep_time_milli ?? 0,
    awake: s.total_awake_time_milli ?? 0,
  };
  return {
    source: 'WHOOP',
    start: r.start,
    end: r.end,
    asleepMs: stages.deep + stages.rem + stages.light,
    inBedMs: s.total_in_bed_time_milli ?? stages.deep + stages.rem + stages.light + stages.awake,
    efficiencyPct: r.score?.sleep_efficiency_percentage ?? null,
    scorePct: r.score?.sleep_performance_percentage ?? null,
    stages,
  };
}

async function fitbitSleep(env: Env): Promise<SleepRow | null> {
  if (!env.FITBIT_CLIENT_ID || !env.FITBIT_CLIENT_SECRET || !env.FITBIT_REFRESH_TOKEN) return null;
  const { access } = await refresh({
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    clientId: env.FITBIT_CLIENT_ID,
    clientSecret: env.FITBIT_CLIENT_SECRET,
    refreshToken: env.FITBIT_REFRESH_TOKEN,
    authStyle: 'basic',
  });
  const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    sleep?: Array<{
      startTime?: string;
      endTime?: string;
      efficiency?: number;
      minutesAsleep?: number;
      timeInBed?: number;
      levels?: { summary?: Record<string, { minutes?: number }> };
    }>;
  };
  const main = j.sleep?.find((s) => s.levels?.summary) ?? j.sleep?.[0];
  if (!main) return null;
  const summary = main.levels?.summary ?? {};
  const min = (n: number | undefined) => (n ? n * 60_000 : 0);
  const stages = {
    deep: min(summary.deep?.minutes),
    rem: min(summary.rem?.minutes),
    light: min(summary.light?.minutes),
    awake: min(summary.wake?.minutes ?? summary.awake?.minutes),
  };
  return {
    source: 'Fitbit',
    start: main.startTime ?? new Date().toISOString(),
    end: main.endTime ?? new Date().toISOString(),
    asleepMs: (main.minutesAsleep ?? 0) * 60_000,
    inBedMs: (main.timeInBed ?? 0) * 60_000,
    efficiencyPct: main.efficiency ?? null,
    scorePct: null,
    stages,
  };
}

async function garminSleep(env: Env): Promise<SleepRow | null> {
  if (!env.GARMIN_CLIENT_ID || !env.GARMIN_CLIENT_SECRET || !env.GARMIN_REFRESH_TOKEN) return null;
  const { access } = await refresh({
    tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    clientId: env.GARMIN_CLIENT_ID,
    clientSecret: env.GARMIN_CLIENT_SECRET,
    refreshToken: env.GARMIN_REFRESH_TOKEN,
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - 2 * 24 * 3600;
  const url = new URL('https://apis.garmin.com/wellness-api/rest/sleeps');
  url.searchParams.set('uploadStartTimeInSeconds', String(startSec));
  url.searchParams.set('uploadEndTimeInSeconds', String(nowSec));
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${access}` } });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{
    startTimeInSeconds?: number;
    durationInSeconds?: number;
    deepSleepDurationInSeconds?: number;
    lightSleepDurationInSeconds?: number;
    remSleepInSeconds?: number;
    awakeDurationInSeconds?: number;
    overallSleepScore?: { value?: number };
  }>;
  const r = Array.isArray(arr) ? arr[0] : null;
  if (!r || r.startTimeInSeconds == null) return null;
  const stages = {
    deep: (r.deepSleepDurationInSeconds ?? 0) * 1000,
    rem: (r.remSleepInSeconds ?? 0) * 1000,
    light: (r.lightSleepDurationInSeconds ?? 0) * 1000,
    awake: (r.awakeDurationInSeconds ?? 0) * 1000,
  };
  const asleep = stages.deep + stages.rem + stages.light;
  const inBed = asleep + stages.awake;
  const startMs = r.startTimeInSeconds * 1000;
  return {
    source: 'Garmin',
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + (r.durationInSeconds ?? 0) * 1000).toISOString(),
    asleepMs: asleep,
    inBedMs: inBed,
    efficiencyPct: inBed > 0 ? Math.round((asleep / inBed) * 100) : null,
    scorePct: r.overallSleepScore?.value ?? null,
    stages,
  };
}

export async function fetchLastNightSleep(env: Env): Promise<{ perSource: SleepRow[] }> {
  const [w, f, g] = await Promise.all([
    whoopSleep(env).catch(() => null),
    fitbitSleep(env).catch(() => null),
    garminSleep(env).catch(() => null),
  ]);
  const perSource: SleepRow[] = [w, f, g].filter((x): x is SleepRow => x !== null);
  return { perSource };
}
