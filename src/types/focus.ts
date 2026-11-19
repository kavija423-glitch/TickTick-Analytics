export type ConnectionMode = 'proxy' | 'custom_proxy' | 'direct';

export type TimeframePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_90_days'
  | 'this_year'
  | 'all_time';

export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

export type AutoRefreshInterval = 0 | 5 | 10 | 30;

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
}

export type TimerMode = 'Pomodoro' | 'Stopwatch';

export interface FocusSession {
  id: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  durationMinutes: number;
  timerMode: TimerMode;
  title: string;
  note: string;
  projectId?: string;
  projectName?: string;
  tags: string[];
  subjectId: string;
  source: 'ticktick' | 'demo';
}

export interface SubjectRule {
  id: string;
  name: string;
  color: string; // Hex color e.g. #6366F1
  keywords: string[];
  projectNames: string[];
  tags: string[];
  isDefault?: boolean;
}

export interface AppSettings {
  apiToken: string;
  connectionMode: ConnectionMode;
  customProxyUrl: string;
  autoRefreshMinutes: AutoRefreshInterval;
  dailyGoalMinutes: number;
  historyMonths: 6 | 12;
  demoMode: boolean;
  subjectRules: SubjectRule[];
  theme: 'dark' | 'light';
}

export interface SyncProgress {
  active: boolean;
  currentChunk: number;
  totalChunks: number;
  label: string;
}

export interface SyncError {
  code: 'AUTH' | 'CORS' | 'NETWORK' | 'API' | 'CONFIG';
  title: string;
  message: string;
  hint?: string;
}

export interface KpiMetrics {
  totalMinutes: number;
  previousTotalMinutes: number;
  percentChange: number | null;
  currentStreak: number;
  longestStreak: number;
  todayMinutes: number;
  dailyAvgActiveMinutes: number;
  dailyAvgAllDaysMinutes: number;
  activeDaysCount: number;
  totalDaysInWindow: number;
  totalSessions: number;
  avgSessionMinutes: number;
}

export interface HeatmapDay {
  dateKey: string; // YYYY-MM-DD local
  date: Date;
  minutes: number;
  sessionsCount: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface MonthlyCalendarCell {
  dateKey: string | null;
  dayOfMonth: number | null;
  minutes: number;
  sessionsCount: number;
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export interface SubjectBreakdownItem {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
  hours: number;
  percentage: number;
  sessionCount: number;
  avgSessionMinutes: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  fullLabel: string;
  totalHours: number;
  rollingAvgHours: number;
  subjectHours: Record<string, number>;
}

export interface HourlyBucket {
  hour: number; // 0..23
  label: string; // "00:00"
  shortLabel: string; // "12a", "8p"
  minutes: number;
  hours: number;
  sessionsCount: number;
}

export interface HourlyAnalysis {
  buckets: HourlyBucket[];
  peakStartHour: number;
  peakEndHour: number;
  peakWindowLabel: string;
  peakWindowMinutes: number;
  insightText: string;
}

export interface DayOfWeekStat {
  dayIndex: number; // 0 = Mon ... 6 = Sun
  label: string;
  shortLabel: string;
  avgHours: number;
  totalHours: number;
  activeDays: number;
  sessionsCount: number;
}

export interface DayOfWeekAnalysis {
  stats: DayOfWeekStat[];
  strongestDay: DayOfWeekStat | null;
  weakestDay: DayOfWeekStat | null;
}

export interface DurationBucket {
  id: string;
  label: string;
  minMinutes: number;
  maxMinutes: number | null;
  count: number;
  totalMinutes: number;
  isDeepWork: boolean;
}

export interface DurationAnalysis {
  buckets: DurationBucket[];
  deepWorkMinutes: number;
  deepWorkSessions: number;
  deepWorkRatio: number; // 0..100 (% of focus time in >= 45m sessions)
  longestSessionMinutes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  model?: string;
}
