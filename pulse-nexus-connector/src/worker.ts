/**
 * Pulse Nexus connector — Cloudflare Worker.
 *
 * Exposes a tiny REST API that a ChatGPT Custom GPT (or Claude Action, or
 * any AI with HTTPS tools) can call to read the user's Pulse Nexus data.
 *
 * Endpoints:
 *   GET  /v1/snapshot            Unified current metrics
 *   GET  /v1/sleep               Last night sleep with stage breakdown
 *   GET  /v1/workouts?days=N     Recent workouts across providers
 *   GET  /v1/health              Liveness check (no auth)
 *
 * Auth: every endpoint except /v1/health requires `Authorization: Bearer <API_KEY>`
 * where API_KEY is set as a Wrangler secret. The Custom GPT stores this key
 * under its Actions → Authentication → API Key panel.
 *
 * This is intentionally a single-user backend: it talks to YOUR WHOOP /
 * Fitbit / Garmin accounts using refresh tokens you stored as secrets.
 * If you want a multi-tenant version, swap the secret-based config for a
 * KV-backed user table and add an OAuth dance.
 */
import { fetchUnifiedSnapshot } from './providers';
import { fetchLastNightSleep } from './sleep';
import { fetchRecentWorkouts } from './workouts';

export interface Env {
  API_KEY: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_REFRESH_TOKEN?: string;
  FITBIT_CLIENT_ID?: string;
  FITBIT_CLIENT_SECRET?: string;
  FITBIT_REFRESH_TOKEN?: string;
  GARMIN_CLIENT_ID?: string;
  GARMIN_CLIENT_SECRET?: string;
  GARMIN_REFRESH_TOKEN?: string;
  TOKENS?: KVNamespace;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function requireAuth(req: Request, env: Env): Response | null {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.API_KEY}`;
  if (!env.API_KEY) {
    return json({ error: 'API_KEY secret not configured on the worker.' }, 500);
  }
  if (auth !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/v1/health') {
      return json({ ok: true, service: 'pulse-nexus-connector' });
    }

    const unauthorized = requireAuth(req, env);
    if (unauthorized) return unauthorized;

    try {
      if (url.pathname === '/v1/snapshot') {
        return json(await fetchUnifiedSnapshot(env));
      }
      if (url.pathname === '/v1/sleep') {
        return json(await fetchLastNightSleep(env));
      }
      if (url.pathname === '/v1/workouts') {
        const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? '14')));
        return json(await fetchRecentWorkouts(env, days));
      }
      return json({ error: 'Not found', path: url.pathname }, 404);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : String(e) },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
