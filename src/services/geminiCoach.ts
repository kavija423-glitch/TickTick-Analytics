import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { extractErrorMessageFromRaw, HttpResponseError } from '../utils/http';

export type CoachModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export const COACH_MODELS: Record<'standard' | 'fast', CoachModelId> = {
  standard: 'gemini-4-hydrogen',
  fast: 'gemini-3.1-flash-lite',
};

export interface CoachHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SendCoachMessageParams {
  apiKey: string;
  model: CoachModelId;
  message: string;
  history: CoachHistoryMessage[];
  focusContext: string;
}

export interface SendCoachMessageResult {
  reply: string;
  model: CoachModelId;
}

/**
 * Safely reads the preview-only fallback key injected by Vite during `serve` (AI Studio preview).
 * In production builds (e.g. Cloudflare Pages), Vite replaces this with an empty string.
 */
export function getPreviewFallbackGeminiKey(): string {
  try {
    // Must be written without optional chaining so Vite's `define` statically
    // replaces `process.env.GEMINI_API_KEY` in both dev preview and production builds.
    const envVal = process.env.GEMINI_API_KEY;
    return typeof envVal === 'string' ? envVal.trim() : '';
  } catch {
    return '';
  }
}

export function isAiStudioPreviewEnv(): boolean {
  try {
    const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    return Boolean(metaEnv?.DEV);
  } catch {
    return false;
  }
}

/**
 * Resolves the active Gemini API key:
 * 1. Always prefers the user's saved Gemini API key from Settings (localStorage).
 * 2. Falls back to process.env.GEMINI_API_KEY ONLY inside the AI Studio preview environment.
 */
export function resolveGeminiApiKey(
  storedApiKey: string,
  envApiKey: string = getPreviewFallbackGeminiKey(),
  isPreviewEnv: boolean = isAiStudioPreviewEnv()
): string {
  const fromStorage = (storedApiKey || '').trim();
  if (fromStorage) return fromStorage;

  if (isPreviewEnv) {
    const fromEnv = (envApiKey || '').trim();
    if (fromEnv) return fromEnv;
  }

  return '';
}

export function formatGeminiError(err: unknown): string {
  if (err instanceof HttpResponseError) {
    return err.message;
  }

  const status =
    err && typeof err === 'object' && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : null;

  const rawMessage =
    err instanceof Error
      ? err.message
      : err &&
          typeof err === 'object' &&
          'message' in err &&
          typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err || '');
  const extracted = extractErrorMessageFromRaw(rawMessage) || rawMessage.trim();

  const statusPrefix = status ? ` (HTTP ${status})` : '';

  if (
    status === 400 &&
    (extracted.toLowerCase().includes('api key') || rawMessage.includes('API_KEY_INVALID'))
  ) {
    return `Invalid Gemini API key${statusPrefix}: ${extracted}. Verify your key in Settings.`;
  }

  if (status === 401 || status === 403 || rawMessage.includes('PERMISSION_DENIED')) {
    return `Gemini API authorization failed${statusPrefix}: ${extracted || 'Check your Gemini API key permissions in Settings.'}`;
  }

  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return `Gemini API rate limit or quota exceeded${statusPrefix}: ${extracted || 'Wait a moment or switch to Fast mode (gemini-3.1-flash-lite).'}`;
  }

  if (status === 404 || rawMessage.includes('NOT_FOUND')) {
    return `Requested Gemini model was not found${statusPrefix}: ${extracted}`;
  }

  if (extracted) {
    return status ? `Gemini API error${statusPrefix}: ${extracted}` : extracted;
  }

  return 'Unable to reach the Gemini API right now. Please check your network connection and API key in Settings.';
}

export function buildFocusCoachSystemInstruction(focusContext: string): string {
  return [
    'You are Cadence Focus Coach, an analytical, concise, and encouraging personal study and deep-work advisor.',
    'You help students and knowledge workers interpret their TickTick Pomodoro and Stopwatch focus analytics, diagnose schedule weaknesses, optimize deep work blocks (45+ min sessions), balance subjects (such as Combined Maths, Physics, and ICT), and maintain sustainable study streaks.',
    'Rules:',
    "- Always reference the specific numbers from the user's live dashboard snapshot when provided.",
    '- Keep replies clear, structured, and actionable (around 80-220 words unless the user asks for a full study schedule).',
    '- Use plain bullet points and crisp time recommendations; avoid fluff.',
    focusContext ? `\nLive Dashboard Snapshot:\n${focusContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendFocusCoachMessage(
  params: SendCoachMessageParams
): Promise<SendCoachMessageResult> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Open Settings → API Keys and paste your Gemini API key to use Focus Coach.'
    );
  }

  const userMessage = params.message.trim();
  if (!userMessage) {
    throw new Error('Please enter a message before sending.');
  }

  const safeHistory = Array.isArray(params.history)
    ? params.history
        .filter(
          (m) =>
            (m.role === 'user' || m.role === 'model') &&
            typeof m.text === 'string' &&
            m.text.trim().length > 0
        )
        .slice(-20)
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }))
    : [];

  try {
    const ai = new GoogleGenAI({ apiKey });
    let lastErr: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = ai.chats.create({
          model: params.model,
          history: safeHistory,
          config: {
            systemInstruction: buildFocusCoachSystemInstruction(params.focusContext),
            ...(params.model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });

        const response = await chat.sendMessage({ message: userMessage });
        const replyText = response.text?.trim();

        if (!replyText) {
          throw new Error('Gemini returned an empty response. Please try again.');
        }

        return {
          reply: replyText,
          model: params.model,
        };
      } catch (err) {
        lastErr = err;
        const status =
          err && typeof err === 'object' && 'status' in err
            ? (err as { status?: unknown }).status
            : null;
        const msg = err instanceof Error ? err.message : String(err || '');
        const isTransient = status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE');
        if (attempt === 0 && isTransient) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          continue;
        }
        throw err;
      }
    }

    throw lastErr;
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}
