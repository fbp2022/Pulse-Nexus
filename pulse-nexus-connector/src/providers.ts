/**
 * Provider fetchers used by the connector worker. These mirror the iOS app's
 * lib/whoop.ts, lib/fitbit.ts, lib/garmin.ts at the HTTP layer, but live in a
 * Cloudflare Worker context rather than React Native.
 */
import type { Env } from './worker';

export type ProviderSnapshot = {
  recovery?: { value: number; source: 'WHOOP' };
  restingHR?: { value: number; source: 'WHOOP' | 'Garmin' | 'Fitbit' };
  hrvMs?: { value: number; source: 'WHOOP' | 'Garmin' | 'Fitbit' };
  sleepHours?: { value: number; source: 'WHOOP' | 'Garmin' | 'Fitbit' };
  strain?: { value: number; source: 'WHOOP' };
  bodyBattery?: number;
  stressAvg?: number;
  steps?: { value: number; source: 'Garmin' | 'Fitbit' };
  activeKcal?: { value: number; source: 'Garmin' | 'Fitbit' };
  spo2?: { value: number; source: 'Fitbit' };
};

const PRIORITY: Array<'WHOOP' | 'Garmin' | 'Fitbit'> = ['WHOOP', 'Garmin', 'Fitbit'];

export type RefreshOpts = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes?: string[];
  /** Some providers (Fitbit) require Basic auth instead of credentials in the body. */
  authStyle?: 'body' | 'basic';
};

export async function refresh(opts: RefreshOpts): Promise<{ access: string; refresh: string }> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
  });
  if (opts.authStyle === 'basic') {
    headers.authorization =
      'Basic ' + btoa(`${opts.clientId}:${opts.clientSecret}`);
  } else {
    body.set('client_id', opts.clientId);
    body.set('client_secret', opts.clientSecret);
  }
  if (opts.scopes && opts.scopes.length) body.set('scope', opts.scopes.join(' '));
  const res = await fetch(opts.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string };
  return { access: j.access_token, refresh: j.refresh_token ?? opts.refreshToken };
}

async function whoopFetch(env: Env): Promise<ProviderSnapshot> {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET || !env.WHOOP_REFRESH_TOKEN) return {};
  const { access } = await refresh({
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
    refreshToken: env.WHOOP_REFRESH_TOKEN,
    scopes: [
      'read:recovery',
      'read:cycles',
      'read:sleep',
      'read:workout',
      'read:body_measurement',
      'offline',
    ],
  });
  const headers = { authorization: `Bearer ${access}` };
  const getJson = async (url: string): Promise<any> => {
    const r = await fetch(url, { headers });
    return r.ok ? r.json() : null;
  };
  const [rec, sleep, cycle] = await Promise.all([
    getJson('https://api.prod.whoop.com/developer/v1/recovery?limit=1').catch(() => null),
    getJson('https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1').catch(() => null),
    getJson('https://api.prod.whoop.com/developer/v1/cycle?limit=1').catch(() => null),
  ]);
  const recScore = rec?.records?.[0]?.score;
  const sleepScore = sleep?.records?.[0]?.score;
  const cycleScore = cycle?.records?.[0]?.score;
  const out: ProviderSnapshot = {};
  if (recScore?.recovery_score != null)
    out.recovery = { value: recScore.recovery_score, source: 'WHOOP' };
  if (recScore?.resting_heart_rate != null)
    out.restingHR = { value: recScore.resting_heart_rate, source: 'WHOOP' };
  if (recScore?.hrv_rmssd_milli != null)
    out.hrvMs = { value: recScore.hrv_rmssd_milli, source: 'WHOOP' };
  if (sleepScore?.stage_summary?.total_in_bed_time_milli != null)
    out.sleepHours = {
      value: sleepScore.stage_summary.total_in_bed_time_milli / 3_600_000,
      source: 'WHOOP',
    };
  if (cycleScore?.strain != null) out.strain = { value: cycleScore.strain, source: 'WHOOP' };
  return out;
}

