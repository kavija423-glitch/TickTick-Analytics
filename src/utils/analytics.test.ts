import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDateChunks,
  computeDayOfWeekStats,
  computeDurationAnalysis,
  computeHourlyDistribution,
  computeKpis,
  computeStreaks,
  computeSubjectBreakdown,
  computeTrendSeries,
  computeYearlyHeatmap,
  filterSessionsByRange,
  getTimeframeBounds,
  mergeAndDeduplicateSessions,
  resolveSessionSubject,
  sessionsToCSV,
} from './analytics';
import { DEFAULT_SUBJECT_RULES } from './defaults';
import { generateDemoSessions } from './demoData';
import { computeFocusedDurationMinutes, normalizeFocusRecord } from '../services/ticktick';
import { HttpResponseError, parseJsonResponseSafely } from './http';
import { COACH_MODELS, formatGeminiError, resolveGeminiApiKey } from '../services/geminiCoach';
import type { FocusSession } from '../types/focus';

function makeSession(overrides: Partial<FocusSession> & { id: string; startTime: string; durationMinutes: number }): FocusSession {
  const start = new Date(overrides.startTime);
  const end = new Date(start.getTime() + overrides.durationMinutes * 60_000);
  return {
    id: overrides.id,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: overrides.durationMinutes,
    timerMode: overrides.timerMode ?? 'Pomodoro',
    title: overrides.title ?? 'Study Block',
    note: overrides.note ?? '',
    projectId: overrides.projectId,
    projectName: overrides.projectName,
    tags: overrides.tags ?? [],
    subjectId: overrides.subjectId ?? 'general',
    source: overrides.source ?? 'ticktick',
  };
}

test('buildDateChunks splits 180 days into sequential <= 30-day chunks', () => {
  const to = new Date('2026-11-19T12:00:00.000Z');
  const from = new Date(to.getTime() - 180 * 86_400_000);
  const chunks = buildDateChunks(from, to, 30);

  assert.equal(chunks.length, 6);
  for (let i = 0; i < chunks.length; i++) {
    const startMs = new Date(chunks[i].from).getTime();
    const endMs = new Date(chunks[i].to).getTime();
    assert.ok(endMs > startMs, 'chunk end must be after start');
    assert.ok(endMs - startMs <= 30 * 86_400_000, 'chunk span must not exceed 30 days');
    if (i > 0) {
      const prevEndMs = new Date(chunks[i - 1].to).getTime();
      assert.equal(startMs - prevEndMs, 1000, 'chunks must be contiguous');
    }
  }
});

test('mergeAndDeduplicateSessions deduplicates by ID and prefers newer incoming records', () => {
  const existing = [
    makeSession({ id: 'a', startTime: '2026-11-18T10:00:00.000Z', durationMinutes: 30, title: 'Old Title' }),
    makeSession({ id: 'b', startTime: '2026-11-17T10:00:00.000Z', durationMinutes: 45 }),
  ];
  const incoming = [
    makeSession({ id: 'a', startTime: '2026-11-18T10:00:00.000Z', durationMinutes: 50, title: 'Updated Title' }),
    makeSession({ id: 'c', startTime: '2026-11-19T10:00:00.000Z', durationMinutes: 60 }),
  ];

  const merged = mergeAndDeduplicateSessions(existing, incoming);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, 'c');
  assert.equal(merged[1].id, 'a');
  assert.equal(merged[1].title, 'Updated Title');
  assert.equal(merged[1].durationMinutes, 50);
});

test('resolveSessionSubject matches by project name, tags, keywords, and fallback', () => {
  const projectMap = { p1: 'A/L Physics' };

  assert.equal(
    resolveSessionSubject(
      { title: 'Random task', note: '', projectId: 'p1', tags: [] },
      DEFAULT_SUBJECT_RULES,
      projectMap
    ),
    'physics'
  );

  assert.equal(
    resolveSessionSubject(
      { title: 'Homework', note: '', tags: ['ICT'] },
      DEFAULT_SUBJECT_RULES
    ),
    'ict'
  );

  assert.equal(
    resolveSessionSubject(
      { title: 'Integration by Parts', note: '', tags: [] },
      DEFAULT_SUBJECT_RULES
    ),
    'combined-maths'
  );

  assert.equal(
    resolveSessionSubject(
      { title: 'Organize desk', note: '', tags: [] },
      DEFAULT_SUBJECT_RULES
    ),
    'general'
  );
});

