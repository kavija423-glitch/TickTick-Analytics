import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TICKTICK_BASE = 'https://api.ticktick.com/open/v1';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Local mirror of the Cloudflare Pages Function at /functions/api/ticktick.ts
app.get('/api/ticktick', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or invalid Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const endpointRaw = (req.query.endpoint ?? req.query.path) as string | undefined;
  if (!endpointRaw || typeof endpointRaw !== 'string') {
    res.status(400).json({
      error: 'Missing required "endpoint" query parameter (e.g. /focus or /project).',
    });
    return;
  }

  const normalizedEndpoint = endpointRaw.startsWith('/') ? endpointRaw : `/${endpointRaw}`;
  if (normalizedEndpoint.includes('..') || normalizedEndpoint.startsWith('//')) {
    res.status(400).json({ error: 'Invalid TickTick API endpoint path.' });
    return;
  }

  const targetUrl = new URL(`${TICKTICK_BASE}${normalizedEndpoint}`);
  for (const [key, val] of Object.entries(req.query)) {
    if (key === 'endpoint' || key === 'path') continue;
    if (typeof val === 'string') {
      targetUrl.searchParams.set(key, val);
    }
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach TickTick API';
    res.status(502).json({ error: `Proxy network error: ${message}` });
  }
});

// Multi-turn Gemini Focus Coach endpoint
interface ChatHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatRequestBody {
  message?: string;
  history?: ChatHistoryMessage[];
  model?: string;
  focusContext?: string;
}

const ALLOWED_CHAT_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

app.post('/api/chat', async (req, res) => {
  const body = (req.body ?? {}) as ChatRequestBody;
  const userMessage = typeof body.message === 'string' ? body.message.trim() : '';

  if (!userMessage) {
    res.status(400).json({ error: 'Please enter a message before sending.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        'Gemini API key is not configured on the server. Add your Gemini API key in Settings.',
    });
    return;
  }

  const requestedModel =
    typeof body.model === 'string' && ALLOWED_CHAT_MODELS.has(body.model)
      ? body.model
      : 'gemini-4-hydrogen';

  const systemInstruction = [
    'You are Cadence Focus Coach, an analytical, concise, and encouraging personal study and deep-work advisor.',
    'You help students and knowledge workers interpret their TickTick Pomodoro and focus analytics, diagnose schedule weaknesses, optimize deep work blocks (45+ min sessions), balance subjects (such as Combined Maths, Physics, and ICT), and maintain sustainable study streaks.',
    'Rules:',
    '- Always reference the specific numbers from the user\'s live dashboard snapshot when provided.',
    '- Keep replies clear, structured, and actionable (around 80-220 words unless the user asks for a full study schedule).',
    '- Use plain bullet points and crisp time recommendations; avoid fluff.',
    body.focusContext ? `\nLive Dashboard Snapshot:\n${body.focusContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeHistory = Array.isArray(body.history)
    ? body.history
        .filter(
          (m): m is ChatHistoryMessage =>
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
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const chat = ai.chats.create({
      model: requestedModel,
      history: safeHistory,
      config: {
        systemInstruction,
        ...(requestedModel === 'gemini-4-hydrogen'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });

    const response = await chat.sendMessage({ message: userMessage });
    const replyText = response.text?.trim();

    if (!replyText) {
      res.status(502).json({ error: 'Received an empty response from Gemini. Please try again.' });
      return;
    }

    res.json({
      reply: replyText,
      model: requestedModel,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unexpected Gemini API error';
    const status =
      rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')
        ? 429
        : rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED')
          ? 403
          : rawMsg.includes('400') || rawMsg.includes('API_KEY_INVALID')
            ? 400
            : 500;
    res.status(status).json({ error: rawMsg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://localhost:${PORT}`);
  });
}

startServer();