async function fitbitFetch(env: Env): Promise<ProviderSnapshot> {
  if (!env.FITBIT_CLIENT_ID || !env.FITBIT_CLIENT_SECRET || !env.FITBIT_REFRESH_TOKEN) return {};
  const { access } = await refresh({
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    clientId: env.FITBIT_CLIENT_ID,
    clientSecret: env.FITBIT_CLIENT_SECRET,
    refreshToken: env.FITBIT_REFRESH_TOKEN,
    authStyle: 'basic',
  });
  const headers = { authorization: `Bearer ${access}` };
  const date = new Date().toISOString().slice(0, 10);
  const getJson = async (url: string): Promise<any> => {
    const r = await fetch(url, { headers });
    return r.ok ? r.json() : null;
  };
  const [activity, heart, hrv, spo2] = await Promise.all([
    getJson(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`).catch(() => null),
    getJson(`https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`).catch(() => null),
    getJson(`https://api.fitbit.com/1/user/-/hrv/date/${date}.json`).catch(() => null),
    getJson(`https://api.fitbit.com/1/user/-/spo2/date/${date}.json`).catch(() => null),
  ]);
  const out: ProviderSnapshot = {};
  if (activity?.summary?.steps != null)
    out.steps = { value: activity.summary.steps, source: 'Fitbit' };
  if (activity?.summary?.caloriesOut != null)
    out.activeKcal = { value: activity.summary.caloriesOut, source: 'Fitbit' };
  if (heart?.['activities-heart']?.[0]?.value?.restingHeartRate != null)
    out.restingHR = {
      value: heart['activities-heart'][0].value.restingHeartRate,
      source: 'Fitbit',
    };
  if (hrv?.hrv?.[0]?.value?.dailyRmssd != null)
    out.hrvMs = { value: hrv.hrv[0].value.dailyRmssd, source: 'Fitbit' };
  if (spo2?.value?.avg != null) out.spo2 = { value: spo2.value.avg, source: 'Fitbit' };
  return out;
}

async function garminFetch(env: Env): Promise<ProviderSnapshot> {
  if (!env.GARMIN_CLIENT_ID || !env.GARMIN_CLIENT_SECRET || !env.GARMIN_REFRESH_TOKEN) return {};
  const { access } = await refresh({
    tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    clientId: env.GARMIN_CLIENT_ID,
    clientSecret: env.GARMIN_CLIENT_SECRET,
    refreshToken: env.GARMIN_REFRESH_TOKEN,
  });
  const headers = { authorization: `Bearer ${access}` };
  const now = Math.floor(Date.now() / 1000);
  const start = now - 24 * 3600;
  const url = new URL('https://apis.garmin.com/wellness-api/rest/dailies');
  url.searchParams.set('uploadStartTimeInSeconds', String(start));
  url.searchParams.set('uploadEndTimeInSeconds', String(now));
  const dailies: any = await fetch(url.toString(), { headers })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const d = Array.isArray(dailies) ? dailies[0] : null;
  const out: ProviderSnapshot = {};
  if (d?.steps != null) out.steps = { value: d.steps, source: 'Garmin' };
  if (d?.activeKilocalories != null)
    out.activeKcal = { value: d.activeKilocalories, source: 'Garmin' };
  if (d?.restingHeartRateInBeatsPerMinute != null)
    out.restingHR = { value: d.restingHeartRateInBeatsPerMinute, source: 'Garmin' };
  if (d?.bodyBatteryHighestValue != null) out.bodyBattery = d.bodyBatteryHighestValue;
  if (d?.averageStressLevel != null) out.stressAvg = d.averageStressLevel;
  return out;
}

function mergeByPriority(parts: Array<{ source: 'WHOOP' | 'Garmin' | 'Fitbit'; data: ProviderSnapshot }>) {
  const merged: ProviderSnapshot = {};
  for (const src of PRIORITY) {
    const found = parts.find((p) => p.source === src);
    if (!found) continue;
    for (const [k, v] of Object.entries(found.data)) {
      if ((merged as Record<string, unknown>)[k] == null && v != null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
  }
  return merged;
}

export async function fetchUnifiedSnapshot(env: Env): Promise<{
  asOf: string;
  metrics: ProviderSnapshot;
  perProvider: Record<string, ProviderSnapshot>;
}> {
  const [whoop, garmin, fitbit] = await Promise.all([
    whoopFetch(env).catch(() => ({})),
    garminFetch(env).catch(() => ({})),
    fitbitFetch(env).catch(() => ({})),
  ]);
  const metrics = mergeByPriority([
    { source: 'WHOOP', data: whoop },
    { source: 'Garmin', data: garmin },
    { source: 'Fitbit', data: fitbit },
  ]);
  return {
    asOf: new Date().toISOString(),
    metrics,
    perProvider: { WHOOP: whoop, Garmin: garmin, Fitbit: fitbit },
  };
}
