type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

export type GeminiChatTurn = {
  role: 'user' | 'assistant';
  text: string;
};

/** Free-tier friendly first; Pro often has limit: 0 on free plans. */
const DEFAULT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
];

function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ''
  );
}

export function isGeminiConfigured() {
  return Boolean(geminiApiKey());
}

export function defaultGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODELS[0];
}

function modelCandidates() {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const list = preferred ? [preferred, ...DEFAULT_MODELS] : [...DEFAULT_MODELS];
  return [...new Set(list)];
}

export function isGeminiQuotaError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('resource_exhausted') ||
    m.includes('429')
  );
}

function extractText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned an empty answer');
  }
  return text;
}

async function generateWithModel(opts: {
  apiKey: string;
  model: string;
  system: string;
  contents: GeminiContent[];
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': opts.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } })?.error?.message ||
      `Gemini request failed (${res.status})`;
    throw new Error(msg);
  }
  return extractText(json);
}

/**
 * Ask Gemini using only this subscriber's finance snapshot.
 * Tries Flash (free-tier friendly), then other models if quota/errors hit.
 */
export async function askGeminiAboutSubscriberFinance(opts: {
  question: string;
  snapshotJson: string;
  history?: GeminiChatTurn[];
  language?: string;
}): Promise<{ answer: string; model: string; provider: 'gemini' }> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const lang = opts.language || 'en';
  const system = [
    'You are Moneybag, a personal finance assistant.',
    'Answer ONLY using the subscriber finance JSON provided for THIS logged-in customer.',
    'Do not invent transactions, balances, or categories that are not in the JSON.',
    'If data is missing, say what is missing and suggest what to log in Moneybag.',
    'Be concise, practical, and specific with amounts already formatted in the JSON.',
    'Never ask for passwords, OTP, UPI PIN, or card numbers.',
    'Do not discuss other customers — you only have one subscriber snapshot.',
    `Reply in language code: ${lang} (use that language for the answer).`,
  ].join(' ');

  const contents: GeminiContent[] = [];
  const history = (opts.history || []).slice(-8);
  for (const turn of history) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text.slice(0, 2000) }],
    });
  }

  // Keep payload smaller to reduce token quota usage.
  const snap =
    opts.snapshotJson.length > 12000
      ? `${opts.snapshotJson.slice(0, 12000)}\n…(truncated)`
      : opts.snapshotJson;

  contents.push({
    role: 'user',
    parts: [
      {
        text: [
          'Subscriber finance data (JSON):',
          snap,
          '',
          `Question: ${opts.question.slice(0, 1000)}`,
        ].join('\n'),
      },
    ],
  });

  const models = modelCandidates();
  let lastError = '';

  for (const model of models) {
    try {
      const answer = await generateWithModel({ apiKey, model, system, contents });
      return { answer, model, provider: 'gemini' };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Try next model on quota / not-found; stop on auth errors.
      const lower = lastError.toLowerCase();
      if (lower.includes('api key') || lower.includes('permission') || lower.includes('401')) {
        throw new Error(lastError);
      }
      continue;
    }
  }

  throw new Error(lastError || 'All Gemini models failed');
}
