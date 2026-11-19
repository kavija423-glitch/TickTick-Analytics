import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FocusSession, HeatmapDay } from '../types/focus';
import {
  computeMonthlyCalendar,
  computeYearlyHeatmap,
  formatDuration,
} from '../utils/analytics';

interface ActivityHeatmapsProps {
  sessions: FocusSession[];
  dailyGoalMinutes: number;
  now?: Date;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-slate-100 dark:bg-[#181C26] border border-slate-200/70 dark:border-[#232938]/70',
  1: 'bg-indigo-200/80 dark:bg-indigo-950/90 border border-indigo-300/50 dark:border-indigo-900/70',
  2: 'bg-indigo-400/85 dark:bg-indigo-800/90 border border-indigo-400/40 dark:border-indigo-700/70',
  3: 'bg-indigo-500 dark:bg-indigo-600 border border-indigo-500/40 dark:border-indigo-500/60',
  4: 'bg-indigo-700 dark:bg-indigo-400 border border-indigo-700/40 dark:border-indigo-300/60',
};

const MONTH_CALENDAR_LEVEL_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-slate-50/70 dark:bg-[#161A23] text-slate-500 dark:text-slate-400',
  1: 'bg-indigo-50 dark:bg-indigo-950/55 text-indigo-900 dark:text-indigo-200',
  2: 'bg-indigo-100 dark:bg-indigo-900/65 text-indigo-950 dark:text-indigo-100',
  3: 'bg-indigo-200/90 dark:bg-indigo-700/65 text-indigo-950 dark:text-white',
  4: 'bg-indigo-600 dark:bg-indigo-500 text-white',
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ActivityHeatmaps({
  sessions,
  dailyGoalMinutes,
  now = new Date(),
}: ActivityHeatmapsProps) {
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
  const [hoveredDay, setHoveredDay] = useState<HeatmapDay | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const yearlyDays = useMemo(
    () => computeYearlyHeatmap(sessions, dailyGoalMinutes, now),
    [sessions, dailyGoalMinutes, now]
  );

  // Organize 365 days into Monday-first week columns
  const { weekColumns, monthLabels, activeYearlyDays, yearlyTotalMinutes } = useMemo(() => {
    if (yearlyDays.length === 0) {
      return { weekColumns: [], monthLabels: [], activeYearlyDays: 0, yearlyTotalMinutes: 0 };
    }

    const firstDayDow = (yearlyDays[0].date.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
    const padded: (HeatmapDay | null)[] = [
      ...Array.from({ length: firstDayDow }, () => null),
      ...yearlyDays,
    ];
    while (padded.length % 7 !== 0) padded.push(null);

    const cols: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }

    const labels: { colIndex: number; label: string }[] = [];
    let lastMonth = -1;
    cols.forEach((col, colIndex) => {
      const firstReal = col.find((d) => d !== null);
      if (firstReal) {
        const m = firstReal.date.getMonth();
        if (m !== lastMonth) {
          if (labels.length > 0 && colIndex - labels[labels.length - 1].colIndex < 3) {
            labels.pop();
          }
          labels.push({
            colIndex,
            label: firstReal.date.toLocaleDateString('en-US', { month: 'short' }),
          });
          lastMonth = m;
        }
      }
    });

    let activeCount = 0;
    let totalMins = 0;
    for (const d of yearlyDays) {
      if (d.minutes > 0) activeCount += 1;
      totalMins += d.minutes;
    }

    return {
      weekColumns: cols,
      monthLabels: labels,
      activeYearlyDays: activeCount,
      yearlyTotalMinutes: totalMins,
    };
  }, [yearlyDays]);

  const monthlyCells = useMemo(
    () =>
      computeMonthlyCalendar(
        sessions,
        calendarMonth.year,
        calendarMonth.month,
        dailyGoalMinutes,
        now
      ),
    [sessions, calendarMonth, dailyGoalMinutes, now]
  );

  const monthTotalMinutes = useMemo(
    () => monthlyCells.reduce((acc, c) => acc + c.minutes, 0),
    [monthlyCells]
  );

  const monthLabel = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  );

  const shiftMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <section
      id="heatmaps"
      aria-label="Focus Activity Heatmaps"
      className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Activity Heatmap
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {view === 'yearly'
              ? `${formatDuration(yearlyTotalMinutes)} across ${activeYearlyDays} active days in the last 365 days`
              : `${monthLabel} · ${formatDuration(monthTotalMinutes)} logged`}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* View switcher */}
          <div
            role="tablist"
            aria-label="Heatmap view mode"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#181C26] border border-slate-200 dark:border-[#232938]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'yearly'}
              onClick={() => setView('yearly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'yearly'
                  ? 'bg-white dark:bg-[#232938] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Yearly Grid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'monthly'}
              onClick={() => setView('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'monthly'
                  ? 'bg-white dark:bg-[#232938] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Monthly Calendar
            </button>
          </div>
        </div>
      </div>

      {view === 'yearly' ? (
        <div>
          {/* Hover status bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-h-[20px]">
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              {hoveredDay ? (
                <span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {hoveredDay.date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {' · '}
                  {hoveredDay.minutes > 0
                    ? `${formatDuration(hoveredDay.minutes)} (${(hoveredDay.minutes / 60).toFixed(1)}h · ${hoveredDay.sessionsCount} session${hoveredDay.sessionsCount === 1 ? '' : 's'})`
                    : 'No focus sessions'}
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  Hover any day cell to inspect exact focus hours
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Less</span>
              {([0, 1, 2, 3, 4] as const).map((lvl) => (
                <span
                  key={lvl}
                  className={`inline-block w-3 h-3 rounded-[3px] ${LEVEL_CLASSES[lvl]}`}
                  aria-hidden="true"
                />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* 365-day scrollable contribution grid */}
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex flex-col min-w-[960px]">
              {/* Month label row */}
              <div className="flex items-center pl-8 mb-1.5 text-[11px] text-slate-500 dark:text-slate-400 relative h-4">
                {monthLabels.map((m) => (
                  <span
                    key={`${m.label}-${m.colIndex}`}
                    className="absolute"
                    style={{ left: `${32 + m.colIndex * 18}px` }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                {/* Weekday column */}
                <div className="flex flex-col justify-between py-[1px] w-6 text-[10px] text-slate-400 dark:text-slate-500 select-none">
                  <span>Mon</span>
                  <span>Wed</span>
                  <span>Fri</span>
                  <span>Sun</span>
                </div>

                {/* Week columns */}
                <div className="flex gap-[4px]">
                  {weekColumns.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-[4px]">
                      {col.map((day, rowIdx) => {
                        if (!day) {
                          return <div key={rowIdx} className="w-[14px] h-[14px]" />;
                        }
                        const titleStr = `${day.dateKey}: ${formatDuration(day.minutes)} (${day.sessionsCount} sessions)`;
                        return (
                          <button
                            key={day.dateKey}
                            type="button"
                            title={titleStr}
                            aria-label={titleStr}
                            onMouseEnter={() => setHoveredDay(day)}
                            onFocus={() => setHoveredDay(day)}
                            className={`w-[14px] h-[14px] rounded-[3px] transition-transform duration-100 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${LEVEL_CLASSES[day.level]}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Monthly Calendar Heatmap */
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-[#232938] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[140px] text-center">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-[#232938] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() })
              }
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Jump to current month
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_HEADERS.map((wd) => (
              <div
                key={wd}
                className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400 py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthlyCells.map((cell, idx) => {
              if (!cell.dateKey || cell.dayOfMonth === null) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="h-16 sm:h-[72px] rounded-lg bg-slate-50/40 dark:bg-[#0E1117]/60"
                  />
                );
              }
              return (
                <div
                  key={cell.dateKey}
                  title={`${cell.dateKey}: ${formatDuration(cell.minutes)} (${cell.sessionsCount} sessions)`}
                  className={`h-16 sm:h-[72px] rounded-lg p-2 flex flex-col justify-between transition-colors ${
                    MONTH_CALENDAR_LEVEL_BG[cell.level]
                  } ${
                    cell.isToday
                      ? 'ring-2 ring-indigo-500 dark:ring-indigo-400'
                      : 'border border-slate-200/70 dark:border-[#222836]/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tabular-nums font-medium">
                      {cell.dayOfMonth}
                    </span>
                    {cell.sessionsCount > 0 && (
                      <span className="text-[10px] opacity-75 font-mono tabular-nums hidden sm:inline">
                        {cell.sessionsCount}×
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono tabular-nums font-semibold truncate">
                    {cell.minutes > 0 ? formatDuration(cell.minutes) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
