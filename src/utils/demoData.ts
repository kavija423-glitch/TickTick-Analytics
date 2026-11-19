import type { FocusSession, SubjectRule } from '../types/focus';
import { addLocalDays, startOfLocalDay } from './analytics';

/**
 * Deterministic Mulberry32 PRNG so demo data is 100% consistent across reloads and tests.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SubjectTaskPool {
  subjectId: string;
  projectId: string;
  projectName: string;
  tags: string[];
  tasks: { title: string; note: string }[];
}

const TASK_POOLS: SubjectTaskPool[] = [
  {
    subjectId: 'combined-maths',
    projectId: 'proj-maths',
    projectName: 'Combined Maths',
    tags: ['maths', 'combined-maths'],
    tasks: [
      { title: 'Integration by Parts & Partial Fractions', note: '2019–2023 Past Paper structured questions' },
      { title: 'Applied Maths: Projectile & Relative Motion', note: 'Worked 6 essay problems from model paper' },
      { title: 'Complex Numbers & Argand Diagrams', note: 'De Moivre theorem derivations and loci' },
      { title: 'Differential Equations Practice', note: 'First-order linear and separable forms' },
      { title: 'Vectors & 3D Geometry Drill', note: 'Scalar and vector product proofs' },
      { title: 'Matrices, Determinants & Linear Systems', note: 'Timed 50-minute exam drill' },
      { title: 'Statics: Frameworks & Friction', note: 'Equilibrium moments problem set' },
      { title: 'Trigonometric Identities & Limits', note: 'Pure Maths Part A speed round' },
    ],
  },
  {
    subjectId: 'physics',
    projectId: 'proj-physics',
    projectName: 'Physics',
    tags: ['physics', 'phy'],
    tasks: [
      { title: 'Electromagnetism & Faraday Induction', note: 'Flux linkage & Lenz law past paper MCQs' },
      { title: 'Waves, Interference & Diffraction', note: 'Young double-slit and grating numericals' },
      { title: 'Rotational Mechanics & Moment of Inertia', note: 'Angular momentum conservation problems' },
      { title: 'Electrostatic & Gravitational Fields', note: 'Gauss law & field potential diagrams' },
      { title: 'Thermodynamics & Ideal Gas Laws', note: 'PV diagrams and Carnot efficiency review' },
      { title: 'Electronics: Op-Amps & Transistors', note: 'Circuit analysis and gain derivations' },
      { title: 'Modern Physics & Photoelectric Effect', note: 'Nuclear decay half-life exercises' },
      { title: 'Geometrical Optics & Lenses', note: 'Ray tracing and spectrometer practical notes' },
    ],
  },
  {
    subjectId: 'ict',
    projectId: 'proj-ict',
    projectName: 'ICT',
    tags: ['ict', 'cs'],
    tasks: [
      { title: 'SQL Normalization & Complex Joins', note: '3NF schema design and aggregate queries' },
      { title: 'Python Data Structures & Recursion', note: 'Graph traversal and sorting implementations' },
      { title: 'Computer Networking & Subnetting', note: 'CIDR calculation and OSI layer drills' },
      { title: 'Boolean Algebra & Karnaugh Maps', note: '4-variable SOP minimization and logic gates' },
      { title: 'Operating Systems & Process Scheduling', note: 'Round-robin and deadlock avoidance notes' },
      { title: 'Web Systems: REST APIs & Auth Flows', note: 'HTTP status codes, headers, and caching' },
      { title: 'Structured Systems Analysis & ER Diagrams', note: 'Past paper database modeling section' },
    ],
  },
  {
    subjectId: 'general',
    projectId: 'proj-general',
    projectName: 'Study Planning',
    tags: ['general', 'study'],
    tasks: [
      { title: 'Weekly Revision Timetable & Backlog Review', note: 'Prioritized weak topics for upcoming mock' },
      { title: 'Spaced Repetition Formula Flashcards', note: 'Reviewed 85 active cards across all subjects' },
      { title: 'Timed Full-Paper Error Log Review', note: 'Cataloged calculation slips and conceptual gaps' },
      { title: 'Active Recall Summary Sheet', note: 'Condensed key theorems into one-page reference' },
    ],
  },
];

// Realistic duration distribution yielding ~68% Deep Work Ratio (>=45m)
const DURATION_CHOICES = [20, 25, 25, 30, 35, 45, 50, 50, 55, 60, 65, 75, 90, 95];

// Weighted start hours creating a clear evening peak (7 PM - 11 PM) + secondary morning window (6 AM - 10 AM)
const START_HOUR_WEIGHTS: number[] = [
  1, 0, 0, 0, 0, 2, // 00-05
  5, 7, 6, 5, 4, 3, // 06-11
  2, 3, 4, 5, 6, 6, // 12-17
  8, 12, 16, 18, 15, 7, // 18-23
];

function pickWeightedHour(rng: () => number): number {
  const total = START_HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let h = 0; h < 24; h++) {
    r -= START_HOUR_WEIGHTS[h];
    if (r <= 0) return h;
  }
  return 20;
}

function pickSubjectIndex(rng: () => number, dayOfWeek: number): number {
  // Slight weekday focus on Combined Maths & Physics, more ICT on Tue/Thu/Sat
  const r = rng();
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    if (r < 0.36) return 0; // Combined Maths
    if (r < 0.68) return 1; // Physics
    if (r < 0.90) return 2; // ICT
    return 3; // General
  }
  if (r < 0.39) return 0; // Combined Maths
  if (r < 0.71) return 1; // Physics
  if (r < 0.91) return 2; // ICT
  return 3; // General
}

/**
 * Generates ~6 months (185 days) of realistic, deterministic focus sessions ending on `anchorDate`.
 */
