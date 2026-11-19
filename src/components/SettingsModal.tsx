import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  AutoRefreshInterval,
  ConnectionMode,
  SubjectRule,
} from '../types/focus';
import { DEFAULT_SUBJECT_RULES } from '../utils/defaults';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (nextSettings: AppSettings) => void;
  onTriggerFullSync: (nextSettings: AppSettings) => void;
  onClearCache: () => void;
}

type SettingsTab = 'connection' | 'sync' | 'subjects';

const AUTO_REFRESH_OPTIONS: { value: AutoRefreshInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: 'Every 5 min' },
  { value: 10, label: 'Every 10 min' },
  { value: 30, label: 'Every 30 min' },
];

const CONNECTION_MODES: {
  id: ConnectionMode;
  title: string;
  description: string;
}[] = [
  {
    id: 'proxy',
    title: 'Built-in Proxy (/api/ticktick)',
    description:
      'Recommended. Routes requests via Cloudflare Pages Function (functions/api/ticktick.ts) or local Express proxy to avoid CORS blocks.',
  },
  {
    id: 'custom_proxy',
    title: 'Custom Proxy URL',
    description:
      'Point to your own Cloudflare Worker or reverse proxy accepting ?endpoint=/focus&from=...&to=...',
  },
  {
    id: 'direct',
    title: 'Direct API Call',
    description:
      'Calls https://api.ticktick.com/open/v1 directly from the browser (may be blocked by CORS unless using an extension).',
  },
];

const PRESET_COLORS = ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#94A3B8'];