test('computeStreaks calculates current and longest streak against daily goal', () => {
  const now = new Date(2026, 10, 19, 15, 0, 0); // Nov 19, 2026 local
  const sessions = [
    // Current 3-day streak: Nov 17, 18, 19 (>= 120m each)
    makeSession({ id: '1', startTime: new Date(2026, 10, 19, 9, 0).toISOString(), durationMinutes: 130 }),
    makeSession({ id: '2', startTime: new Date(2026, 10, 18, 9, 0).toISOString(), durationMinutes: 120 }),
    makeSession({ id: '3', startTime: new Date(2026, 10, 17, 9, 0).toISOString(), durationMinutes: 140 }),
    // Gap on Nov 16
    // Older 4-day streak: Nov 10, 11, 12, 13
    makeSession({ id: '4', startTime: new Date(2026, 10, 13, 9, 0).toISOString(), durationMinutes: 125 }),
    makeSession({ id: '5', startTime: new Date(2026, 10, 12, 9, 0).toISOString(), durationMinutes: 120 }),
    makeSession({ id: '6', startTime: new Date(2026, 10, 11, 9, 0).toISOString(), durationMinutes: 150 }),
    makeSession({ id: '7', startTime: new Date(2026, 10, 10, 9, 0).toISOString(), durationMinutes: 120 }),
  ];

  const { currentStreak, longestStreak, todayMinutes } = computeStreaks(sessions, 120, now);
  assert.equal(currentStreak, 3);
  assert.equal(longestStreak, 4);
  assert.equal(todayMinutes, 130);
});

test('computeDurationAnalysis computes buckets and Deep Work Ratio (>=45m)', () => {
  const sessions = [
    makeSession({ id: '1', startTime: '2026-11-19T08:00:00.000Z', durationMinutes: 20 }), // <25
    makeSession({ id: '2', startTime: '2026-11-19T09:00:00.000Z', durationMinutes: 30 }), // 25-45
    makeSession({ id: '3', startTime: '2026-11-19T10:00:00.000Z', durationMinutes: 50 }), // 45-60 (deep)
    makeSession({ id: '4', startTime: '2026-11-19T12:00:00.000Z', durationMinutes: 100 }), // 90+ (deep)
  ];

  const analysis = computeDurationAnalysis(sessions);
  assert.equal(analysis.deepWorkMinutes, 150);
  assert.equal(analysis.deepWorkSessions, 2);
  assert.equal(analysis.deepWorkRatio, 75); // 150 / 200 = 75%
  assert.equal(analysis.longestSessionMinutes, 100);
  assert.equal(analysis.buckets[0].count, 1);
  assert.equal(analysis.buckets[1].count, 1);
  assert.equal(analysis.buckets[2].count, 1);
  assert.equal(analysis.buckets[3].count, 0);
  assert.equal(analysis.buckets[4].count, 1);
});

test('computeHourlyDistribution finds peak 3-hour window and day-of-week stats aggregate properly', () => {
  const sessions = [
    makeSession({ id: '1', startTime: new Date(2026, 10, 16, 20, 15).toISOString(), durationMinutes: 60 }), // Mon 8 PM
    makeSession({ id: '2', startTime: new Date(2026, 10, 16, 21, 30).toISOString(), durationMinutes: 60 }), // Mon 9 PM
    makeSession({ id: '3', startTime: new Date(2026, 10, 17, 22, 0).toISOString(), durationMinutes: 60 }), // Tue 10 PM
    makeSession({ id: '4', startTime: new Date(2026, 10, 18, 9, 0).toISOString(), durationMinutes: 30 }), // Wed 9 AM
  ];

  const hourly = computeHourlyDistribution(sessions);
  assert.equal(hourly.peakStartHour, 20);
  assert.equal(hourly.peakEndHour, 23);
  assert.equal(hourly.peakWindowMinutes, 180);

  const dow = computeDayOfWeekStats(sessions);
  assert.equal(dow.strongestDay?.label, 'Monday');
  assert.equal(dow.strongestDay?.avgHours, 2);
  assert.equal(dow.weakestDay?.label, 'Wednesday');
  assert.equal(dow.weakestDay?.avgHours, 0.5);
});

