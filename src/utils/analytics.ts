import type {
  DayOfWeekAnalysis,
  DayOfWeekStat,
  DurationAnalysis,
  DurationBucket,
  FocusSession,
  HeatmapDay,
  HourlyAnalysis,
  HourlyBucket,
  KpiMetrics,
  MonthlyCalendarCell,
  SubjectBreakdownItem,
  SubjectRule,
  TimeframePreset,
  TrendGranularity,
  TrendPoint,
} from '../types/focus';

const MS_PER_DAY = 86_400_000;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date into local YYYY-MM-DD using the runtime's local timezone
 * (e.g. Asia/Colombo +05:30 or any local browser timezone).
 */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addLocalDays(date: Date, deltaDays: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
  return d;
}

export function formatDuration(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h 0m`;
  return `${hours}h ${mins}m`;
}

export function formatHoursDecimal(totalMinutes: number, decimals = 1): string {
  return `${(totalMinutes / 60).toFixed(decimals)}h`;
}

export function formatHour12(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return '12:00 AM';
  if (normalized === 12) return '12:00 PM';
  if (normalized < 12) return `${normalized}:00 AM`;
  return `${normalized - 12}:00 PM`;
}

export function formatHourShort(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return '12a';
  if (normalized === 12) return '12p';
  return normalized < 12 ? `${normalized}a` : `${normalized - 12}p`;
}

export function formatRelativeSyncTime(isoTimestamp: string | null, now: Date = new Date()): string {
  if (!isoTimestamp) return 'Never synced';
  const ts = new Date(isoTimestamp).getTime();
  if (Number.isNaN(ts)) return 'Never synced';
  const diffSec = Math.max(0, Math.floor((now.getTime() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export interface DateChunk {
  from: string; // ISO string
  to: string; // ISO string
  label: string;
}

/**
 * Splits any [fromDate, toDate] window into sequential chunks of at most `maxDays` days
 * so TickTick's 30-day API range restriction is always respected.
 */
export function buildDateChunks(
  fromDate: Date,
  toDate: Date,
  maxDays = 30
): DateChunk[] {
  const safeMax = Math.max(1, Math.min(30, Math.floor(maxDays)));
  const startMs = fromDate.getTime();
  const endMs = toDate.getTime();
  if (startMs >= endMs) return [];

  const chunks: DateChunk[] = [];
  let cursor = new Date(startMs);
  const maxSpanMs = safeMax * MS_PER_DAY - 1000; // Strictly <= maxDays

  while (cursor.getTime() < endMs) {
    const nextEndMs = Math.min(endMs, cursor.getTime() + maxSpanMs);
    const chunkEnd = new Date(nextEndMs);
    const label = `${cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${chunkEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    chunks.push({
      from: cursor.toISOString(),
      to: chunkEnd.toISOString(),
      label,
    });
    if (nextEndMs >= endMs) break;
    cursor = new Date(nextEndMs + 1000);
  }

  return chunks;
}

/**
 * Merges and deduplicates focus sessions by `id`. Incoming records overwrite cached entries
 * with the same ID, and the result is sorted by startTime descending.
 */
export function mergeAndDeduplicateSessions(
  existing: FocusSession[],
  incoming: FocusSession[]
): FocusSession[] {
  const map = new Map<string, FocusSession>();
  for (const s of existing) {
    map.set(s.id, s);
  }
  for (const s of incoming) {
    map.set(s.id, s);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

/**
 * Resolves a FocusSession's subjectId based on custom SubjectRules and optional TickTick project names.
 * Priority: exact project name match -> tag match -> title/note keyword match -> default rule.
 */
export function resolveSessionSubject(
  session: Pick<FocusSession, 'title' | 'note' | 'projectId' | 'projectName' | 'tags'>,
  rules: SubjectRule[],
  projectNameById: Record<string, string> = {}
): string {
  const fallbackRule = rules.find((r) => r.isDefault) || rules[rules.length - 1];
  const fallbackId = fallbackRule ? fallbackRule.id : 'general';

  const resolvedProjectName = (
    session.projectName ||
    (session.projectId ? projectNameById[session.projectId] : '') ||
    ''
  )
    .trim()
    .toLowerCase();

  const normalizedTags = (session.tags || []).map((t) => t.trim().toLowerCase());
  const haystack = `${session.title || ''} ${session.note || ''}`.toLowerCase();

  const specificRules = rules.filter((r) => !r.isDefault);

  // 1. Project name match
  if (resolvedProjectName) {
    for (const rule of specificRules) {
      if (
        rule.projectNames.some(
          (pn) => pn.trim().toLowerCase() === resolvedProjectName ||
            (pn.trim().length > 0 && resolvedProjectName.includes(pn.trim().toLowerCase()))
        )
      ) {
        return rule.id;
      }
    }
  }

  // 2. Tag match
  if (normalizedTags.length > 0) {
    for (const rule of specificRules) {
      const ruleTags = rule.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (ruleTags.some((rt) => normalizedTags.includes(rt))) {
        return rule.id;
      }
    }
  }

  // 3. Title/Note keyword match
  for (const rule of specificRules) {
    if (
      rule.keywords.some((kw) => {
        const clean = kw.trim().toLowerCase();
        return clean.length > 0 && haystack.includes(clean);
      })
    ) {
      return rule.id;
    }
  }

  return fallbackId;
}

export function applySubjectRules(
  sessions: FocusSession[],
  rules: SubjectRule[],
  projectNameById: Record<string, string> = {}
): FocusSession[] {
  return sessions.map((s) => ({
    ...s,
    projectName: s.projectName || (s.projectId ? projectNameById[s.projectId] : undefined),
    subjectId: resolveSessionSubject(s, rules, projectNameById),
  }));
}

export interface TimeframeBounds {
  start: Date | null; // null means unbounded (all_time)
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  totalDays: number;
}

export function getTimeframeBounds(
  preset: TimeframePreset,
  now: Date = new Date(),
  earliestSessionDate?: Date | null
): TimeframeBounds {
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  switch (preset) {
    case 'today': {
      const prevStart = addLocalDays(todayStart, -1);
      const prevEnd = endOfLocalDay(prevStart);
      return { start: todayStart, end: todayEnd, prevStart, prevEnd, totalDays: 1 };
    }
    case 'this_week': {
      // Monday as start of week
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const weekStart = addLocalDays(todayStart, -diffToMonday);
      const daysElapsed = diffToMonday + 1;
      const prevStart = addLocalDays(weekStart, -7);
      const prevEnd = endOfLocalDay(addLocalDays(prevStart, daysElapsed - 1));
      return { start: weekStart, end: todayEnd, prevStart, prevEnd, totalDays: daysElapsed };
    }
    case 'this_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const daysElapsed = now.getDate();
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const prevEnd = endOfLocalDay(
        new Date(
          prevMonthStart.getFullYear(),
          prevMonthStart.getMonth(),
          Math.min(daysElapsed, prevMonthLastDay)
        )
      );
      return { start: monthStart, end: todayEnd, prevStart: prevMonthStart, prevEnd, totalDays: daysElapsed };
    }
    case 'last_90_days': {
      const start = addLocalDays(todayStart, -89);
      const prevEnd = endOfLocalDay(addLocalDays(start, -1));
      const prevStart = addLocalDays(start, -90);
      return { start, end: todayEnd, prevStart, prevEnd, totalDays: 90 };
    }
    case 'this_year': {
      const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const daysElapsed = Math.floor((todayStart.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1;
      const prevYearStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const prevEnd = endOfLocalDay(addLocalDays(prevYearStart, daysElapsed - 1));
      return { start: yearStart, end: todayEnd, prevStart: prevYearStart, prevEnd, totalDays: daysElapsed };
    }
    case 'all_time': {
      const startRef = earliestSessionDate ? startOfLocalDay(earliestSessionDate) : todayStart;
      const totalDays = Math.max(
        1,
        Math.floor((todayStart.getTime() - startRef.getTime()) / MS_PER_DAY) + 1
      );
      return { start: null, end: todayEnd, prevStart: null, prevEnd: null, totalDays };
    }
  }
}

export function filterSessionsByRange(
  sessions: FocusSession[],
  start: Date | null,
  end: Date | null
): FocusSession[] {
  const startMs = start ? start.getTime() : -Infinity;
  const endMs = end ? end.getTime() : Infinity;
  return sessions.filter((s) => {
    const t = new Date(s.startTime).getTime();
    return t >= startMs && t <= endMs;
  });
}

export function computeStreaks(
  sessions: FocusSession[],
  dailyGoalMinutes: number,
  now: Date = new Date()
): { currentStreak: number; longestStreak: number; todayMinutes: number } {
  const goal = Math.max(1, dailyGoalMinutes);
  const byDay = new Map<string, number>();

  for (const s of sessions) {
    const key = toLocalDateKey(new Date(s.startTime));
    byDay.set(key, (byDay.get(key) || 0) + s.durationMinutes);
  }

  const todayKey = toLocalDateKey(now);
  const todayMinutes = byDay.get(todayKey) || 0;

  // Compute current streak: if today meets goal, count backwards from today;
  // otherwise allow counting backwards from yesterday (streak still active for today).
  let currentStreak = 0;
  let cursor = startOfLocalDay(now);
  if ((byDay.get(toLocalDateKey(cursor)) || 0) < goal) {
    cursor = addLocalDays(cursor, -1);
  }
  while ((byDay.get(toLocalDateKey(cursor)) || 0) >= goal) {
    currentStreak += 1;
    cursor = addLocalDays(cursor, -1);
  }

  // Compute longest streak across all recorded dates
  const qualifyingDates = Array.from(byDay.entries())
    .filter(([, mins]) => mins >= goal)
    .map(([key]) => key)
    .sort();

  let longestStreak = 0;
  let running = 0;
  let prevDate: Date | null = null;

  for (const key of qualifyingDates) {
    const d = parseLocalDateKey(key);
    if (prevDate) {
      const expectedNext = addLocalDays(prevDate, 1);
      if (toLocalDateKey(expectedNext) === key) {
        running += 1;
      } else {
        running = 1;
      }
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevDate = d;
  }

  return { currentStreak, longestStreak, todayMinutes };
}

export function computeKpis(
  currentSessions: FocusSession[],
  previousSessions: FocusSession[],
  allSubjectSessions: FocusSession[],
  totalDaysInWindow: number,
  dailyGoalMinutes: number,
  hasPreviousWindow: boolean,
  now: Date = new Date()
): KpiMetrics {
  const totalMinutes = currentSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const previousTotalMinutes = previousSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  let percentChange: number | null = null;
  if (hasPreviousWindow && previousTotalMinutes > 0) {
    percentChange = Math.round(((totalMinutes - previousTotalMinutes) / previousTotalMinutes) * 1000) / 10;
  } else if (hasPreviousWindow && totalMinutes > 0 && previousTotalMinutes === 0) {
    percentChange = 100;
  }

  const activeDaysSet = new Set<string>();
  for (const s of currentSessions) {
    activeDaysSet.add(toLocalDateKey(new Date(s.startTime)));
  }

  const activeDaysCount = activeDaysSet.size;
  const safeTotalDays = Math.max(1, totalDaysInWindow);
  const dailyAvgActiveMinutes = activeDaysCount > 0 ? totalMinutes / activeDaysCount : 0;
  const dailyAvgAllDaysMinutes = totalMinutes / safeTotalDays;

  const totalSessions = currentSessions.length;
  const avgSessionMinutes = totalSessions > 0 ? totalMinutes / totalSessions : 0;

  const { currentStreak, longestStreak, todayMinutes } = computeStreaks(
    allSubjectSessions,
    dailyGoalMinutes,
    now
  );

  return {
    totalMinutes,
    previousTotalMinutes,
    percentChange,
    currentStreak,
    longestStreak,
    todayMinutes,
    dailyAvgActiveMinutes,
    dailyAvgAllDaysMinutes,
    activeDaysCount,
    totalDaysInWindow: safeTotalDays,
    totalSessions,
    avgSessionMinutes,
  };
}

export function getHeatmapIntensityLevel(minutes: number, goalMinutes = 120): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  const ratio = minutes / Math.max(30, goalMinutes);
  if (ratio < 0.5) return 1;
  if (ratio < 1.0) return 2;
  if (ratio < 1.75) return 3;
  return 4;
}

/**
 * Generates a 365-day array ending on `now` for the GitHub-style yearly contribution grid.
 */
export function computeYearlyHeatmap(
  sessions: FocusSession[],
  dailyGoalMinutes = 120,
  now: Date = new Date()
): HeatmapDay[] {
  const byDay = new Map<string, { minutes: number; count: number }>();
  for (const s of sessions) {
    const key = toLocalDateKey(new Date(s.startTime));
    const entry = byDay.get(key) || { minutes: 0, count: 0 };
    entry.minutes += s.durationMinutes;
    entry.count += 1;
    byDay.set(key, entry);
  }

  const today = startOfLocalDay(now);
  const start = addLocalDays(today, -364);
  const days: HeatmapDay[] = [];

  for (let i = 0; i < 365; i++) {
    const d = addLocalDays(start, i);
    const key = toLocalDateKey(d);
    const entry = byDay.get(key);
    const minutes = entry ? entry.minutes : 0;
    days.push({
      dateKey: key,
      date: d,
      minutes,
      sessionsCount: entry ? entry.count : 0,
      level: getHeatmapIntensityLevel(minutes, dailyGoalMinutes),
    });
  }

  return days;
}

/**
 * Generates a Monday-first calendar grid for a specific year & monthIndex (0..11).
 */
export function computeMonthlyCalendar(
  sessions: FocusSession[],
  year: number,
  monthIndex: number,
  dailyGoalMinutes = 120,
  now: Date = new Date()
): MonthlyCalendarCell[] {
  const byDay = new Map<string, { minutes: number; count: number }>();
  for (const s of sessions) {
    const d = new Date(s.startTime);
    if (d.getFullYear() === year && d.getMonth() === monthIndex) {
      const key = toLocalDateKey(d);
      const entry = byDay.get(key) || { minutes: 0, count: 0 };
      entry.minutes += s.durationMinutes;
      entry.count += 1;
      byDay.set(key, entry);
    }
  }

  const todayKey = toLocalDateKey(now);
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-first leading blanks
  const leadingBlanks = (firstDay.getDay() + 6) % 7;

  const cells: MonthlyCalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({
      dateKey: null,
      dayOfMonth: null,
      minutes: 0,
      sessionsCount: 0,
      level: 0,
      isToday: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    const key = toLocalDateKey(d);
    const entry = byDay.get(key);
    const minutes = entry ? entry.minutes : 0;
    cells.push({
      dateKey: key,
      dayOfMonth: day,
      minutes,
      sessionsCount: entry ? entry.count : 0,
      level: getHeatmapIntensityLevel(minutes, dailyGoalMinutes),
      isToday: key === todayKey,
    });
  }

  // Pad trailing cells to complete final week row
  while (cells.length % 7 !== 0) {
    cells.push({
      dateKey: null,
      dayOfMonth: null,
      minutes: 0,
      sessionsCount: 0,
      level: 0,
      isToday: false,
    });
  }

  return cells;
}

export function computeSubjectBreakdown(
  sessions: FocusSession[],
  rules: SubjectRule[]
): SubjectBreakdownItem[] {
  const totalMinutes = sessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const accMap = new Map<string, { minutes: number; count: number }>();

  for (const s of sessions) {
    const entry = accMap.get(s.subjectId) || { minutes: 0, count: 0 };
    entry.minutes += s.durationMinutes;
    entry.count += 1;
    accMap.set(s.subjectId, entry);
  }

  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const items: SubjectBreakdownItem[] = [];

  for (const [subjectId, stats] of accMap.entries()) {
    const rule = ruleMap.get(subjectId);
    items.push({
      subjectId,
      name: rule?.name || 'General',
      color: rule?.color || '#94A3B8',
      minutes: stats.minutes,
      hours: Math.round((stats.minutes / 60) * 100) / 100,
      percentage: totalMinutes > 0 ? Math.round((stats.minutes / totalMinutes) * 1000) / 10 : 0,
      sessionCount: stats.count,
      avgSessionMinutes: stats.count > 0 ? Math.round(stats.minutes / stats.count) : 0,
    });
  }

  return items.sort((a, b) => b.minutes - a.minutes);
}

function getMondayOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return addLocalDays(startOfLocalDay(date), -diff);
}

/**
 * Computes stacked subject hours per bucket (daily, weekly, monthly) plus a
 * true 7-day rolling average daily hours trend overlay.
 */
export function computeTrendSeries(
  sessions: FocusSession[],
  granularity: TrendGranularity,
  rules: SubjectRule[],
  now: Date = new Date()
): TrendPoint[] {
  if (sessions.length === 0) return [];

  const subjectIds = rules.map((r) => r.id);
  const sortedDates = sessions
    .map((s) => startOfLocalDay(new Date(s.startTime)))
    .sort((a, b) => a.getTime() - b.getTime());

  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1] > startOfLocalDay(now)
    ? sortedDates[sortedDates.length - 1]
    : startOfLocalDay(now);

  // Build daily map first so 7-day rolling average is always mathematically accurate
  const dailyTotals = new Map<string, number>();
  const dailyBySubject = new Map<string, Record<string, number>>();

  for (const s of sessions) {
    const key = toLocalDateKey(new Date(s.startTime));
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + s.durationMinutes / 60);
    const subjRecord = dailyBySubject.get(key) || {};
    subjRecord[s.subjectId] = (subjRecord[s.subjectId] || 0) + s.durationMinutes / 60;
    dailyBySubject.set(key, subjRecord);
  }

  const get7DayRollingAvgAt = (targetDay: Date): number => {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const k = toLocalDateKey(addLocalDays(targetDay, -i));
      sum += dailyTotals.get(k) || 0;
    }
    return Math.round((sum / 7) * 100) / 100;
  };

  if (granularity === 'daily') {
    const totalDays = Math.floor((maxDate.getTime() - minDate.getTime()) / MS_PER_DAY) + 1;
    // Cap daily series to at most 90 recent days if all-time has 365+ days, so bars stay legible
    const effectiveStart = totalDays > 90 ? addLocalDays(maxDate, -89) : minDate;
    const points: TrendPoint[] = [];
    let cursor = effectiveStart;
    while (cursor.getTime() <= maxDate.getTime()) {
      const key = toLocalDateKey(cursor);
      const subjRaw = dailyBySubject.get(key) || {};
      const subjectHours: Record<string, number> = {};
      for (const sid of subjectIds) {
        subjectHours[sid] = Math.round((subjRaw[sid] || 0) * 100) / 100;
      }
      const totalHours = Math.round((dailyTotals.get(key) || 0) * 100) / 100;
      points.push({
        key,
        label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullLabel: cursor.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        totalHours,
        rollingAvgHours: get7DayRollingAvgAt(cursor),
        subjectHours,
      });
      cursor = addLocalDays(cursor, 1);
    }
    return points;
  }

  if (granularity === 'weekly') {
    const startWeek = getMondayOfWeek(minDate);
    const endWeek = getMondayOfWeek(maxDate);
    const points: TrendPoint[] = [];
    let cursor = startWeek;

    while (cursor.getTime() <= endWeek.getTime()) {
      const weekKey = toLocalDateKey(cursor);
      const subjectHours: Record<string, number> = {};
      for (const sid of subjectIds) subjectHours[sid] = 0;
      let totalHours = 0;

      for (let d = 0; d < 7; d++) {
        const dayKey = toLocalDateKey(addLocalDays(cursor, d));
        totalHours += dailyTotals.get(dayKey) || 0;
        const subjRaw = dailyBySubject.get(dayKey) || {};
        for (const sid of subjectIds) {
          subjectHours[sid] += subjRaw[sid] || 0;
        }
      }

      for (const sid of subjectIds) {
        subjectHours[sid] = Math.round(subjectHours[sid] * 100) / 100;
      }

      const weekEnd = addLocalDays(cursor, 6);
      const rollingRefDay = weekEnd > maxDate ? maxDate : weekEnd;
      points.push({
        key: weekKey,
        label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullLabel: `Week of ${cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        totalHours: Math.round(totalHours * 100) / 100,
        // Weekly 7-day rolling total equivalent (daily rolling avg * 7) so it overlays on the weekly Y-axis
        rollingAvgHours: Math.round(get7DayRollingAvgAt(rollingRefDay) * 7 * 100) / 100,
        subjectHours,
      });

      cursor = addLocalDays(cursor, 7);
    }

    // Smooth weekly trend line using trailing 4-week rolling average if multiple weeks exist
    return points.map((pt, idx) => {
      const windowStart = Math.max(0, idx - 3);
      const slice = points.slice(windowStart, idx + 1);
      const avg = slice.reduce((acc, p) => acc + p.totalHours, 0) / slice.length;
      return {
        ...pt,
        rollingAvgHours: Math.round(avg * 100) / 100,
      };
    });
  }

  // Monthly
  const monthsMap = new Map<string, { year: number; month: number; total: number; subj: Record<string, number> }>();
  let y = minDate.getFullYear();
  let m = minDate.getMonth();
  const endY = maxDate.getFullYear();
  const endM = maxDate.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${pad2(m + 1)}`;
    const subj: Record<string, number> = {};
    for (const sid of subjectIds) subj[sid] = 0;
    monthsMap.set(key, { year: y, month: m, total: 0, subj });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  for (const s of sessions) {
    const d = new Date(s.startTime);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const entry = monthsMap.get(key);
    if (!entry) continue;
    const hrs = s.durationMinutes / 60;
    entry.total += hrs;
    entry.subj[s.subjectId] = (entry.subj[s.subjectId] || 0) + hrs;
  }

  const monthlyList = Array.from(monthsMap.entries()).map(([key, entry]) => {
    const labelDate = new Date(entry.year, entry.month, 1);
    const subjectHours: Record<string, number> = {};
    for (const sid of subjectIds) {
      subjectHours[sid] = Math.round((entry.subj[sid] || 0) * 100) / 100;
    }
    return {
      key,
      label: labelDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      fullLabel: labelDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalHours: Math.round(entry.total * 100) / 100,
      rollingAvgHours: 0,
      subjectHours,
    };
  });

  return monthlyList.map((pt, idx) => {
    const windowStart = Math.max(0, idx - 2);
    const slice = monthlyList.slice(windowStart, idx + 1);
    const avg = slice.reduce((acc, p) => acc + p.totalHours, 0) / slice.length;
    return {
      ...pt,
      rollingAvgHours: Math.round(avg * 100) / 100,
    };
  });
}

/**
 * 24-hour distribution (00:00-23:00) in local timezone + automated 3-hour peak productivity window insight.
 */
export function computeHourlyDistribution(sessions: FocusSession[]): HourlyAnalysis {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${pad2(hour)}:00`,
    shortLabel: formatHourShort(hour),
    minutes: 0,
    hours: 0,
    sessionsCount: 0,
  }));

  for (const s of sessions) {
    const start = new Date(s.startTime);
    const hour = start.getHours();
    buckets[hour].minutes += s.durationMinutes;
    buckets[hour].sessionsCount += 1;
  }

  for (const b of buckets) {
    b.hours = Math.round((b.minutes / 60) * 100) / 100;
  }

  let bestStart = 20;
  let bestSum = -1;
  for (let start = 0; start < 24; start++) {
    const sum =
      buckets[start].minutes +
      buckets[(start + 1) % 24].minutes +
      buckets[(start + 2) % 24].minutes;
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }

  const peakEndHour = (bestStart + 3) % 24;
  const peakWindowLabel = `${formatHour12(bestStart)} – ${formatHour12(peakEndHour)}`;
  const totalMins = buckets.reduce((acc, b) => acc + b.minutes, 0);
  const share = totalMins > 0 ? Math.round((bestSum / totalMins) * 100) : 0;

  const insightText =
    totalMins > 0
      ? `Your peak focus window is ${peakWindowLabel} (${share}% of total focus time).`
      : 'Complete focus sessions to discover your peak productivity hours.';

  return {
    buckets,
    peakStartHour: bestStart,
    peakEndHour,
    peakWindowLabel,
    peakWindowMinutes: bestSum > 0 ? bestSum : 0,
    insightText,
  };
}

const DOW_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Day-of-week performance comparing average focus hours across Monday-Sunday.
 */
export function computeDayOfWeekStats(sessions: FocusSession[]): DayOfWeekAnalysis {
  const dayTotals = Array.from({ length: 7 }, () => ({
    totalMinutes: 0,
    sessionsCount: 0,
    distinctDates: new Set<string>(),
  }));

  for (const s of sessions) {
    const d = new Date(s.startTime);
    const dow = (d.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
    dayTotals[dow].totalMinutes += s.durationMinutes;
    dayTotals[dow].sessionsCount += 1;
    dayTotals[dow].distinctDates.add(toLocalDateKey(d));
  }

  const stats: DayOfWeekStat[] = dayTotals.map((entry, idx) => {
    const activeDays = entry.distinctDates.size;
    const totalHours = Math.round((entry.totalMinutes / 60) * 100) / 100;
    const avgHours = activeDays > 0 ? Math.round((entry.totalMinutes / 60 / activeDays) * 100) / 100 : 0;
    return {
      dayIndex: idx,
      label: DOW_LABELS[idx],
      shortLabel: DOW_SHORT[idx],
      avgHours,
      totalHours,
      activeDays,
      sessionsCount: entry.sessionsCount,
    };
  });

  const nonZero = stats.filter((s) => s.activeDays > 0);
  if (nonZero.length === 0) {
    return { stats, strongestDay: null, weakestDay: null };
  }

  const sorted = [...nonZero].sort((a, b) => b.avgHours - a.avgHours);
  return {
    stats,
    strongestDay: sorted[0],
    weakestDay: sorted[sorted.length - 1],
  };
}

/**
 * Session duration histogram (<25m, 25-45m, 45-60m, 60-90m, 90m+) + Deep Work Ratio (>= 45m).
 */
export function computeDurationAnalysis(sessions: FocusSession[]): DurationAnalysis {
  const buckets: DurationBucket[] = [
    { id: 'under_25', label: '<25m', minMinutes: 0, maxMinutes: 25, count: 0, totalMinutes: 0, isDeepWork: false },
    { id: '25_45', label: '25–45m', minMinutes: 25, maxMinutes: 45, count: 0, totalMinutes: 0, isDeepWork: false },
    { id: '45_60', label: '45–60m', minMinutes: 45, maxMinutes: 60, count: 0, totalMinutes: 0, isDeepWork: true },
    { id: '60_90', label: '60–90m', minMinutes: 60, maxMinutes: 90, count: 0, totalMinutes: 0, isDeepWork: true },
    { id: '90_plus', label: '90m+', minMinutes: 90, maxMinutes: null, count: 0, totalMinutes: 0, isDeepWork: true },
  ];

  let totalMinutes = 0;
  let deepWorkMinutes = 0;
  let deepWorkSessions = 0;
  let longestSessionMinutes = 0;

  for (const s of sessions) {
    const mins = s.durationMinutes;
    totalMinutes += mins;
    if (mins > longestSessionMinutes) longestSessionMinutes = mins;
    if (mins >= 45) {
      deepWorkMinutes += mins;
      deepWorkSessions += 1;
    }

    if (mins < 25) {
      buckets[0].count += 1;
      buckets[0].totalMinutes += mins;
    } else if (mins < 45) {
      buckets[1].count += 1;
      buckets[1].totalMinutes += mins;
    } else if (mins < 60) {
      buckets[2].count += 1;
      buckets[2].totalMinutes += mins;
    } else if (mins < 90) {
      buckets[3].count += 1;
      buckets[3].totalMinutes += mins;
    } else {
      buckets[4].count += 1;
      buckets[4].totalMinutes += mins;
    }
  }

  const deepWorkRatio =
    totalMinutes > 0 ? Math.round((deepWorkMinutes / totalMinutes) * 1000) / 10 : 0;

  return {
    buckets,
    deepWorkMinutes,
    deepWorkSessions,
    deepWorkRatio,
    longestSessionMinutes,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sessionsToCSV(
  sessions: FocusSession[],
  subjectNameById: Record<string, string>
): string {
  const headers = [
    'ID',
    'Date',
    'Start Time',
    'End Time',
    'Duration (min)',
    'Subject',
    'Project',
    'Task / Note',
    'Tags',
  ];

  const rows = sessions.map((s) => {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    return [
      s.id,
      toLocalDateKey(start),
      `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
      `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
      Math.round(s.durationMinutes),
      subjectNameById[s.subjectId] || 'General',
      s.projectName || '',
      s.note && s.note !== s.title ? `${s.title} — ${s.note}` : s.title,
      (s.tags || []).join('; '),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function sessionsToJSON(
  sessions: FocusSession[],
  subjectNameById: Record<string, string>
): string {
  const payload = sessions.map((s) => ({
    id: s.id,
    date: toLocalDateKey(new Date(s.startTime)),
    startTime: s.startTime,
    endTime: s.endTime,
    durationMinutes: Math.round(s.durationMinutes),
    subject: subjectNameById[s.subjectId] || 'General',
    projectName: s.projectName || null,
    title: s.title,
    note: s.note,
    tags: s.tags,
  }));
  return JSON.stringify(payload, null, 2);
}

export function buildFocusCoachContext(params: {
  timeframeLabel: string;
  subjectFilterLabel: string;
  dailyGoalMinutes: number;
  kpis: KpiMetrics;
  subjects: SubjectBreakdownItem[];
  hourly: HourlyAnalysis;
  dow: DayOfWeekAnalysis;
  duration: DurationAnalysis;
}): string {
  const { timeframeLabel, subjectFilterLabel, dailyGoalMinutes, kpis, subjects, hourly, dow, duration } =
    params;

  const subjectLines = subjects
    .map(
      (s) =>
        `  - ${s.name}: ${s.hours.toFixed(1)}h (${s.percentage}%), ${s.sessionCount} sessions, avg ${s.avgSessionMinutes}m`
    )
    .join('\n');

  const dowLines = dow.stats
    .map((d) => `${d.shortLabel}: ${d.avgHours.toFixed(1)}h avg`)
    .join(' | ');

  return [
    `Filter: ${timeframeLabel} | Subject: ${subjectFilterLabel} | Daily Goal: ${formatDuration(dailyGoalMinutes)}`,
    `Total Focus: ${formatDuration(kpis.totalMinutes)} (${kpis.totalSessions} sessions, avg ${Math.round(kpis.avgSessionMinutes)}m/session)`,
    `Period Change: ${kpis.percentChange !== null ? `${kpis.percentChange > 0 ? '+' : ''}${kpis.percentChange}% vs previous period` : 'N/A'}`,
    `Streaks: Current ${kpis.currentStreak} days, Longest ${kpis.longestStreak} days (Today: ${formatDuration(kpis.todayMinutes)})`,
    `Daily Average: ${formatDuration(kpis.dailyAvgActiveMinutes)} on active days (${kpis.activeDaysCount} active), ${formatDuration(kpis.dailyAvgAllDaysMinutes)} across all ${kpis.totalDaysInWindow} days`,
    `Deep Work Ratio (>=45m sessions): ${duration.deepWorkRatio}% (${duration.deepWorkSessions} deep sessions, longest ${duration.longestSessionMinutes}m)`,
    `Peak Productivity Window: ${hourly.peakWindowLabel}`,
    `Day-of-Week Averages: ${dowLines}${dow.strongestDay ? ` | Strongest: ${dow.strongestDay.label}` : ''}${dow.weakestDay ? ` | Weakest: ${dow.weakestDay.label}` : ''}`,
    `Subject Breakdown:\n${subjectLines || '  - No sessions recorded in this range.'}`,
  ].join('\n');
}