export function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onTriggerFullSync,
  onClearCache,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('connection');
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [cacheClearedMsg, setCacheClearedMsg] = useState(false);

  if (!open) return null;

  const updateRule = (id: string, patch: Partial<SubjectRule>) => {
    setDraft((prev) => ({
      ...prev,
      subjectRules: prev.subjectRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const addSubjectRule = () => {
    const idx = draft.subjectRules.length;
    const newRule: SubjectRule = {
      id: `subject-${Date.now()}`,
      name: 'New Subject',
      color: PRESET_COLORS[idx % PRESET_COLORS.length],
      keywords: [],
      projectNames: [],
      tags: [],
    };
    setDraft((prev) => {
      const defaults = prev.subjectRules.filter((r) => r.isDefault);
      const custom = prev.subjectRules.filter((r) => !r.isDefault);
      return { ...prev, subjectRules: [...custom, newRule, ...defaults] };
    });
  };

  const removeSubjectRule = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      subjectRules: prev.subjectRules.filter((r) => r.id !== id),
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleSaveAndSync = () => {
    const next = { ...draft, demoMode: false };
    onSave(next);
    onClose();
    onTriggerFullSync(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#242B3A] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1E2330]">
          <div>
            <h2
              id="settings-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure TickTick API connection, sync intervals, daily goal, and subject mapping.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex items-center gap-1 px-6 pt-3 border-b border-slate-200 dark:border-[#1E2330]"
        >
          {(
            [
              { id: 'connection', label: 'TickTick API' },
              { id: 'sync', label: 'Sync & Goals' },
              { id: 'subjects', label: 'Subject Mapping' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 -mb-[1px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === 'connection' && (
            <>
              {/* Personal API Token */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="ticktick-token-input"
                    className="text-xs font-medium text-slate-900 dark:text-slate-100"
                  >
                    TickTick Personal API Token
                  </label>
                  {draft.apiToken && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, apiToken: '' }))}
                      className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear token
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="ticktick-token-input"
                    type={showToken ? 'text' : 'password'}
                    value={draft.apiToken}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, apiToken: e.target.value }))
                    }
                    placeholder="Paste your TickTick OAuth / Personal Access Token…"
                    autoComplete="off"
                    className="w-full pr-10 pl-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-[#171B24] border border-slate-200 dark:border-[#242B3A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Stored locally in your browser&apos;s <code className="font-mono">localStorage</code> and sent only via the <code className="font-mono">Authorization: Bearer</code> header.
                </p>
              </div>

              {/* Connection Mode */}
              <fieldset className="space-y-2.5">
                <legend className="text-xs font-medium text-slate-900 dark:text-slate-100 mb-1">
                  CORS Proxy & Request Routing
                </legend>
                {CONNECTION_MODES.map((mode) => {
                  const selected = draft.connectionMode === mode.id;
                  return (
                    <label
                      key={mode.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/25'
                          : 'border-slate-200 dark:border-[#222836] hover:bg-slate-50 dark:hover:bg-[#161A23]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="connectionMode"
                        value={mode.id}
                        checked={selected}
                        onChange={() =>
                          setDraft((prev) => ({ ...prev, connectionMode: mode.id }))
                        }
                        className="mt-0.5 accent-indigo-500"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          {mode.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                          {mode.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </fieldset>

              {draft.connectionMode === 'custom_proxy' && (
                <div>
                  <label
                    htmlFor="custom-proxy-url"
                    className="block text-xs font-medium text-slate-900 dark:text-slate-100 mb-1.5"
                  >
                    Custom Proxy Endpoint URL
                  </label>
                  <input
                    id="custom-proxy-url"
                    type="url"
                    value={draft.customProxyUrl}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, customProxyUrl: e.target.value }))
                    }
                    placeholder="https://your-worker.pages.dev/api/ticktick"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-[#171B24] border border-slate-200 dark:border-[#242B3A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                  />
                </div>
              )}
            </>
          )}

          {activeTab === 'sync' && (
            <>
              {/* Daily Streak Goal */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="daily-goal-input"
                    className="text-xs font-medium text-slate-900 dark:text-slate-100"
                  >
                    Daily Focus Streak Goal
                  </label>
                  <span className="text-xs font-mono tabular-nums font-medium text-indigo-600 dark:text-indigo-400">
                    {Math.floor(draft.dailyGoalMinutes / 60)}h {draft.dailyGoalMinutes % 60}m ({draft.dailyGoalMinutes} min)
                  </span>
                </div>
                <input
                  id="daily-goal-input"
                  type="range"
                  min={30}
                  max={480}
                  step={15}
                  value={draft.dailyGoalMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      dailyGoalMinutes: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
                  <span>30m</span>
                  <span>2h (default)</span>
                  <span>4h</span>
                  <span>8h</span>
                </div>
              </div>

              {/* Auto-refresh interval */}
              <div>
                <label className="block text-xs font-medium text-slate-900 dark:text-slate-100 mb-2">
                  Background Auto-Refresh Interval
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AUTO_REFRESH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          autoRefreshMinutes: opt.value,
                        }))
                      }
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                        draft.autoRefreshMinutes === opt.value
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-[#242B3A] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#171B24]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Silently fetches the latest 30-day TickTick window while the dashboard is open.
                </p>
              </div>

              {/* Historical Sync Depth */}
              <div>
                <label className="block text-xs font-medium text-slate-900 dark:text-slate-100 mb-2">
                  Historical Sync Window (30-Day Sequential Chunking)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([6, 12] as const).map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, historyMonths: months }))
                      }
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        draft.historyMonths === months
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-[#242B3A] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#171B24]'
                      }`}
                    >
                      Past {months} months ({months} chunks)
                    </button>
                  ))}
                </div>
              </div>

              {/* Local Cache Controls */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#1E2330] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    Local Session Cache
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {cacheClearedMsg
                      ? 'Cached TickTick records cleared.'
                      : 'Historical months are cached in localStorage and deduplicated by session ID.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClearCache();
                    setCacheClearedMsg(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Cached Data
                </button>
              </div>
            </>
          )}

          {activeTab === 'subjects' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Map TickTick projects, tags, or title keywords to subjects. Separate multiple values with commas.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        subjectRules: DEFAULT_SUBJECT_RULES,
                      }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#171B24] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Defaults
                  </button>
                  <button
                    type="button"
                    onClick={addSubjectRule}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Subject
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {draft.subjectRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-[#222836] bg-slate-50/50 dark:bg-[#161A23] space-y-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <label className="sr-only" htmlFor={`color-${rule.id}`}>
                        Subject color
                      </label>
                      <input
                        id={`color-${rule.id}`}
                        type="color"
                        value={rule.color}
                        onChange={(e) => updateRule(rule.id, { color: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
                      />
                      <label className="sr-only" htmlFor={`name-${rule.id}`}>
                        Subject name
                      </label>
                      <input
                        id={`name-${rule.id}`}
                        type="text"
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252C3D] text-slate-900 dark:text-slate-100"
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        {rule.isDefault ? 'Fallback' : rule.color.toUpperCase()}
                      </span>
                      {!rule.isDefault && (
                        <button
                          type="button"
                          onClick={() => removeSubjectRule(rule.id)}
                          aria-label={`Delete subject ${rule.name}`}
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {!rule.isDefault && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label
                            htmlFor={`projects-${rule.id}`}
                            className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1 whitespace-nowrap"
                          >
                            Projects
                          </label>
                          <input
                            id={`projects-${rule.id}`}
                            type="text"
                            value={rule.projectNames.join(', ')}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                projectNames: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Physics, Lab"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252C3D] text-slate-800 dark:text-slate-200"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`tags-${rule.id}`}
                            className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1 whitespace-nowrap"
                          >
                            Tags
                          </label>
                          <input
                            id={`tags-${rule.id}`}
                            type="text"
                            value={rule.tags.join(', ')}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                tags: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="physics, phy"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252C3D] text-slate-800 dark:text-slate-200"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`keywords-${rule.id}`}
                            className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1 whitespace-nowrap"
                          >
                            Keywords
                          </label>
                          <input
                            id={`keywords-${rule.id}`}
                            type="text"
                            value={rule.keywords.join(', ')}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                keywords: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="optics, circuits"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252C3D] text-slate-800 dark:text-slate-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-slate-200 dark:border-[#1E2330] bg-slate-50/70 dark:bg-[#0E1117]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#171B24] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {draft.apiToken.trim().length > 0 && (
              <button
                type="button"
                onClick={handleSaveAndSync}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Save & Sync History
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer whitespace-nowrap"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