test('demo dataset generates 6 months of deterministic analytics across all views', () => {
  const anchor = new Date(2026, 10, 19, 14, 0, 0);
  const demo = generateDemoSessions(anchor, DEFAULT_SUBJECT_RULES);
  assert.ok(demo.length > 350, `Expected rich 6-month dataset, got ${demo.length}`);

  const bounds = getTimeframeBounds('last_90_days', anchor);
  const current = filterSessionsByRange(demo, bounds.start, bounds.end);
  const prev = filterSessionsByRange(demo, bounds.prevStart, bounds.prevEnd);
  const kpis = computeKpis(current, prev, demo, bounds.totalDays, 120, true, anchor);

  assert.ok(kpis.totalMinutes > 0);
  assert.ok(kpis.currentStreak >= 14);
  assert.ok(kpis.percentChange !== null);

  const heatmap = computeYearlyHeatmap(demo, 120, anchor);
  assert.equal(heatmap.length, 365);

  const breakdown = computeSubjectBreakdown(current, DEFAULT_SUBJECT_RULES);
  assert.equal(breakdown.length, 4);

  const trends = computeTrendSeries(current, 'daily', DEFAULT_SUBJECT_RULES, anchor);
  assert.ok(trends.length >= 60);

  const csv = sessionsToCSV(current.slice(0, 2), { 'combined-maths': 'Combined Maths' });
  assert.ok(
    csv.startsWith('ID,Date,Start Time,End Time,Duration (min),Timer Mode,Subject,Project,Task / Note,Tags')
  );
});

test('computeFocusedDurationMinutes prioritizes actual focused duration over endTime - startTime (excludes pauses)', () => {
  // Wall-clock span is 75 minutes, but API reports 2700 seconds (45 min) of actual focused time (30 min paused)
  const pausedPomodoro = computeFocusedDurationMinutes({
    startTime: '2026-11-19T08:00:00.000Z',
    endTime: '2026-11-19T09:15:00.000Z',
    duration: 2700,
  });
  assert.equal(pausedPomodoro, 45);

  // Explicit focusDuration in ms (e.g. 50 min = 3,000,000 ms) over 80m wall clock
  const msDuration = computeFocusedDurationMinutes({
    startTime: '2026-11-19T10:00:00.000Z',
    endTime: '2026-11-19T11:20:00.000Z',
    focusDuration: 3_000_000,
  });
  assert.equal(msDuration, 50);

  // Wall clock minus pauseDuration when explicit duration is omitted (90m wall clock - 20m pause = 70m)
  const withPauseDuration = computeFocusedDurationMinutes({
    startTime: '2026-11-19T14:00:00.000Z',
    endTime: '2026-11-19T15:30:00.000Z',
    pauseDuration: 1200,
  });
  assert.equal(withPauseDuration, 70);

  // Wall clock minus pauses[] intervals (60m wall clock - 15m pause = 45m)
  const withPausesArray = computeFocusedDurationMinutes({
    startTime: '2026-11-19T16:00:00.000Z',
    endTime: '2026-11-19T17:00:00.000Z',
    pauses: [
      { startTime: '2026-11-19T16:20:00.000Z', endTime: '2026-11-19T16:35:00.000Z' },
    ],
  });
  assert.equal(withPausesArray, 45);
});

