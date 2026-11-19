import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HourlyAnalysis, HourlyBucket } from '../types/focus';
import { formatDuration } from '../utils/analytics';

interface PeakHoursCardProps {
  analysis: HourlyAnalysis;
  isDark: boolean;
}

function HourlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: HourlyBucket }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  return (
    <div className="bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A3142] rounded-lg px-3 py-2 shadow-lg text-xs font-mono tabular-nums">
      <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
        {bucket.label} – {String((bucket.hour + 1) % 24).padStart(2, '0')}:00
      </div>
      <div className="text-slate-600 dark:text-slate-300">
        Focus: <span className="text-indigo-600 dark:text-indigo-400 font-medium">{formatDuration(bucket.minutes)}</span>
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        {bucket.sessionsCount} session{bucket.sessionsCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}

export function PeakHoursCard({ analysis, isDark }: PeakHoursCardProps) {
  const gridStroke = isDark ? '#1E2433' : '#E2E8F0';
  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const hasData = analysis.buckets.some((b) => b.minutes > 0);

  // Reference window bounds for non-wrapping peak intervals
  const peakEndIndex = (analysis.peakStartHour + 2) % 24;
  const wrapsMidnight = peakEndIndex < analysis.peakStartHour;

  return (
    <div className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Peak Focus Hours
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
          {analysis.insightText}
        </p>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          No hourly distribution available yet.
        </div>
      ) : (
        <div className="h-[225px] w-full mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analysis.buckets} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="peakHoursFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.38} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fill: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: gridStroke }}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}m`}
              />
              <Tooltip content={<HourlyTooltip />} />
              {!wrapsMidnight && (
                <ReferenceArea
                  x1={analysis.buckets[analysis.peakStartHour]?.shortLabel}
                  x2={analysis.buckets[peakEndIndex]?.shortLabel}
                  fill="#6366F1"
                  fillOpacity={isDark ? 0.14 : 0.09}
                />
              )}
              <Area
                type="monotone"
                dataKey="minutes"
                stroke="#6366F1"
                strokeWidth={2}
                fill="url(#peakHoursFill)"
                activeDot={{ r: 4, fill: '#6366F1', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
