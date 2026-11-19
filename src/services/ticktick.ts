import type {
  AppSettings,
  FocusSession,
  SyncError,
  SyncProgress,
  TickTickProject,
  TimerMode,
} from '../types/focus';
import {
  addLocalDays,
  applySubjectRules,
  buildDateChunks,
  mergeAndDeduplicateSessions,
  resolveSessionSubject,
} from '../utils/analytics';
import { STORAGE_KEYS } from '../utils/defaults';
import { HttpResponseError, parseJsonResponseSafely } from '../utils/http';

const TICKTICK_DIRECT_BASE = 'https://api.ticktick.com/open/v1';

export interface RawTickTickFocusTask {
  title?: string;
  projectId?: string;
  taskId?: string;
  tags?: string[];
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface RawTickTickPause {
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface RawTickTickFocusRecord {
  id?: string;
  startTime?: string;
  endTime?: string;
  /** Actual focused duration returned by TickTick API (typically in seconds, excluding pauses). */
  duration?: number;
  focusDuration?: number;
  actualDuration?: number;
  /** Optional paused duration returned by some TickTick API variants (seconds or ms). */
  pauseDuration?: number;
  pausedDuration?: number;
  pauses?: RawTickTickPause[];
  /** TickTick timer type: 0 = Pomodoro, 1 = Stopwatch */
  type?: number;
  note?: string;
  title?: string;
  projectId?: string;
  tags?: string[];
  status?: number;
  tasks?: RawTickTickFocusTask[];
}

function toMinutesFromSecondsOrMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Values > 86,400 cannot realistically be seconds for a single session (>24h), so treat as ms
  const minutes = value > 86_400 ? value / 60_000 : value / 60;
  return Math.max(1, Math.round(minutes));
}

function toMsFromSecondsOrMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 86_400 ? value : value * 1000;
}

/**
 * Computes actual focused duration in minutes, prioritizing the API's focused duration
 * (excluding paused time) rather than blindly subtracting startTime from endTime.
 */
export function computeFocusedDurationMinutes(raw: RawTickTickFocusRecord): number {
  // 1. Prefer explicit focused duration fields from TickTick API (already exclude paused intervals)
  const explicitFocusDuration =
    typeof raw.focusDuration === 'number' && raw.focusDuration > 0
      ? raw.focusDuration
      : typeof raw.actualDuration === 'number' && raw.actualDuration > 0
        ? raw.actualDuration
        : typeof raw.duration === 'number' && raw.duration > 0
          ? raw.duration
          : null;

  if (explicitFocusDuration !== null) {
    return toMinutesFromSecondsOrMs(explicitFocusDuration);
  }

  // 2. If tasks[] carries active focus slices with individual durations or timestamps, sum them
  if (Array.isArray(raw.tasks) && raw.tasks.length > 0) {
    let taskDurationMs = 0;
    for (const t of raw.tasks) {
      if (typeof t.duration === 'number' && t.duration > 0) {
        taskDurationMs += toMsFromSecondsOrMs(t.duration);
      } else if (t.startTime && t.endTime) {
        const s = new Date(t.startTime).getTime();
        const e = new Date(t.endTime).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
          taskDurationMs += e - s;
        }
      }
    }
    if (taskDurationMs > 0) {
      return Math.max(1, Math.round(taskDurationMs / 60_000));
    }
  }

  // 3. Fall back to wall-clock span minus any recorded pause duration / pause intervals
  if (raw.startTime && raw.endTime) {
    const startMs = new Date(raw.startTime).getTime();
    const endMs = new Date(raw.endTime).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      let pauseMs = 0;
      if (typeof raw.pauseDuration === 'number' && raw.pauseDuration > 0) {
        pauseMs = toMsFromSecondsOrMs(raw.pauseDuration);
      } else if (typeof raw.pausedDuration === 'number' && raw.pausedDuration > 0) {
        pauseMs = toMsFromSecondsOrMs(raw.pausedDuration);
      } else if (Array.isArray(raw.pauses) && raw.pauses.length > 0) {
        for (const p of raw.pauses) {
          if (typeof p.duration === 'number' && p.duration > 0) {
            pauseMs += toMsFromSecondsOrMs(p.duration);
          } else if (p.startTime && p.endTime) {
            const ps = new Date(p.startTime).getTime();
            const pe = new Date(p.endTime).getTime();
            if (!Number.isNaN(ps) && !Number.isNaN(pe) && pe > ps) {
              pauseMs += pe - ps;
            }
          }
        }
      }

      const activeMs = Math.max(0, endMs - startMs - pauseMs);
      if (activeMs > 0) {
        return Math.max(1, Math.round(activeMs / 60_000));
      }
    }
  }

  return 0;
}

