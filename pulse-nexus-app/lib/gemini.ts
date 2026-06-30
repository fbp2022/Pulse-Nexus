/**
 * Google Gemini client for Pulse Nexus.
 *
 * Two surfaces:
 *
 *   1. askWeb(question)
 *      Single-shot Q&A. Kept for programmatic / one-off use.
 *
 *   2. chatTurn(history, userMessage, healthContext?)
 *      Multi-turn chat — the engine behind the Chat tab. The model is
 *      given:
 *        - a system instruction framing it as the user's Pulse Nexus
 *          coach, with explicit instructions not to give medical advice
 *        - a short, deterministic summary of the user's CURRENT data
 *          (recovery, HRV, sleep, etc.) so the model can answer
 *          questions like "why is my recovery low?" with real context
 *        - the full prior conversation as alternating user/model turns
 *        - the Google Search grounding tool, so it can pull live info
 *
 * The user-visible disclaimer is enforced in the UI, not here, because
 * the UI is what the user actually sees.
 *
 * Get an API key at https://aistudio.google.com/app/apikey
 * Set EXPO_PUBLIC_GEMINI_API_KEY in your .env (see .env.example).
 */
import Constants from 'expo-constants';

import type { CombinedSnapshot } from './assistant';
import { unify } from './assistant';

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GroundingSource = { title: string; uri: string };

export type ChatRole = 'user' | 'model';
export type ChatMessage = { role: ChatRole; text: string };

export type AskResult = {
  text: string;
  sources: GroundingSource[];
};

const SYSTEM_INSTRUCTION = `You are the Pulse Nexus coach: a friendly, concise health and fitness assistant inside an iPhone app called Pulse Nexus, made by Faith Based Innovations.

You can see a snapshot of the user's most recent metrics — heart rate variability, recovery, sleep, strain, body battery, steps, and so on — pulled from Apple Health, WHOOP, Fitbit, and Garmin. Use those values when they are relevant to the user's question. Refer to them by source if the user asks where a number came from.

Style rules:
- Be direct. Lead with the answer, then the explanation.
- Default to 2-5 sentences. Use bullet points only when the user asks for steps or comparisons.
- If a number is null/missing in the snapshot, say "I don't have a current reading for that" rather than guessing.
- Cite the source on the dashboard (e.g., "WHOOP says..." or "Apple Health says...") when quoting a specific value.

Hard limits:
- You are not a doctor. Do not diagnose, prescribe, or give specific medical, legal, or financial advice. For symptoms that concern the user, recommend they consult a clinician.
- You can recommend training adjustments and lifestyle habits (sleep, hydration, walking, breathing) within the range of common consumer-fitness guidance.
- When using web search, summarize and cite. Don't pretend a result is your own opinion.`;

function getKey(): string {
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.EXPO_PUBLIC_GEMINI_API_KEY;
  const fromEnv = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const key = fromExtra ?? fromEnv;
  if (!key) {
    throw new Error(
      'Missing EXPO_PUBLIC_GEMINI_API_KEY. Get a free key at https://aistudio.google.com/app/apikey and add it to .env.',
    );
  }
  return key;
}

/** Compact, deterministic plain-text summary of the user's current data. */
export function summarizeContext(snap: CombinedSnapshot): string {
  const u = unify(snap);
  const lines: string[] = [];
  const push = (k: string, v: string | null) => {
    if (v != null) lines.push(`- ${k}: ${v}`);
  };

  push('Recovery', u.recovery ? `${u.recovery.value}% (${u.recovery.source})` : null);
  push(
    'Resting HR',
    u.restingHR ? `${Math.round(u.restingHR.value)} bpm (${u.restingHR.source})` : null,
  );
  push('HRV', u.hrvMs ? `${Math.round(u.hrvMs.value)} ms (${u.hrvMs.source})` : null);
  push(
    'Sleep last night',
    u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h (${u.sleepHours.source})` : null,
  );
  push(
    'Sleep score',
    u.sleepScore ? `${Math.round(u.sleepScore.value)} (${u.sleepScore.source})` : null,
  );
  push(
    'Strain today',
    u.strainOrLoad ? `${u.strainOrLoad.value.toFixed(1)} / 21 (${u.strainOrLoad.source})` : null,
  );
  push('Body Battery', u.bodyBattery != null ? `${u.bodyBattery} (Garmin)` : null);
  push('Stress avg', u.stressAvg != null ? `${u.stressAvg} (Garmin)` : null);
  push(
    'Steps today',
    u.steps ? `${Math.round(u.steps.value).toLocaleString()} (${u.steps.source})` : null,
  );
  push(
    'Active kcal today',
    u.activeKcal ? `${Math.round(u.activeKcal.value).toLocaleString()} (${u.activeKcal.source})` : null,
  );
  push('SpO₂', u.spo2 ? `${u.spo2.value.toFixed(0)}% (${u.spo2.source})` : null);

  if (lines.length === 0) {
    return "The user has no live metrics available right now — they haven't connected a device yet, or their connected sources returned no data.";
  }
  return `Current user metrics (from the Pulse Nexus dashboard):\n${lines.join('\n')}`;
}

async function callGemini(body: object): Promise<{ text: string; sources: GroundingSource[] }> {
  const key = getKey();
  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }

  const json: GeminiResponse = await res.json();
  const candidate = json.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((p) => p.text ?? '')
      .filter(Boolean)
      .join('\n')
      .trim() ?? '';

  const grounding = candidate?.groundingMetadata;
  const sources: GroundingSource[] =
    grounding?.groundingChunks
      ?.map((c) => (c.web ? { title: c.web.title ?? c.web.uri ?? '', uri: c.web.uri ?? '' } : null))
      .filter((s): s is GroundingSource => !!s?.uri) ?? [];

  return { text, sources };
}

export async function askWeb(question: string): Promise<AskResult> {
  return callGemini({
    contents: [{ role: 'user', parts: [{ text: question }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  });
}

export async function chatTurn(
  history: ChatMessage[],
  userMessage: string,
  healthContext?: CombinedSnapshot,
): Promise<AskResult> {
  const contextPreamble = healthContext ? summarizeContext(healthContext) : '';
  const systemText = contextPreamble
    ? `${SYSTEM_INSTRUCTION}\n\n${contextPreamble}`
    : SYSTEM_INSTRUCTION;

  const contents = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  return callGemini({
    systemInstruction: { role: 'system', parts: [{ text: systemText }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.3 },
  });
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
    };
  }>;
};
