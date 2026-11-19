import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayOfWeekAnalysis, DayOfWeekStat } from '../types/focus';

interface DayOfWeekCardProps {
  analysis: DayOfWeekAnalysis;
  isDark: boolean;
}

function DowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DayOfWeekStat }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const stat = payload[0].payload;
  return (
    <div className="bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A3142] rounded-lg px-3 py-2 shadow-lg text-xs font-mono tabular-nums">
      <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">{stat.label}</div>
      <div className="text-slate-600 dark:text-slate-300">
        Avg: <span className="text-slate-900 dark:text-slate-100 font-medium">{stat.avgHours.toFixed(1)}h</span> / active day
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        Total: {stat.totalHours.toFixed(1)}h · {stat.sessionsCount} sessions
      </div>
    </div>
  );
}

export function DayOfWeekCard({ analysis, isDark }: DayOfWeekCardProps) {
  const gridStroke = isDark ? '#1E2433' : '#E2E8F0';
  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const hasData = analysis.stats.some((s) => s.activeDays > 0);

  return (
    <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Day-of-Week Performance
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
          {analysis.strongestDay && analysis.weakestDay
            ? `Strongest: ${analysis.strongestDay.shortLabel} (${analysis.strongestDay.avgHours.toFixed(1)}h) · Weakest: ${analysis.weakestDay.shortLabel} (${analysis.weakestDay.avgHours.toFixed(1)}h)`
            : 'Average focus hours across Monday–Sunday'}
        </p>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          No weekday data available yet.
        </div>
      ) : (
        <div className="h-[225px] w-full mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analysis.stats} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: gridStroke }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)' }}
                content={<DowTooltip />}
              />
              <Bar dataKey="avgHours" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {analysis.stats.map((entry) => {
                  const isStrongest = analysis.strongestDay?.dayIndex === entry.dayIndex;
                  const isWeakest =
                    analysis.weakestDay?.dayIndex === entry.dayIndex &&
                    analysis.strongestDay?.dayIndex !== entry.dayIndex;
                  const fill = isStrongest
                    ? '#10B981'
                    : isWeakest
                      ? isDark
                        ? '#475569'
                        : '#94A3B8'
                      : '#06B6D4';
                  return <Cell key={entry.shortLabel} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
