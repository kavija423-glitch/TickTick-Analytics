import { ArrowDownRight, ArrowUpRight, Clock, Flame, Layers, TrendingUp } from 'lucide-react';
import type { KpiMetrics } from '../types/focus';
import { formatDuration } from '../utils/analytics';

interface KpiGridProps {
  kpis: KpiMetrics;
  dailyGoalMinutes: number;
  loading?: boolean;
}

export function KpiGrid({ kpis, dailyGoalMinutes, loading = false }: KpiGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Loading metrics">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 animate-pulse"
          >
            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
            <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
            <div className="h-3 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const goalPct = Math.min(100, Math.round((kpis.todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));
  const isPositive = kpis.percentChange !== null && kpis.percentChange >= 0;

  return (
    <section aria-label="Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Total Focus Time */}
      <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Focus Time</span>
          <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
          <span className="text-2xl sm:text-[26px] font-semibold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {formatDuration(kpis.totalMinutes)}
          </span>
          {kpis.percentChange !== null && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-mono tabular-nums font-medium ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {isPositive ? '+' : ''}
              {kpis.percentChange}%
            </span>
          )}
        </div>
        <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {kpis.percentChange !== null
            ? `Prev period: ${formatDuration(kpis.previousTotalMinutes)}`
            : `${(kpis.totalMinutes / 60).toFixed(1)} hours logged`}
        </p>
      </div>

      {/* 2. Current & Longest Streak */}
      <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Current Streak</span>
          <Flame className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-[26px] font-semibold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {kpis.currentStreak}d
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            · Best {kpis.longestStreak}d
          </span>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>Goal {formatDuration(dailyGoalMinutes)}/day</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              Today {formatDuration(kpis.todayMinutes)} ({goalPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-200"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Daily Average Focus Time */}
      <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Daily Average</span>
          <TrendingUp className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-[26px] font-semibold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {formatDuration(kpis.dailyAvgActiveMinutes)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">active days</span>
        </div>
        <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          All days: {formatDuration(kpis.dailyAvgAllDaysMinutes)} · {kpis.activeDaysCount}/{kpis.totalDaysInWindow}d active
        </p>
      </div>

      {/* 4. Completed Sessions & Avg Duration */}
      <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed Sessions</span>
          <Layers className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-[26px] font-semibold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {kpis.totalSessions.toLocaleString()}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">blocks</span>
        </div>
        <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Avg session: {Math.round(kpis.avgSessionMinutes)}m
        </p>
      </div>
    </section>
  );
}
