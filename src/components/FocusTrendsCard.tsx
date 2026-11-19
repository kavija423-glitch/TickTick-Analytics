import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SubjectRule, TrendGranularity, TrendPoint } from '../types/focus';

interface FocusTrendsCardProps {
  data: TrendPoint[];
  rules: SubjectRule[];
  granularity: TrendGranularity;
  onGranularityChange: (g: TrendGranularity) => void;
  isDark: boolean;
}

interface ChartRow {
  key: string;
  label: string;
  fullLabel: string;
  totalHours: number;
  rollingAvgHours: number;
  [subjectKey: string]: string | number;
}

interface TooltipPayloadEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: ChartRow;
}

function TrendsTooltip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  granularity: TrendGranularity;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const subjectEntries = payload.filter(
    (p) => p.dataKey !== 'rollingAvgHours' && (Number(p.value) || 0) > 0
  );

  const avgLabel =
    granularity === 'daily'
      ? '7-day rolling avg'
      : granularity === 'weekly'
        ? '4-week rolling avg'
        : '3-month rolling avg';

  return (
    <div className="bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A3142] rounded-lg px-3.5 py-2.5 shadow-lg text-xs min-w-[185px]">
      <div className="font-medium text-slate-900 dark:text-slate-100 mb-2">
        {row.fullLabel}
      </div>
      <div className="space-y-1 font-mono tabular-nums">
        {subjectEntries.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="text-slate-900 dark:text-slate-100 font-medium">
              {Number(entry.value).toFixed(1)}h
            </span>
          </div>
        ))}
        <div className="pt-1.5 mt-1.5 border-t border-slate-200 dark:border-[#252C3D] flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Total</span>
          <span className="text-slate-900 dark:text-slate-100 font-semibold">
            {row.totalHours.toFixed(1)}h
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-600 dark:text-amber-400">{avgLabel}</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            {row.rollingAvgHours.toFixed(1)}h
          </span>
        </div>
      </div>
    </div>
  );
}

const GRANULARITY_OPTIONS: { id: TrendGranularity; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export function FocusTrendsCard({
  data,
  rules,
  granularity,
  onGranularityChange,
  isDark,
}: FocusTrendsCardProps) {
  const chartData: ChartRow[] = useMemo(
    () =>
      data.map((pt) => ({
        key: pt.key,
        label: pt.label,
        fullLabel: pt.fullLabel,
        totalHours: pt.totalHours,
        rollingAvgHours: pt.rollingAvgHours,
        ...pt.subjectHours,
      })),
    [data]
  );

  const activeRules = useMemo(
    () =>
      rules.filter((r) =>
        data.some((pt) => (pt.subjectHours[r.id] || 0) > 0)
      ),
    [rules, data]
  );

  const gridStroke = isDark ? '#1E2433' : '#E2E8F0';
  const axisColor = isDark ? '#94A3B8' : '#64748B';

  const rollingLabel =
    granularity === 'daily'
      ? '7-day rolling avg'
      : granularity === 'weekly'
        ? '4-week trend'
        : '3-month trend';

  return (
    <div className="h-full bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Focus Trends Over Time
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stacked hours by subject · Overlaid with {rollingLabel}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Trend granularity"
          className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#181C26] border border-slate-200 dark:border-[#232938] self-start sm:self-auto"
        >
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={granularity === opt.id}
              onClick={() => onGranularityChange(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                granularity === opt.id
                  ? 'bg-white dark:bg-[#232938] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline Legend */}
      {activeRules.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs text-slate-600 dark:text-slate-400">
          {activeRules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[2.5px] shrink-0"
                style={{ backgroundColor: r.color }}
                aria-hidden="true"
              />
              <span>{r.name}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-amber-500 rounded-full shrink-0" aria-hidden="true" />
            <span>{rollingLabel}</span>
          </span>
        </div>
      )}

      {chartData.length === 0 ? (
        <div className="flex-1 min-h-[300px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          No trend data available for this selection.
        </div>
      ) : (
        <div className="flex-1 min-h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis
                dataKey="label"
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: gridStroke }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)' }}
                content={<TrendsTooltip granularity={granularity} />}
              />
              {activeRules.map((rule, idx) => (
                <Bar
                  key={rule.id}
                  dataKey={rule.id}
                  name={rule.name}
                  stackId="focus"
                  fill={rule.color}
                  radius={idx === activeRules.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={granularity === 'daily' ? 18 : 34}
                />
              ))}
              <Line
                type="monotone"
                dataKey="rollingAvgHours"
                name={rollingLabel}
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
