/**
 * Safe HTTP response parsing helpers.
 * Always reads the raw response body as text first before attempting JSON.parse,
 * ensuring empty bodies, HTML error pages (e.g. Cloudflare 404/502), or malformed
 * responses surface the real HTTP status code and readable error details instead of
 * throwing "Unexpected end of JSON input".
 */

export class HttpResponseError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly rawBody: string;

  constructor(status: number, statusText: string, message: string, rawBody: string) {
    super(message);
    this.name = 'HttpResponseError';
    this.status = status;
    this.statusText = statusText;
    this.rawBody = rawBody;
  }
}

function summarizeRawText(rawText: string, maxLength = 220): string {
  const cleaned = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

export function extractErrorMessageFromRaw(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const nestedError = parsed.error;
      if (nestedError && typeof nestedError === 'object' && 'message' in nestedError) {
        const msg = (nestedError as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg.trim();
      }
      if (typeof nestedError === 'string' && nestedError.trim()) {
        return nestedError.trim();
      }
      if (typeof parsed.errorMessage === 'string' && parsed.errorMessage.trim()) {
        return parsed.errorMessage.trim();
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    }
  } catch {
    // Not valid JSON — fall back to stripped raw text snippet
  }

  return summarizeRawText(trimmed);
}

/**
 * Reads `response.text()` once, validates `response.ok`, and parses JSON safely.
 * Throws `HttpResponseError` containing the HTTP status code and real error message
 * whenever the response is non-OK, empty, or invalid JSON.
 */
export async function parseJsonResponseSafely<T>(
  response: Pick<Response, 'ok' | 'status' | 'statusText' | 'text'>,
  contextLabel = 'API request'
): Promise<T> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (err) {
    const readErr = err instanceof Error ? err.message : String(err);
    throw new HttpResponseError(
      response.status,
      response.statusText,
      `${contextLabel} failed (HTTP ${response.status}): could not read response body (${readErr}).`,
      ''
    );
  }

  if (!response.ok) {
    const detail = extractErrorMessageFromRaw(rawText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    const message = detail
      ? `${contextLabel} failed (HTTP ${statusLabel}): ${detail}`
      : `${contextLabel} failed (HTTP ${statusLabel}) with an empty response body.`;
    throw new HttpResponseError(response.status, response.statusText, message, rawText);
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new HttpResponseError(
      response.status,
      response.statusText,
      `${contextLabel} returned an empty response (HTTP ${response.status}).`,
      rawText
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const snippet = summarizeRawText(trimmed, 140);
    throw new HttpResponseError(
      response.status,
      response.statusText,
      `${contextLabel} returned invalid JSON (HTTP ${response.status})${snippet ? `: ${snippet}` : '.'}`,
      rawText
    );
  }
}
