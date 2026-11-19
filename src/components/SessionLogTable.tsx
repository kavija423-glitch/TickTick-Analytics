import { useMemo, useState } from 'react';
import { ArrowUpDown, Download, FileJson, Search } from 'lucide-react';
import type { FocusSession, SubjectRule } from '../types/focus';
import {
  formatDuration,
  pad2,
  sessionsToCSV,
  sessionsToJSON,
  toLocalDateKey,
} from '../utils/analytics';

interface SessionLogTableProps {
  sessions: FocusSession[];
  rules: SubjectRule[];
}

type SortField = 'date' | 'duration' | 'mode' | 'subject' | 'title';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 12;

export function SessionLogTable({ sessions, rules }: SessionLogTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const ruleMap = useMemo(() => {
    const map: Record<string, SubjectRule> = {};
    for (const r of rules) map[r.id] = r;
    return map;
  }, [rules]);

  const subjectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rules) map[r.id] = r.name;
    return map;
  }, [rules]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? sessions.filter((s) => {
          const subjectName = (ruleMap[s.subjectId]?.name || 'General').toLowerCase();
          const modeLabel = (s.timerMode || 'Pomodoro').toLowerCase();
          return (
            s.title.toLowerCase().includes(q) ||
            s.note.toLowerCase().includes(q) ||
            subjectName.includes(q) ||
            modeLabel.includes(q) ||
            (s.projectName || '').toLowerCase().includes(q) ||
            toLocalDateKey(new Date(s.startTime)).includes(q)
          );
        })
      : [...sessions];

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      } else if (sortField === 'duration') {
        cmp = a.durationMinutes - b.durationMinutes;
      } else if (sortField === 'mode') {
        cmp = (a.timerMode || 'Pomodoro').localeCompare(b.timerMode || 'Pomodoro');
      } else if (sortField === 'subject') {
        const sa = ruleMap[a.subjectId]?.name || 'General';
        const sb = ruleMap[b.subjectId]?.name || 'General';
        cmp = sa.localeCompare(sb);
      } else {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [sessions, search, sortField, sortDir, ruleMap]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredAndSorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' || field === 'duration' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = sessionsToCSV(filteredAndSorted, subjectNameById);
    const stamp = toLocalDateKey(new Date());
    triggerDownload(csv, `cadence-focus-sessions-${stamp}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportJson = () => {
    const json = sessionsToJSON(filteredAndSorted, subjectNameById);
    const stamp = toLocalDateKey(new Date());
    triggerDownload(json, `cadence-focus-sessions-${stamp}.json`, 'application/json');
  };

  return (
    <section
      id="sessions"
      aria-label="Session Log and Export"
      className="bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#1E2330] rounded-xl p-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Session Log
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            Showing {filteredAndSorted.length.toLocaleString()} session{filteredAndSorted.length === 1 ? '' : 's'}
            {search.trim() ? ` matching "${search.trim()}"` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="session-search" className="sr-only">
              Search sessions
            </label>
            <input
              id="session-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search task, subject, Pomodoro, Stopwatch…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#171B24] border border-slate-200 dark:border-[#242B3A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredAndSorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] bg-white dark:bg-[#171B24] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E2432] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredAndSorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#242B3A] bg-white dark:bg-[#171B24] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E2432] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Responsive Data Table */}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-left border-collapse min-w-[680px]">
          <thead>
            <tr className="border-y border-slate-200 dark:border-[#1E2330] text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={() => toggleSort('date')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Date & Time
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </th>
              <th className="py-2.5 px-3 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort('duration')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Duration
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </th>
              <th className="py-2.5 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('mode')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Mode
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </th>
              <th className="py-2.5 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('subject')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Subject
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </th>
              <th className="py-2.5 pl-3">
                <button
                  type="button"
                  onClick={() => toggleSort('title')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Task / Note
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1A1F2B] text-xs">
            {pageItems.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-10 text-center text-slate-500 dark:text-slate-400"
                >
                  No focus sessions match your current filters.
                </td>
              </tr>
            ) : (
              pageItems.map((session) => {
                const start = new Date(session.startTime);
                const end = new Date(session.endTime);
                const dateStr = start.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const timeRange = `${pad2(start.getHours())}:${pad2(start.getMinutes())} – ${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
                const rule = ruleMap[session.subjectId];
                const subjectName = rule?.name || 'General';
                const subjectColor = rule?.color || '#94A3B8';
                const timerMode = session.timerMode || 'Pomodoro';

                return (
                  <tr
                    key={session.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#161A23] transition-colors"
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap font-mono tabular-nums">
                      <div className="text-slate-900 dark:text-slate-100 font-medium">
                        {dateStr}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {timeRange}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono tabular-nums">
                      <span
                        className={`font-medium ${
                          session.durationMinutes >= 45
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {formatDuration(session.durationMinutes)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                      {timerMode}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium">
                        <span
                          className="w-2 h-2 rounded-[2px] shrink-0"
                          style={{ backgroundColor: subjectColor }}
                          aria-hidden="true"
                        />
                        {subjectName}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 max-w-[360px]">
                      <div className="text-slate-900 dark:text-slate-100 font-medium truncate">
                        {session.title}
                      </div>
                      {session.note && session.note !== session.title && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {session.note}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-[#1E2330] text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1B202C] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#242B3A] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1B202C] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
