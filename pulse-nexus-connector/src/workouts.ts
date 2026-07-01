/**
 * Recent workouts endpoint, fanning out to WHOOP / Fitbit / Garmin.
 */
import type { Env } from './worker';
import { refresh } from './providers';

export type Workout = {
  source: 'WHOOP' | 'Fitbit' | 'Garmin';
  type: string;
  start: string;
  end: string;
  durationMin: number;
  distanceKm?: number;
  calories?: number;
  avgHR?: number;
  maxHR?: number;
  strain?: number;
};

const WHOOP_SPORT: Record<number, string> = {
  0: 'Running',
  1: 'Cycling',
  18: 'Rowing',
  30: 'Soccer',
  33: 'Swimming',
  34: 'Tennis',
  44: 'Yoga',
  45: 'Weightlifting',
  48: 'Functional Fitness',
  52: 'Hiking / Rucking',
  63: 'Walking',
  82: 'HIIT',
  83: 'Spin',
};

async function whoopWorkouts(env: Env, days: number): Promise<Workout[]> {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET || !env.WHOOP_REFRESH_TOKEN) return [];
  const { access } = await refresh({
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
    refreshToken: env.WHOOP_REFRESH_TOKEN,
    scopes: ['read:workout', 'offline'],
  });
  const url = new URL('https://api.prod.whoop.com/developer/v1/activity/workout');
  url.searchParams.set('limit', '25');
  url.searchParams.set('start', new Date(Date.now() - days * 86_400_000).toISOString());
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${access}` } });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    records?: Array<{
      start: string;
      end: string;
      sport_id?: number;
      score?: {
        strain?: number;
        average_heart_rate?: number;
        max_heart_rate?: number;
        kilojoule?: number;
        distance_meter?: number;
      };
    }>;
  };
  return (j.records ?? []).map((r) => ({
    source: 'WHOOP' as const,
    type: r.sport_id != null ? WHOOP_SPORT[r.sport_id] ?? 'Workout' : 'Workout',
    start: r.start,
    end: r.end,
    durationMin: Math.max(0, (new Date(r.end).getTime() - new Date(r.start).getTime()) / 60_000),
    distanceKm:
      r.score?.distance_meter != null && r.score.distance_meter > 0
        ? r.score.distance_meter / 1000
        : undefined,
    calories: r.score?.kilojoule != null ? Math.round(r.score.kilojoule / 4.184) : undefined,
    avgHR: r.score?.average_heart_rate,
    maxHR: r.score?.max_heart_rate,
    strain: r.score?.strain,
  }));
}

async function fitbitWorkouts(env: Env, days: number): Promise<Workout[]> {
  if (!env.FITBIT_CLIENT_ID || !env.FITBIT_CLIENT_SECRET || !env.FITBIT_REFRESH_TOKEN) return [];
  const { access } = await refresh({
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    clientId: env.FITBIT_CLIENT_ID,
    clientSecret: env.FITBIT_CLIENT_SECRET,
    refreshToken: env.FITBIT_REFRESH_TOKEN,
    authStyle: 'basic',
  });
  const after = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url = new URL('https://api.fitbit.com/1/user/-/activities/list.json');
  url.searchParams.set('afterDate', after);
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('limit', '20');
  url.searchParams.set('offset', '0');
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${access}` } });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    activities?: Array<{
      activityName?: string;
      startTime?: string;
      duration?: number;
      calories?: number;
      distance?: number;
      averageHeartRate?: number;
      heartRateZones?: Array<{ max?: number }>;
    }>;
  };
  return (j.activities ?? []).map((a) => {
    const durationMin = a.duration != null ? a.duration / 60_000 : 0;
    const start = a.startTime ?? new Date().toISOString();
    return {
      source: 'Fitbit' as const,
      type: a.activityName ?? 'Workout',
      start,
      end: new Date(new Date(start).getTime() + durationMin * 60_000).toISOString(),
      durationMin,
      distanceKm: a.distance != null && a.distance > 0 ? a.distance : undefined,
      calories: a.calories,
      avgHR: a.averageHeartRate,
      maxHR: a.heartRateZones?.reduce<number | undefined>(
        (m, z) => (z.max != null ? Math.max(m ?? 0, z.max) : m),
        undefined,
      ),
    };
  });
}

async function garminWorkouts(env: Env, days: number): Promise<Workout[]> {
  if (!env.GARMIN_CLIENT_ID || !env.GARMIN_CLIENT_SECRET || !env.GARMIN_REFRESH_TOKEN) return [];
  const { access } = await refresh({
    tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    clientId: env.GARMIN_CLIENT_ID,
    clientSecret: env.GARMIN_CLIENT_SECRET,
    refreshToken: env.GARMIN_REFRESH_TOKEN,
  });
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86_400;
  const url = new URL('https://apis.garmin.com/wellness-api/rest/activities');
  url.searchParams.set('uploadStartTimeInSeconds', String(start));
  url.searchParams.set('uploadEndTimeInSeconds', String(now));
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${access}` } });
  if (!res.ok) return [];
  const arr = (await res.json()) as Array<{
    activityType?: string;
    startTimeInSeconds?: number;
    durationInSeconds?: number;
    distanceInMeters?: number;
    activeKilocalories?: number;
    averageHeartRateInBeatsPerMinute?: number;
    maxHeartRateInBeatsPerMinute?: number;
  }>;
  return (Array.isArray(arr) ? arr : []).map((a) => {
    const startMs = (a.startTimeInSeconds ?? 0) * 1000;
    const durSec = a.durationInSeconds ?? 0;
    const cleanType = (a.activityType ?? 'Workout')
      .toLowerCase()
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
    return {
      source: 'Garmin' as const,
      type: cleanType,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + durSec * 1000).toISOString(),
      durationMin: durSec / 60,
      distanceKm:
        a.distanceInMeters != null && a.distanceInMeters > 0
          ? a.distanceInMeters / 1000
          : undefined,
      calories: a.activeKilocalories,
      avgHR: a.averageHeartRateInBeatsPerMinute,
      maxHR: a.maxHeartRateInBeatsPerMinute,
    };
  });
}

export async function fetchRecentWorkouts(env: Env, days: number): Promise<{ workouts: Workout[] }> {
  const [w, f, g] = await Promise.all([
    whoopWorkouts(env, days).catch(() => []),
    fitbitWorkouts(env, days).catch(() => []),
    garminWorkouts(env, days).catch(() => []),
  ]);
  const workouts = [...w, ...f, ...g].sort(
    (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
  );
  return { workouts };
}
