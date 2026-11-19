import type {
  AppSettings,
  FocusSession,
  SyncError,
  SyncProgress,
  TickTickProject,
} from '../types/focus';
import {
  addLocalDays,
  applySubjectRules,
  buildDateChunks,
  mergeAndDeduplicateSessions,
  resolveSessionSubject,
} from '../utils/analytics';
import { STORAGE_KEYS } from '../utils/defaults';

const TICKTICK_DIRECT_BASE = 'https://api.ticktick.com/open/v1';

interface RawTickTickFocusTask {
  title?: string;
  projectId?: string;
  taskId?: string;
  tags?: string[];
  startTime?: string;
  endTime?: string;
}

interface RawTickTickFocusRecord {
  id?: string;
  startTime?: string;
  endTime?: string;
  duration?: number; // seconds or milliseconds depending on endpoint variant
  note?: string;
  title?: string;
  projectId?: string;
  tags?: string[];
  status?: number;
  tasks?: RawTickTickFocusTask[];
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
      hint: 'Open Settings → API Connection → select Built-in Proxy.',
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
    throw {
      code: 'AUTH',
      title: 'Invalid or Expired TickTick Token',
      message: `TickTick rejected the token (HTTP ${response.status}). Verify your Personal API Token in Settings.`,
    } satisfies SyncError;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const json = (await response.json()) as { error?: string; errorMessage?: string };
      detail = json.error || json.errorMessage || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw {
      code: 'API',
      title: `TickTick API Error (${response.status})`,
      message: detail || `Request to ${endpoint} failed with status ${response.status}.`,
    } satisfies SyncError;
  }

  return (await response.json()) as T;
}

/**
 * Normalizes a raw TickTick /open/v1/focus record into our internal FocusSession schema.
 */
export function normalizeFocusRecord(
  raw: RawTickTickFocusRecord,
  settings: Pick<AppSettings, 'subjectRules'>,
  projectNameById: Record<string, string>
): FocusSession | null {
  const startRaw = raw.startTime;
  const endRaw = raw.endTime;
  if (!startRaw) return null;

  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) return null;

  let endDate = endRaw ? new Date(endRaw) : null;
  let durationMinutes = 0;

  if (endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() > startDate.getTime()) {
    durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);
  } else if (typeof raw.duration === 'number' && raw.duration > 0) {
    // TickTick duration may be seconds (or ms if very large)
    durationMinutes =
      raw.duration > 86_400
        ? Math.round(raw.duration / 60_000)
        : Math.round(raw.duration / 60);
    endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  }

  if (durationMinutes <= 0 || !endDate) return null;

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

  const id = raw.id || `tt-${startDate.getTime()}-${durationMinutes}`;

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
    title,
    note,
    projectId,
    projectName,
    tags,
    subjectId: resolveSessionSubject(draft, settings.subjectRules, projectNameById),
    source: 'ticktick',
  };
}

export function loadCachedSessions(): FocusSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FocusSession[]) : [];
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
 * Syncs TickTick projects and focus records.
 * - `mode: 'recent'` fetches only the latest 30-day window (used on startup & auto-refresh).
 * - `mode: 'full'` splits the past 6–12 months into sequential 30-day chunks, skipping already-cached
 *   historical chunks unless `forceFull` is true, and merges/deduplicates by session ID.
 */
export async function syncTickTickData(options: {
  settings: AppSettings;
  mode: 'recent' | 'full';
  forceFull?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}): Promise<SyncResult> {
  const { settings, mode, forceFull = false, onProgress } = options;
  const now = new Date();

  onProgress?.({
    active: true,
    currentChunk: 0,
    totalChunks: 1,
    label: 'Fetching TickTick projects…',
  });

  // 1. Fetch projects to map projectId -> projectName
  let projects = loadCachedProjects();
  try {
    const remoteProjects = await tickTickFetch<TickTickProject[]>(settings, '/project');
    if (Array.isArray(remoteProjects)) {
      projects = remoteProjects;
      saveCachedProjects(projects);
    }
  } catch (err) {
    // Re-throw auth/CORS/config errors immediately so the user sees why sync failed
    const normalized = normalizeTickTickError(err, settings.connectionMode);
    if (normalized.code === 'AUTH' || normalized.code === 'CORS' || normalized.code === 'CONFIG') {
      throw normalized;
    }
  }

  const projectNameById: Record<string, string> = {};
  for (const p of projects) {
    if (p.id && p.name) projectNameById[p.id] = p.name;
  }

  // 2. Build 30-day chunks
  const daysBack = mode === 'recent' ? 30 : settings.historyMonths * 30;
  const fromDate = addLocalDays(now, -daysBack);
  const allChunks = buildDateChunks(fromDate, now, 30);

  // Determine which historical chunks are already cached
  let cachedChunkKeys = new Set<string>();
  if (!forceFull && mode === 'full') {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SYNCED_MONTHS);
      if (saved) cachedChunkKeys = new Set(JSON.parse(saved) as string[]);
    } catch {
      cachedChunkKeys = new Set();
    }
  }

  // Always refresh the most recent chunk; skip older cached chunks unless forced
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
      label: `Syncing ${chunk.label} (${i + 1}/${chunksToFetch.length})…`,
    });

    const data = await tickTickFetch<
      RawTickTickFocusRecord[] | { records?: RawTickTickFocusRecord[]; data?: RawTickTickFocusRecord[] }
    >(settings, '/focus', {
      from: chunk.from,
      to: chunk.to,
      type: '0',
    });

    const records: RawTickTickFocusRecord[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data?.data)
          ? data.data
          : [];

    for (const raw of records) {
      const normalized = normalizeFocusRecord(raw, settings, projectNameById);
      if (normalized) incoming.push(normalized);
    }

    // Mark historical chunk as cached (except the current open chunk)
    if (i < chunksToFetch.length - 1) {
      cachedChunkKeys.add(chunk.from.slice(0, 10));
    }
  }

  const existing = loadCachedSessions();
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