export function generateDemoSessions(
  anchorDate: Date = new Date(),
  rules?: SubjectRule[]
): FocusSession[] {
  const rng = createRng(20261119);
  const today = startOfLocalDay(anchorDate);
  const totalDays = 185;
  const sessions: FocusSession[] = [];
  let seq = 1;

  // Ensure a strong, realistic current streak (14 days ending today)
  const guaranteedStreakDays = 14;

  for (let offset = totalDays - 1; offset >= 0; offset--) {
    const dayDate = addLocalDays(today, -offset);
    const dow = (dayDate.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
    const isToday = offset === 0;
    const isInCurrentStreak = offset < guaranteedStreakDays;

    // Realistic rest days (~14% chance outside current streak; Fridays slightly lighter, Saturdays/Sundays stronger)
    if (!isInCurrentStreak) {
      const skipChance = dow === 4 ? 0.24 : dow === 2 ? 0.16 : 0.11;
      if (rng() < skipChance) continue;
    }

    // Number of sessions per active day based on day-of-week profile
    let baseCount = 3;
    if (dow === 5 || dow === 6) baseCount = 4; // Sat/Sun high focus
    else if (dow === 0 || dow === 1) baseCount = 3; // Mon/Tue solid
    else if (dow === 4) baseCount = 2; // Fri lighter

    let sessionCount = Math.max(1, baseCount + Math.floor(rng() * 3) - 1);
    if (isInCurrentStreak && sessionCount < 3) sessionCount = 3;
    if (isToday) sessionCount = 3;

    // Keep sessions non-overlapping on the same day
    const usedHours = new Set<number>();
    let dayMinutesAccum = 0;

    for (let i = 0; i < sessionCount; i++) {
      let hour = pickWeightedHour(rng);
      if (isToday) {
        // Keep today's sessions in the morning/earlier than current local hour if possible,
        // or nicely spaced so they look realistic at any hour.
        const maxHour = Math.max(9, Math.min(22, anchorDate.getHours()));
        const candidateHours = [7, 9, 14, 17, 19, 20, 21].filter((h) => h <= maxHour);
        hour = candidateHours[i % Math.max(1, candidateHours.length)] ?? (8 + i * 2);
      } else {
        let attempts = 0;
        while (usedHours.has(hour) && attempts < 10) {
          hour = (hour + 2) % 24;
          attempts++;
        }
      }
      usedHours.add(hour);

      const minuteOffset = Math.floor(rng() * 35);
      let duration = DURATION_CHOICES[Math.floor(rng() * DURATION_CHOICES.length)];

      // Guarantee streak days hit >= 120 minutes total
      if (isInCurrentStreak && i === sessionCount - 1 && dayMinutesAccum + duration < 130) {
        duration = Math.max(duration, 135 - dayMinutesAccum);
        if (duration > 95) duration = 90;
      }

      const start = new Date(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate(),
        hour,
        minuteOffset,
        0,
        0
      );
      const end = new Date(start.getTime() + duration * 60_000);

      const poolIdx = pickSubjectIndex(rng, dow);
      const pool = TASK_POOLS[poolIdx];
      const task = pool.tasks[Math.floor(rng() * pool.tasks.length)];

      // Respect custom subject rules if renamed/present
      const matchedRuleId =
        rules?.find((r) => r.id === pool.subjectId)?.id ?? pool.subjectId;

      sessions.push({
        id: `demo-${seq++}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationMinutes: duration,
        title: task.title,
        note: task.note,
        projectId: pool.projectId,
        projectName: pool.projectName,
        tags: pool.tags,
        subjectId: matchedRuleId,
        source: 'demo',
      });

      dayMinutesAccum += duration;
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}
