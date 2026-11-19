import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, Send, Trash2, X } from 'lucide-react';
import type { ChatMessage } from '../types/focus';
import { STORAGE_KEYS } from '../utils/defaults';

interface FocusCoachDrawerProps {
  open: boolean;
  onClose: () => void;
  focusContext: string;
}

const STARTER_PROMPTS = [
  'Analyze my weak days and suggest a fix',
  'How can I raise my Deep Work Ratio?',
  'Build a 7-day study split for Maths, Physics & ICT',
  'Am I utilizing my peak focus hours effectively?',
];

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'model',
  text: 'I am your Cadence Focus Coach. I can see your active timeframe metrics, streak, peak hours, subject split, and Deep Work Ratio. Ask me anything about optimizing your study schedule.',
  timestamp: new Date().toISOString(),
};

function loadInitialMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) return [INITIAL_MESSAGE];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as ChatMessage[];
    }
  } catch {
    // Ignore storage read errors
  }
  return [INITIAL_MESSAGE];
}

export function FocusCoachDrawer({
  open,
  onClose,
  focusContext,
}: FocusCoachDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadInitialMessages);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    'gemini-4-hydrogen'
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages.slice(-30)));
    } catch {
      // Ignore storage write errors
    }
  }, [messages]);

  useEffect(() => {
    if (open) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, sending]);

  if (!open) return null;

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || sending) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: content,
      timestamp: new Date().toISOString(),
    };

    const historyForApi = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: historyForApi,
          model,
          focusContext,
        }),
      });

      const data = (await response.json()) as { reply?: string; error?: string; model?: string };

      if (!response.ok || !data.reply) {
        throw new Error(data.error || `Chat request failed (${response.status})`);
      }

      const replyMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: data.reply,
        timestamp: new Date().toISOString(),
        model: data.model || model,
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reach Focus Coach right now.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleClear = () => {
    setMessages([INITIAL_MESSAGE]);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Focus Coach Chat"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full flex flex-col bg-white dark:bg-[#12151C] border-l border-slate-200 dark:border-[#242B3A] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#1E2330]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Focus Coach
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Context-aware study advisor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear conversation"
              title="Clear conversation"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Focus Coach"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Model Selector Bar */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-[#1E2330] bg-slate-50/70 dark:bg-[#0E1117] flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Model mode</span>
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-[#181C26]">
            <button
              type="button"
              onClick={() => setModel('gemini-4-hydrogen')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                model === 'gemini-4-hydrogen'
                  ? 'bg-white dark:bg-[#242B3A] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setModel('gemini-3.1-flash-lite')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                model === 'gemini-3.1-flash-lite'
                  ? 'bg-white dark:bg-[#242B3A] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Fast
            </button>
          </div>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-[#181C26] text-slate-800 dark:text-slate-200 border border-slate-200/70 dark:border-[#232938]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-start">
              <div className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs bg-slate-100 dark:bg-[#181C26] text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-[#232938]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Analyzing your focus data…
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Starter Prompts when conversation is fresh */}
          {messages.length <= 1 && !sending && (
            <div className="pt-2 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                Suggested questions
              </div>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="block w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181C26] hover:border-indigo-500/40 transition-colors cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-4 border-t border-slate-200 dark:border-[#1E2330] bg-slate-50/70 dark:bg-[#0E1117]"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="coach-chat-input" className="sr-only">
              Ask Focus Coach a question
            </label>
            <textarea
              id="coach-chat-input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask about your streak, subjects, or schedule…"
              className="flex-1 resize-none px-3 py-2 text-xs rounded-lg bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#242B3A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
