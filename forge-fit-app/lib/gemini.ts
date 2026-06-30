/**
 * Google Gemini "Ask the web" client.
 *
 * Uses the free tier of the Gemini API with the built-in Google Search
 * grounding tool, so answers are anchored to live web results.
 *
 * Get an API key at https://aistudio.google.com/app/apikey
 *
 * Set EXPO_PUBLIC_GEMINI_API_KEY in your .env (see .env.example).
 *
 * IMPORTANT: Always present output through the DisclaimerBanner. Gemini is a
 * generative model and can produce inaccuracies, even with grounding.
 */
import Constants from 'expo-constants';

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GroundingSource = { title: string; uri: string };

export type AskResult = {
  text: string;
  sources: GroundingSource[];
};

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

export async function askWeb(question: string): Promise<AskResult> {
  const key = getKey();
  const body = {
    contents: [{ role: 'user', parts: [{ text: question }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  };

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
      ?.map((c) => c.web)
      .filter((w): w is GroundingSource => !!w?.uri) ?? [];

  return { text, sources };
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } & GroundingSource }>;
    };
  }>;
};