function buildRequestUrl(
  settings: Pick<AppSettings, 'connectionMode' | 'customProxyUrl'>,
  endpoint: string,
  params: Record<string, string> = {}
): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (settings.connectionMode === 'direct') {
    const url = new URL(`${TICKTICK_DIRECT_BASE}${normalizedEndpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  if (settings.connectionMode === 'custom_proxy') {
    const base = settings.customProxyUrl.trim().replace(/\/+$/, '');
    if (!base) {
      throw {
        code: 'CONFIG',
        title: 'Custom Proxy URL Missing',
        message: 'Enter your Custom Proxy URL in Settings or switch to the Built-in Proxy.',
      } satisfies SyncError;
    }
    const url = new URL(base);
    url.searchParams.set('endpoint', normalizedEndpoint);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  // Default: built-in /api/ticktick (works in both AI Studio Express server & Cloudflare Pages)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:3000';
  const url = new URL('/api/ticktick', origin);
  url.searchParams.set('endpoint', normalizedEndpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function normalizeTickTickError(err: unknown, mode: AppSettings['connectionMode']): SyncError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return err as SyncError;
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (
    mode === 'direct' &&
    (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS'))
  ) {
    return {
      code: 'CORS',
      title: 'Blocked by Browser CORS Policy',
      message:
        'TickTick Open API does not allow direct browser requests. Switch Connection Mode to "Built-in Proxy (/api/ticktick)" in Settings.',
      hint: 'Open Settings → TickTick API → select Built-in Proxy.',
    };
  }

  return {
    code: 'NETWORK',
    title: 'TickTick Sync Failed',
    message: msg || 'Could not reach the TickTick API endpoint.',
  };
}

async function tickTickFetch<T>(
  settings: Pick<AppSettings, 'apiToken' | 'connectionMode' | 'customProxyUrl'>,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = settings.apiToken.trim();
  if (!token) {
    throw {
      code: 'AUTH',
      title: 'TickTick API Token Required',
      message: 'Paste your TickTick Personal API Token in Settings to sync live sessions.',
    } satisfies SyncError;
  }

  const url = buildRequestUrl(settings, endpoint, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw normalizeTickTickError(err, settings.connectionMode);
  }

  if (response.status === 401 || response.status === 403) {
    const rawDetail = await response.text().catch(() => '');
    const suffix = rawDetail.trim() ? ` (${rawDetail.trim().slice(0, 120)})` : '';
    throw {
      code: 'AUTH',
      title: `Invalid or Expired TickTick Token (HTTP ${response.status})`,
      message: `TickTick rejected the token (HTTP ${response.status})${suffix}. Verify your Personal API Token in Settings.`,
    } satisfies SyncError;
  }

  try {
    return await parseJsonResponseSafely<T>(response, `TickTick ${endpoint}`);
  } catch (err) {
    if (err instanceof HttpResponseError) {
      throw {
        code: 'API',
        title: `TickTick API Error (HTTP ${err.status})`,
        message: err.message,
      } satisfies SyncError;
    }
    throw normalizeTickTickError(err, settings.connectionMode);
  }
}

/**
 * Normalizes a raw TickTick /open/v1/focus record into our internal FocusSession schema.
 * Prioritizes the API's actual focused duration (excluding pauses) and tags each record
 * as either 'Pomodoro' (type=0) or 'Stopwatch' (type=1).
 */
export function normalizeFocusRecord(
  raw: RawTickTickFocusRecord,
  settings: Pick<AppSettings, 'subjectRules'>,
  projectNameById: Record<string, string>,
  fallbackTimerMode: TimerMode = 'Pomodoro'
): FocusSession | null {
  const startRaw = raw.startTime;
  if (!startRaw) return null;

  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) return null;

  const durationMinutes = computeFocusedDurationMinutes(raw);
  if (durationMinutes <= 0) return null;

  const parsedEnd = raw.endTime ? new Date(raw.endTime) : null;
  const endDate =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > startDate.getTime()
      ? parsedEnd
      : new Date(startDate.getTime() + durationMinutes * 60_000);

  const timerMode: TimerMode =
    raw.type === 1 ? 'Stopwatch' : raw.type === 0 ? 'Pomodoro' : fallbackTimerMode;

  const firstTask = Array.isArray(raw.tasks) && raw.tasks.length > 0 ? raw.tasks[0] : undefined;
  const projectId = raw.projectId || firstTask?.projectId;
  const projectName = projectId ? projectNameById[projectId] : undefined;
  const title = (firstTask?.title || raw.title || raw.note || 'Focus Session').trim();
  const note = (raw.note || '').trim();
  const tags = Array.isArray(raw.tags)
    ? raw.tags
    : Array.isArray(firstTask?.tags)
      ? firstTask.tags
      : [];

  const id = raw.id || `tt-${timerMode.toLowerCase()}-${startDate.getTime()}-${durationMinutes}`;

  const draft = {
    title,
    note,
    projectId,
    projectName,
    tags,
  };

  return {
    id,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    durationMinutes,
    timerMode,
    title,
    note,
    projectId,
    projectName,
    tags,
    subjectId: resolveSessionSubject(draft, settings.subjectRules, projectNameById),
    source: 'ticktick',
  };
}

function extractFocusArray(
  data: RawTickTickFocusRecord[] | { records?: RawTickTickFocusRecord[]; data?: RawTickTickFocusRecord[] }
): RawTickTickFocusRecord[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function clearTickTickLocalCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION_CACHE);
    localStorage.removeItem(STORAGE_KEYS.PROJECTS_CACHE);
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNCED);
    localStorage.removeItem(STORAGE_KEYS.SYNCED_MONTHS);
  } catch {
    // Ignore storage errors
  }
}

export function loadCachedSessions(): FocusSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as FocusSession[]).map((s) => ({
      ...s,
      timerMode: s.timerMode ?? 'Pomodoro',
    }));
  } catch {
    return [];
  }
}

export function saveCachedSessions(sessions: FocusSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION_CACHE, JSON.stringify(sessions));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export function loadCachedProjects(): TickTickProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TickTickProject[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedProjects(projects: TickTickProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS_CACHE, JSON.stringify(projects));
  } catch {
    // Ignore
  }
}

export interface SyncResult {
  sessions: FocusSession[];
  projects: TickTickProject[];
  syncedAt: string;
  fetchedCount: number;
}

/**
 * Syncs TickTick projects and BOTH Pomodoro (type=0) & Stopwatch (type=1) focus records.
 * - `mode: 'recent'` fetches only the latest 30-day window (used on startup & auto-refresh).
 * - `mode: 'full'` splits the past 6–12 months into sequential 30-day chunks, fetching type=0
 *   and type=1 in parallel for every chunk, and merges/deduplicates by session ID.
 * - `forceFull: true` clears the localStorage cache first so all chunks are re-fetched cleanly.
 */
export async function syncTickTickData(options: {
  settings: AppSettings;
  mode: 'recent' | 'full';
  forceFull?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}): Promise<SyncResult> {
  const { settings, mode, forceFull = false, onProgress } = options;
  const now = new Date();

  if (forceFull) {
    clearTickTickLocalCache();
  }

  onProgress?.({
    active: true,
    currentChunk: 0,
    totalChunks: 1,
    label: 'Fetching TickTick projects…',
  });

  // 1. Fetch projects to map projectId -> projectName
  let projects = forceFull ? [] : loadCachedProjects();
  try {
    const remoteProjects = await tickTickFetch<TickTickProject[]>(settings, '/project');
    if (Array.isArray(remoteProjects)) {
      projects = remoteProjects;
      saveCachedProjects(projects);
    }
  } catch (err) {
    const normalized = normalizeTickTickError(err, settings.connectionMode);
    if (normalized.code === 'AUTH' || normalized.code === 'CORS' || normalized.code === 'CONFIG') {
      throw normalized;
    }
  }

  const projectNameById: Record<string, string> = {};
  for (const p of projects) {
    if (p.id && p.name) projectNameById[p.id] = p.name;
  }

  // 2. Build sequential 30-day chunks
  const daysBack = mode === 'recent' ? 30 : settings.historyMonths * 30;
  const fromDate = addLocalDays(now, -daysBack);
  const allChunks = buildDateChunks(fromDate, now, 30);

  let cachedChunkKeys = new Set<string>();
  if (!forceFull && mode === 'full') {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SYNCED_MONTHS);
      if (saved) cachedChunkKeys = new Set(JSON.parse(saved) as string[]);
    } catch {
      cachedChunkKeys = new Set();
    }
  }

  const chunksToFetch = allChunks.filter((chunk, idx) => {
    const isLatest = idx === allChunks.length - 1;
    if (isLatest || forceFull || mode === 'recent') return true;
    const chunkKey = chunk.from.slice(0, 10);
    return !cachedChunkKeys.has(chunkKey);
  });

  const incoming: FocusSession[] = [];

  for (let i = 0; i < chunksToFetch.length; i++) {
    const chunk = chunksToFetch[i];
    onProgress?.({
      active: true,
      currentChunk: i + 1,
      totalChunks: chunksToFetch.length,
      label: `Syncing Pomodoro & Stopwatch · ${chunk.label} (${i + 1}/${chunksToFetch.length})…`,
    });

    type FocusResponse =
      | RawTickTickFocusRecord[]
      | { records?: RawTickTickFocusRecord[]; data?: RawTickTickFocusRecord[] };

    // Fetch Pomodoro (type=0) AND Stopwatch (type=1) in parallel for each 30-day chunk
    const [pomodoroData, stopwatchData] = await Promise.all([
      tickTickFetch<FocusResponse>(settings, '/focus', {
        from: chunk.from,
        to: chunk.to,
        type: '0',
      }),
      tickTickFetch<FocusResponse>(settings, '/focus', {
        from: chunk.from,
        to: chunk.to,
        type: '1',
      }),
    ]);

    const pomodoroRecords = extractFocusArray(pomodoroData);
    const stopwatchRecords = extractFocusArray(stopwatchData);

    for (const raw of pomodoroRecords) {
      const normalized = normalizeFocusRecord(raw, settings, projectNameById, 'Pomodoro');
      if (normalized) incoming.push(normalized);
    }

    for (const raw of stopwatchRecords) {
      const normalized = normalizeFocusRecord(raw, settings, projectNameById, 'Stopwatch');
      if (normalized) incoming.push(normalized);
    }

    if (i < chunksToFetch.length - 1) {
      cachedChunkKeys.add(chunk.from.slice(0, 10));
    }
  }

  const existing = forceFull ? [] : loadCachedSessions();
  const merged = applySubjectRules(
    mergeAndDeduplicateSessions(existing, incoming),
    settings.subjectRules,
    projectNameById
  );

  saveCachedSessions(merged);
  try {
    localStorage.setItem(STORAGE_KEYS.SYNCED_MONTHS, JSON.stringify(Array.from(cachedChunkKeys)));
  } catch {
    // Ignore
  }

  const syncedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SYNCED, syncedAt);
  } catch {
    // Ignore
  }

  onProgress?.({
    active: false,
    currentChunk: chunksToFetch.length,
    totalChunks: chunksToFetch.length,
    label: 'Sync complete',
  });

  return {
    sessions: merged,
    projects,
    syncedAt,
    fetchedCount: incoming.length,
  };
}
