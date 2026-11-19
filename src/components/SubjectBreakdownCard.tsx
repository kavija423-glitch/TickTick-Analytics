import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SubjectBreakdownItem } from '../types/focus';
import { formatDuration } from '../utils/analytics';

interface SubjectBreakdownCardProps {
  items: SubjectBreakdownItem[];
  selectedSubjectId: string;
  onSelectSubject: (subjectId: string) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: SubjectBreakdownItem }[];
}

function SubjectTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A3142] rounded-lg px-3 py-2.5 shadow-lg text-xs">
      <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: item.color }}
        />
        <span>{item.name}</span>
      </div>
      <div className="space-y-0.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
        <div>
          Total: <span className="text-slate-900 dark:text-slate-100 font-medium">{formatDuration(item.minutes)}</span> ({item.percentage}%)
        </div>
        <div>
          Sessions: {item.sessionCount} · Avg {item.avgSessionMinutes}m
        </div>
      </div>
    </div>
  );
}

export function SubjectBreakdownCard({
  items,
  selectedSubjectId,
  onSelectSubject,
}: SubjectBreakdownCardProps) {
  const totalMinutes = items.reduce((acc, i) => acc + i.minutes, 0);

  return (
    <div className="h-full bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Focus by Subject
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click a subject to filter dashboard
          </p>
        </div>
        {selectedSubjectId !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectSubject('all')}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset filter
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-12 text-xs text-slate-500 dark:text-slate-400">
          No sessions recorded for this period.
        </div>
      ) : (
        <div className="flex flex-col gap-5 flex-1">
          {/* Interactive Donut Chart */}
          <div className="relative h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="minutes"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="none"
                  onClick={(_data, index) => {
                    const entry = items[index];
                    if (entry) {
                      onSelectSubject(
                        selectedSubjectId === entry.subjectId ? 'all' : entry.subjectId
                      );
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  {items.map((entry) => (
                    <Cell
                      key={entry.subjectId}
                      fill={entry.color}
                      opacity={
                        selectedSubjectId === 'all' || selectedSubjectId === entry.subjectId
                          ? 1
                          : 0.35
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<SubjectTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                {(totalMinutes / 60).toFixed(1)}h
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {items.length} subject{items.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Paired Breakdown List */}
          <div className="space-y-3">
            {items.map((item) => {
              const isSelected = selectedSubjectId === item.subjectId;
              return (
                <button
                  key={item.subjectId}
                  type="button"
                  onClick={() =>
                    onSelectSubject(isSelected ? 'all' : item.subjectId)
                  }
                  className={`w-full text-left rounded-lg p-2 -mx-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-[#1A1F2B]'
                      : 'hover:bg-slate-50 dark:hover:bg-[#161A23]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {formatDuration(item.minutes)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 w-10 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1B202C] overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.max(2, item.percentage)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>{item.sessionCount} sessions</span>
                    <span>Avg {item.avgSessionMinutes}m</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