test('normalizeFocusRecord tags Pomodoro (type=0) and Stopwatch (type=1) and deduplicates merged results by ID', () => {
  const settings = { subjectRules: DEFAULT_SUBJECT_RULES };
  const projectMap = { p1: 'Physics' };

  const pomo = normalizeFocusRecord(
    {
      id: 'sess-pomo-1',
      startTime: '2026-11-19T08:00:00.000Z',
      endTime: '2026-11-19T09:05:00.000Z', // 65m wall clock
      duration: 3000, // 50m actual focus (15m paused)
      projectId: 'p1',
      title: 'Waves Past Paper',
    },
    settings,
    projectMap,
    'Pomodoro'
  );

  const stopwatch = normalizeFocusRecord(
    {
      id: 'sess-sw-1',
      startTime: '2026-11-19T10:00:00.000Z',
      endTime: '2026-11-19T11:30:00.000Z', // 90m wall clock
      duration: 4200, // 70m actual focus (20m paused)
      title: 'SQL Joins Practice',
      tags: ['ict'],
    },
    settings,
    projectMap,
    'Stopwatch'
  );

  assert.ok(pomo);
  assert.ok(stopwatch);
  assert.equal(pomo.timerMode, 'Pomodoro');
  assert.equal(pomo.durationMinutes, 50);
  assert.equal(pomo.subjectId, 'physics');
  assert.equal(stopwatch.timerMode, 'Stopwatch');
  assert.equal(stopwatch.durationMinutes, 70);
  assert.equal(stopwatch.subjectId, 'ict');

  // Merge both streams with a duplicate ID and verify deduplication
  const merged = mergeAndDeduplicateSessions([pomo], [pomo, stopwatch]);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((m) => [m.id, m.timerMode, m.durationMinutes]),
    [
      ['sess-sw-1', 'Stopwatch', 70],
      ['sess-pomo-1', 'Pomodoro', 50],
    ]
  );
});

test('parseJsonResponseSafely reads raw text first and reports status + real error on empty/HTML/JSON failures', async () => {
  // 1. Valid JSON 200 response
  const okData = await parseJsonResponseSafely<{ hello: string }>(
    {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '{"hello":"world"}',
    },
    'TickTick /focus'
  );
  assert.deepEqual(okData, { hello: 'world' });

  // 2. Empty 404 body (classic Cloudflare Pages missing /api/* route)
  await assert.rejects(
    () =>
      parseJsonResponseSafely(
        {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => '',
        },
        'Focus Coach'
      ),
    (err: unknown) => {
      assert.ok(err instanceof HttpResponseError);
      assert.equal(err.status, 404);
      assert.match(err.message, /404 Not Found/);
      assert.match(err.message, /empty response body/i);
      return true;
    }
  );

  // 3. HTML 502 gateway error page
  await assert.rejects(
    () =>
      parseJsonResponseSafely(
        {
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => '<html><body><h1>502 Bad Gateway</h1><p>Upstream unavailable</p></body></html>',
        },
        'TickTick /project'
      ),
    (err: unknown) => {
      assert.ok(err instanceof HttpResponseError);
      assert.equal(err.status, 502);
      assert.match(err.message, /502 Bad Gateway/);
      assert.match(err.message, /Upstream unavailable/);
      return true;
    }
  );

  // 4. JSON error payload
  await assert.rejects(
    () =>
      parseJsonResponseSafely(
        {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
        },
        'TickTick /focus'
      ),
    (err: unknown) => {
      assert.ok(err instanceof HttpResponseError);
      assert.equal(err.status, 429);
      assert.match(err.message, /429/);
      assert.match(err.message, /Rate limit exceeded/);
      return true;
    }
  );

  // 5. 200 OK with empty or non-JSON body never throws raw SyntaxError
  await assert.rejects(
    () =>
      parseJsonResponseSafely(
        {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '   ',
        },
        'TickTick /focus'
      ),
    (err: unknown) => {
      assert.ok(err instanceof HttpResponseError);
      assert.match(err.message, /empty response/i);
      return true;
    }
  );
});

test('resolveGeminiApiKey prefers localStorage key and only falls back to env key in AI Studio preview', () => {
  assert.equal(COACH_MODELS.hydrogen, 'gemini-4-hydrogen');
  assert.equal(COACH_MODELS.flashLite, 'gemini-3.5-flash-lite');

  // Prefers stored key in both preview and production
  assert.equal(resolveGeminiApiKey('AIza-user-key', 'AIza-env-key', true), 'AIza-user-key');
  assert.equal(resolveGeminiApiKey('AIza-user-key', 'AIza-env-key', false), 'AIza-user-key');

  // Falls back to env key ONLY in preview
  assert.equal(resolveGeminiApiKey('', 'AIza-env-key', true), 'AIza-env-key');
  assert.equal(resolveGeminiApiKey('', 'AIza-env-key', false), '');

  // Formats Gemini ApiError payloads cleanly
  const formatted = formatGeminiError({
    status: 400,
    message: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }),
  });
  assert.match(formatted, /HTTP 400/);
  assert.match(formatted, /API key not valid/);
});
