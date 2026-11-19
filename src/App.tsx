import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  Clock,
  Database,
  LayoutDashboard,
  ListFilter,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  FocusSession,
  SyncError,
  SyncProgress,
  TickTickProject,
  TimeframePreset,
  TrendGranularity,
} from './types/focus';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SUBJECT_RULES,
  STORAGE_KEYS,
  TIMEFRAME_OPTIONS,
} from './utils/defaults';
import {
  applySubjectRules,
  buildFocusCoachContext,
  computeDayOfWeekStats,
  computeDurationAnalysis,
  computeHourlyDistribution,
  computeKpis,
  computeSubjectBreakdown,
  computeTrendSeries,
  filterSessionsByRange,
  formatRelativeSyncTime,
  getTimeframeBounds,
} from './utils/analytics';
import { generateDemoSessions } from './utils/demoData';
import {
  clearTickTickLocalCache,
  loadCachedProjects,
  loadCachedSessions,
  syncTickTickData,
} from './services/ticktick';
import { KpiGrid } from './components/KpiGrid';
import { ActivityHeatmaps } from './components/ActivityHeatmaps';
import { SubjectBreakdownCard } from './components/SubjectBreakdownCard';
import { FocusTrendsCard } from './components/FocusTrendsCard';
import { PeakHoursCard } from './components/PeakHoursCard';
import { DayOfWeekCard } from './components/DayOfWeekCard';
import { DurationAnalysisCard } from './components/DurationAnalysisCard';
import { SessionLogTable } from './components/SessionLogTable';
import { SettingsModal } from './components/SettingsModal';
import { FocusCoachDrawer } from './components/FocusCoachDrawer';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      subjectRules:
        Array.isArray(parsed.subjectRules) && parsed.subjectRules.length > 0
          ? parsed.subjectRules
          : DEFAULT_SUBJECT_RULES,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadLastSynced(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNCED);
  } catch {
    return null;
  }
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [cachedSessions, setCachedSessions] = useState<FocusSession[]>(loadCachedSessions);
  const [projects, setProjects] = useState<TickTickProject[]>(loadCachedProjects);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(loadLastSynced);

  const [timeframe, setTimeframe] = useState<TimeframePreset>('last_90_days');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('daily');
  const [activeNav, setActiveNav] = useState<string>('overview');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    active: false,
    currentChunk: 0,
    totalChunks: 0,
    label: '',
  });
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [relativeNow, setRelativeNow] = useState<Date>(() => new Date());

  const isDark = settings.theme === 'dark';
  const startupSyncedRef = useRef(false);

  // Sync `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Persist settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  // Refresh "Last synced: X mins ago" every 30s
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeNow(new Date());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Project name lookup map
  const projectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      if (p.id && p.name) map[p.id] = p.name;
    }
    return map;
  }, [projects]);

  // Deterministic 6-month demo data anchored to current date
  const demoAnchor = useMemo(() => new Date(), []);
  const demoSessions = useMemo(
    () =>
      applySubjectRules(
        generateDemoSessions(demoAnchor, settings.subjectRules),
        settings.subjectRules
      ),
    [demoAnchor, settings.subjectRules]
  );

  // Re-apply subject rules live whenever custom mappings change
  const liveSessions = useMemo(
    () => applySubjectRules(cachedSessions, settings.subjectRules, projectNameById),
    [cachedSessions, settings.subjectRules, projectNameById]
  );

  const allSessions = settings.demoMode ? demoSessions : liveSessions;

  // Sync handler
  const runSync = useCallback(
    async (
      mode: 'recent' | 'full',
      settingsOverride?: AppSettings,
      forceFull = false
    ) => {
      const activeSettings = settingsOverride ?? settings;
      if (!activeSettings.apiToken.trim()) {
        setSyncError({
          code: 'AUTH',
          title: 'TickTick API Token Not Configured',
          message:
            'Add your TickTick Personal API Token in Settings to sync live sessions, or enable Demo Data to explore the dashboard.',
        });
        return;
      }

      setSyncError(null);
      try {
        const result = await syncTickTickData({
          settings: activeSettings,
          mode,
          forceFull,
          onProgress: setSyncProgress,
        });
        setCachedSessions(result.sessions);
        setProjects(result.projects);
        setLastSyncedAt(result.syncedAt);
        setRelativeNow(new Date());
      } catch (err) {
        const normalized = err as SyncError;
        setSyncError(
          normalized?.title
            ? normalized
            : {
                code: 'NETWORK',
                title: 'Sync Failed',
                message: 'Could not sync with TickTick Open API.',
              }
        );
      } finally {
        setSyncProgress((prev) => ({ ...prev, active: false }));
      }
    },
    [settings]
  );

  // Auto-sync latest 30-day window on startup when live token exists
  useEffect(() => {
    if (startupSyncedRef.current) return;
    startupSyncedRef.current = true;
    if (!settings.demoMode && settings.apiToken.trim()) {
      void runSync('recent', settings);
    }
  }, [settings, runSync]);

  // Auto-refresh polling interval
  useEffect(() => {
    if (settings.demoMode || !settings.apiToken.trim() || settings.autoRefreshMinutes <= 0) {
      return;
    }
    const intervalMs = settings.autoRefreshMinutes * 60_000;
    const id = window.setInterval(() => {
      void runSync('recent');
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [settings.demoMode, settings.apiToken, settings.autoRefreshMinutes, runSync]);

  // Filter by selected subject first (streaks & heatmaps reflect selected subject)
  const subjectScopedSessions = useMemo(() => {
    if (selectedSubjectId === 'all') return allSessions;
    return allSessions.filter((s) => s.subjectId === selectedSubjectId);
  }, [allSessions, selectedSubjectId]);

  const earliestSessionDate = useMemo(() => {
    if (subjectScopedSessions.length === 0) return null;
    let minMs = Infinity;
    for (const s of subjectScopedSessions) {
      const t = new Date(s.startTime).getTime();
      if (t < minMs) minMs = t;
    }
    return Number.isFinite(minMs) ? new Date(minMs) : null;
  }, [subjectScopedSessions]);

  const nowDate = useMemo(() => new Date(), [allSessions.length, timeframe]);

  const bounds = useMemo(
    () => getTimeframeBounds(timeframe, nowDate, earliestSessionDate),
    [timeframe, nowDate, earliestSessionDate]
  );

  const filteredSessions = useMemo(
    () => filterSessionsByRange(subjectScopedSessions, bounds.start, bounds.end),
    [subjectScopedSessions, bounds.start, bounds.end]
  );

  const previousPeriodSessions = useMemo(() => {
    if (!bounds.prevStart || !bounds.prevEnd) return [];
    return filterSessionsByRange(subjectScopedSessions, bounds.prevStart, bounds.prevEnd);
  }, [subjectScopedSessions, bounds.prevStart, bounds.prevEnd]);

  // All analytics derivations
  const kpis = useMemo(
    () =>
      computeKpis(
        filteredSessions,
        previousPeriodSessions,
        subjectScopedSessions,
        bounds.totalDays,
        settings.dailyGoalMinutes,
        bounds.prevStart !== null,
        nowDate
      ),
    [
      filteredSessions,
      previousPeriodSessions,
      subjectScopedSessions,
      bounds.totalDays,
      bounds.prevStart,
      settings.dailyGoalMinutes,
      nowDate,
    ]
  );

  // Subject breakdown uses timeframe-filtered sessions across all subjects so Donut stays informative
  const timeframeAllSubjectSessions = useMemo(
    () => filterSessionsByRange(allSessions, bounds.start, bounds.end),
    [allSessions, bounds.start, bounds.end]
  );

  const subjectBreakdown = useMemo(
    () => computeSubjectBreakdown(timeframeAllSubjectSessions, settings.subjectRules),
    [timeframeAllSubjectSessions, settings.subjectRules]
  );

  const trendSeries = useMemo(
    () => computeTrendSeries(filteredSessions, trendGranularity, settings.subjectRules, nowDate),
    [filteredSessions, trendGranularity, settings.subjectRules, nowDate]
  );

  const hourlyAnalysis = useMemo(
    () => computeHourlyDistribution(filteredSessions),
    [filteredSessions]
  );

  const dowAnalysis = useMemo(
    () => computeDayOfWeekStats(filteredSessions),
    [filteredSessions]
  );

  const durationAnalysis = useMemo(
    () => computeDurationAnalysis(filteredSessions),
    [filteredSessions]
  );

  const timeframeLabel =
    TIMEFRAME_OPTIONS.find((t) => t.id === timeframe)?.label || 'Last 90 Days';
  const subjectFilterLabel =
    selectedSubjectId === 'all'
      ? 'All Subjects'
      : settings.subjectRules.find((r) => r.id === selectedSubjectId)?.name || 'Subject';

  const focusCoachContext = useMemo(
    () =>
      buildFocusCoachContext({
        timeframeLabel,
        subjectFilterLabel,
        dailyGoalMinutes: settings.dailyGoalMinutes,
        kpis,
        subjects: subjectBreakdown,
        hourly: hourlyAnalysis,
        dow: dowAnalysis,
        duration: durationAnalysis,
      }),
    [
      timeframeLabel,
      subjectFilterLabel,
      settings.dailyGoalMinutes,
      kpis,
      subjectBreakdown,
      hourlyAnalysis,
      dowAnalysis,
      durationAnalysis,
    ]
  );

  const handleToggleDemoMode = () => {
    setSyncError(null);
    setSettings((prev) => ({ ...prev, demoMode: !prev.demoMode }));
  };

  const handleToggleTheme = () => {
    setSettings((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

  const handleClearCache = () => {
    clearTickTickLocalCache();
    setCachedSessions([]);
    setProjects([]);
    setLastSyncedAt(null);
  };

  const handleForceFullResync = (next: AppSettings) => {
    handleClearCache();
    void runSync('full', next, true);
  };

  const navigateToSection = (sectionId: string) => {
    setActiveNav(sectionId);
    setMobileNavOpen(false);
    if (sectionId === 'overview') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'heatmaps', label: 'Activity Heatmaps', icon: CalendarDays },
    { id: 'trends', label: 'Subjects & Trends', icon: BarChart3 },
    { id: 'rhythm', label: 'Rhythm & Deep Work', icon: Clock },
    { id: 'sessions', label: 'Session Log', icon: ListFilter },
  ];

  const isEmptyLiveState = !settings.demoMode && allSessions.length === 0 && !syncProgress.active;
  const timezoneName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    } catch {
      return 'Local Time';
    }
  }, []);

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100">
      {/* Desktop Left Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:flex-col w-[240px] shrink-0 border-r border-slate-200 dark:border-[#1A1F2C] bg-white dark:bg-[#0E1118] sticky top-0 h-screen"
      >
        <div className="h-14 px-5 flex items-center border-b border-slate-200 dark:border-[#1A1F2C]">
          <span className="text-base font-bold tracking-tight font-display text-slate-900 dark:text-slate-50 whitespace-nowrap">
            Cadence
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-100 dark:bg-[#181D29] text-slate-900 dark:text-slate-50'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#141822] hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-slate-200 dark:border-[#1A1F2C]">
            <button
              type="button"
              onClick={() => setCoachOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Bot className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Focus Coach</span>
            </button>
          </div>
        </nav>

        {/* Bottom Workspace Footer */}
        <div className="p-3.5 border-t border-slate-200 dark:border-[#1A1F2C] space-y-2.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 px-1 space-y-0.5">
            <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
              {settings.demoMode ? 'Demo Dataset (6 Months)' : 'TickTick Live Sync'}
            </div>
            <div className="font-mono tabular-nums truncate">
              {settings.demoMode
                ? `${allSessions.length} sample sessions`
                : `Last synced: ${formatRelativeSyncTime(lastSyncedAt, relativeNow)}`}
            </div>
            <div className="truncate opacity-80">{timezoneName}</div>
          </div>

          <button
            type="button"
            onClick={handleToggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#222836] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#161B25] transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              )}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/60"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            onClick={(e) => e.stopPropagation()}
            className="w-64 h-full bg-white dark:bg-[#0E1118] border-r border-slate-200 dark:border-[#1A1F2C] flex flex-col"
          >
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-[#1A1F2C]">
              <span className="text-base font-bold font-display text-slate-900 dark:text-slate-50">
                Cadence
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1A1F2B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateToSection(item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181D29] cursor-pointer"
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  setCoachOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 cursor-pointer"
              >
                <Bot className="w-4 h-4 shrink-0" aria-hidden="true" />
                Focus Coach
              </button>
            </nav>
            <div className="p-3 border-t border-slate-200 dark:border-[#1A1F2C]">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#222836] text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Single-Row Top Header */}
        <header className="h-14 sticky top-0 z-30 bg-white/90 dark:bg-[#0B0D12]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#1A1F2C] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#171B24] cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="font-semibold font-display text-slate-900 dark:text-slate-100 lg:hidden whitespace-nowrap">
                Cadence
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600 lg:hidden" aria-hidden="true">
                /
              </span>
              <span className="hidden sm:inline font-medium text-slate-700 dark:text-slate-200 truncate">
                Focus Analytics
              </span>
              <span className="hidden md:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                {settings.demoMode
                  ? 'Demo Data'
                  : `Last synced: ${formatRelativeSyncTime(lastSyncedAt, relativeNow)}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCoachOpen(true)}
              aria-label="Focus Coach"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] bg-white dark:bg-[#141822] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1B202C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              <span className="hidden sm:inline">Focus Coach</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (settings.demoMode) {
                  setSettingsOpen(true);
                } else {
                  void runSync(cachedSessions.length === 0 ? 'full' : 'recent');
                }
              }}
              disabled={syncProgress.active}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncProgress.active ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{syncProgress.active ? 'Syncing…' : 'Sync Now'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open Settings"
              className="p-2 rounded-lg border border-slate-200 dark:border-[#242B3A] bg-white dark:bg-[#141822] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Global Filter Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Timeframe Preset Segmented Control */}
            <div
              role="group"
              aria-label="Timeframe filter"
              className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] overflow-x-auto max-w-full"
            >
              {TIMEFRAME_OPTIONS.map((opt) => {
                const active = timeframe === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTimeframe(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#1A1F2B]'
                    }`}
                  >
                    <span className="hidden sm:inline">{opt.label}</span>
                    <span className="sm:hidden">{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Subject Dropdown + Demo Data Toggle */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="subject-filter-select"
                  className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
                >
                  Subject
                </label>
                <select
                  id="subject-filter-select"
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
                >
                  <option value="all">All Subjects</option>
                  {settings.subjectRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.demoMode}
                onClick={handleToggleDemoMode}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.demoMode
                    ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/35 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-[#242B3A] bg-white dark:bg-[#12151C] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#171B24]'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{settings.demoMode ? 'Demo Data: On' : 'Load Demo Data'}</span>
              </button>
            </div>
          </div>

          {/* Sync Progress Banner */}
          {syncProgress.active && (
            <div
              role="status"
              className="bg-white dark:bg-[#12151C] border border-indigo-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                <div>
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    {syncProgress.label || 'Syncing TickTick focus records…'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    30-day chunk {syncProgress.currentChunk} of {Math.max(1, syncProgress.totalChunks)}
                  </div>
                </div>
              </div>
              <div className="w-full sm:w-48 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{
                    width: `${Math.round(
                      (syncProgress.currentChunk / Math.max(1, syncProgress.totalChunks)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Banner (Invalid Token / CORS / Network) */}
          {syncError && (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-xs">
                  <div className="font-semibold text-rose-800 dark:text-rose-200">
                    {syncError.title}
                  </div>
                  <p className="text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">
                    {syncError.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  onClick={() => setSyncError(null)}
                  aria-label="Dismiss error"
                  className="p-1.5 rounded-lg text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Clean Empty State when Live Mode has no synced data yet */}
          {isEmptyLiveState ? (
            <section
              aria-label="Empty Dashboard State"
              className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-2xl p-10 text-center max-w-xl mx-auto my-8"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-5 h-5" aria-hidden="true" />
              </div>
              <h1 className="text-lg font-semibold font-display text-slate-900 dark:text-slate-100">
                Connect your TickTick Focus History
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-md mx-auto">
                Paste your TickTick Personal API Token in Settings to automatically chunk-fetch up to 12 months of Pomodoro sessions, or load 6 months of realistic demo study data to explore every chart immediately.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  Configure TickTick Token
                </button>
                <button
                  type="button"
                  onClick={handleToggleDemoMode}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#171B24] transition-colors cursor-pointer"
                >
                  Load 6-Month Demo Data
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* 1. Top KPI Summary Cards */}
              <KpiGrid
                kpis={kpis}
                dailyGoalMinutes={settings.dailyGoalMinutes}
                loading={syncProgress.active && allSessions.length === 0}
              />

              {/* 2. GitHub-Style Yearly & Monthly Activity Heatmaps */}
              <ActivityHeatmaps
                sessions={subjectScopedSessions}
                dailyGoalMinutes={settings.dailyGoalMinutes}
                now={nowDate}
              />

              {/* 3. Subject Distribution Donut + Focus Trends Over Time */}
              <section
                id="trends"
                aria-label="Subject Distribution and Focus Trends"
                className="grid grid-cols-1 xl:grid-cols-12 gap-5"
              >
                <div className="xl:col-span-4">
                  <SubjectBreakdownCard
                    items={subjectBreakdown}
                    selectedSubjectId={selectedSubjectId}
                    onSelectSubject={setSelectedSubjectId}
                  />
                </div>
                <div className="xl:col-span-8">
                  <FocusTrendsCard
                    data={trendSeries}
                    rules={settings.subjectRules}
                    granularity={trendGranularity}
                    onGranularityChange={setTrendGranularity}
                    isDark={isDark}
                  />
                </div>
              </section>

              {/* 4. Peak Focus Hours, Day-of-Week Performance & Deep Work Analysis */}
              <section
                id="rhythm"
                aria-label="Peak Hours, Day of Week, and Deep Work Analysis"
                className="grid grid-cols-1 lg:grid-cols-3 gap-5"
              >
                <PeakHoursCard analysis={hourlyAnalysis} isDark={isDark} />
                <DayOfWeekCard analysis={dowAnalysis} isDark={isDark} />
                <DurationAnalysisCard analysis={durationAnalysis} isDark={isDark} />
              </section>

              {/* 5. Searchable, Sortable Session Log & Export */}
              <SessionLogTable
                sessions={filteredSessions}
                rules={settings.subjectRules}
              />
            </>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        key={settingsOpen ? 'open' : 'closed'}
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          setSettings(next);
          if (next.subjectRules.every((r) => r.id !== selectedSubjectId)) {
            setSelectedSubjectId('all');
          }
        }}
        onTriggerFullSync={(next) => {
          void runSync('full', next, false);
        }}
        onForceFullResync={handleForceFullResync}
        onClearCache={handleClearCache}
      />

      {/* Multi-turn Gemini Focus Coach Drawer */}
      <FocusCoachDrawer
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        focusContext={focusCoachContext}
        geminiApiKey={settings.geminiApiKey}
        onOpenSettings={() => {
          setCoachOpen(false);
          setSettingsOpen(true);
        }}
      />
    </div>
  );
}
