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
import type { DurationAnalysis, DurationBucket } from '../types/focus';
import { formatDuration } from '../utils/analytics';

interface DurationAnalysisCardProps {
  analysis: DurationAnalysis;
  isDark: boolean;
}

function DurationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DurationBucket }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  return (
    <div className="bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A3142] rounded-lg px-3 py-2 shadow-lg text-xs font-mono tabular-nums">
      <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
        {bucket.label} {bucket.isDeepWork ? '· Deep Work' : '· Short Block'}
      </div>
      <div className="text-slate-600 dark:text-slate-300">
        Sessions: <span className="text-slate-900 dark:text-slate-100 font-medium">{bucket.count}</span>
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        Total time: {formatDuration(bucket.totalMinutes)}
      </div>
    </div>
  );
}

export function DurationAnalysisCard({ analysis, isDark }: DurationAnalysisCardProps) {
  const gridStroke = isDark ? '#1E2433' : '#E2E8F0';
  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const hasData = analysis.buckets.some((b) => b.count > 0);

  return (
    <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Session Duration & Deep Work
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {analysis.deepWorkSessions} deep sessions (≥45m) · Max {analysis.longestSessionMinutes}m
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {analysis.deepWorkRatio}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Deep Work Ratio</div>
        </div>
      </div>

      {/* Deep Work proportion bar */}
      <div className="mb-4">
        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1B202C] overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${Math.min(100, analysis.deepWorkRatio)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] bg-slate-400 dark:bg-slate-600" aria-hidden="true" />
            Short (&lt;45m)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] bg-emerald-500" aria-hidden="true" />
            Deep Work (≥45m)
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          No session durations to analyze yet.
        </div>
      ) : (
        <div className="h-[185px] w-full mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analysis.buckets} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis
                dataKey="label"
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: gridStroke }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)' }}
                content={<DurationTooltip />}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {analysis.buckets.map((bucket) => (
                  <Cell
                    key={bucket.id}
                    fill={bucket.isDeepWork ? '#10B981' : isDark ? '#475569' : '#94A3B8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
