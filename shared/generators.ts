import type { ArtPattern, GeneratePlanRequest, PlannedDay, PlanResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addUtcDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const diffUtcDays = (left: Date, right: Date) => Math.round((left.getTime() - right.getTime()) / DAY_MS);

const toIsoDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return startOfUtcDay(date);
};

const hashSeed = (seed: string) => {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
};

const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const makeRng = (seedInput?: string) => {
  const base = seedInput?.trim() || `seed-${Date.now()}`;
  const seed = hashSeed(base)();
  return mulberry32(seed);
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number) => a + t * (b - a);

const oneDimNoise = (x: number, rng: () => number) => {
  const x0 = Math.floor(x);
  const x1 = x0 + 1;
  const g0 = rng() * 2 - 1;
  const g1 = rng() * 2 - 1;
  const t = x - x0;
  const n0 = g0 * (x - x0);
  const n1 = g1 * (x - x1);
  return lerp(n0, n1, fade(t));
};

const ART_PATTERNS: Record<ArtPattern, number[][]> = {
  heart: [
    [0, 0, 4, 4, 0, 4, 4, 0, 0],
    [0, 4, 4, 4, 4, 4, 4, 4, 0],
    [4, 4, 4, 4, 4, 4, 4, 4, 4],
    [0, 4, 4, 4, 4, 4, 4, 4, 0],
    [0, 0, 4, 4, 4, 4, 4, 0, 0],
    [0, 0, 0, 4, 4, 4, 0, 0, 0],
    [0, 0, 0, 0, 4, 0, 0, 0, 0]
  ],
  wave: [
    [0, 1, 2, 3, 4, 3, 2, 1, 0],
    [1, 2, 3, 4, 3, 2, 1, 0, 0],
    [2, 3, 4, 3, 2, 1, 0, 0, 1],
    [3, 4, 3, 2, 1, 0, 0, 1, 2],
    [4, 3, 2, 1, 0, 0, 1, 2, 3],
    [3, 2, 1, 0, 0, 1, 2, 3, 4],
    [2, 1, 0, 0, 1, 2, 3, 4, 3]
  ],
  mountain: [
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 1, 2, 3, 2, 1, 0, 0],
    [0, 1, 2, 3, 4, 3, 2, 1, 0],
    [1, 2, 3, 4, 4, 4, 3, 2, 1],
    [2, 3, 4, 4, 4, 4, 4, 3, 2],
    [3, 4, 4, 4, 4, 4, 4, 4, 3]
  ],
  smile: [
    [0, 0, 4, 4, 0, 0, 0, 4, 4, 0, 0],
    [0, 0, 4, 4, 0, 0, 0, 4, 4, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
    [0, 4, 0, 0, 0, 0, 0, 0, 0, 4, 0],
    [0, 0, 4, 4, 4, 4, 4, 4, 4, 0, 0],
    [0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0]
  ]
};

const intensityToCommits = (intensity: number, maxCommits: number) => {
  if (intensity <= 0.1) {
    return 0;
  }
  const normalized = clamp(intensity, 0, 1);
  return clamp(Math.round(normalized * maxCommits), 0, maxCommits);
};

const sundayOf = (date: Date) => addUtcDays(date, -date.getUTCDay());

const matrixIntensity = (matrix: number[][], row: number, weekIndex: number) => {
  const rowValues = matrix[row];
  if (!rowValues) {
    return 0;
  }
  const raw = rowValues[weekIndex] ?? 0;
  return clamp(raw / 4, 0, 1);
};

const artIntensity = (pattern: ArtPattern, row: number, weekIndex: number, totalWeeks: number) => {
  const matrix = ART_PATTERNS[pattern] ?? ART_PATTERNS.heart;
  const patternHeight = matrix.length;
  const patternWidth = Math.max(...matrix.map((patternRow) => patternRow.length));

  const rowOffset = Math.floor((7 - patternHeight) / 2);
  const colOffset = Math.floor((totalWeeks - patternWidth) / 2);

  const localRow = row - rowOffset;
  const localCol = weekIndex - colOffset;

  if (localRow < 0 || localRow >= patternHeight || localCol < 0 || localCol >= patternWidth) {
    return 0;
  }

  const patternRow = matrix[localRow];
  const value = patternRow[localCol] ?? 0;
  return clamp(value / 4, 0, 1);
};

const gaussian = (x: number, mean: number, sigma: number) => {
  const variance = sigma * sigma;
  return Math.exp(-((x - mean) ** 2) / (2 * variance));
};

type Worker52Profile = {
  vacationDays: Set<string>;
  sickDays: Set<string>;
  lowOutputDays: Set<string>;
  weeklyLoad: number[];
};

const toIsoDateKey = (date: Date) => toIsoDate(date);

const pickWeekday = (weekStart: Date, rng: () => number) => {
  const monday = addUtcDays(weekStart, 1);
  return addUtcDays(monday, Math.floor(rng() * 5));
};

const addVacationBlock = (set: Set<string>, start: Date, length: number) => {
  let date = start;
  let added = 0;

  while (added < length) {
    const dow = date.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      set.add(toIsoDateKey(date));
      added += 1;
    }
    date = addUtcDays(date, 1);
  }
};

const createWorker52Profile = (from: Date, totalDays: number, rng: () => number): Worker52Profile => {
  const vacationDays = new Set<string>();
  const sickDays = new Set<string>();
  const lowOutputDays = new Set<string>();
  const weeks = Math.max(1, Math.ceil(totalDays / 7));

  const yearlyFactor = Math.max(1, totalDays / 365);
  const vacationBlocks = Math.max(1, Math.round((1 + Math.floor(rng() * 2)) * yearlyFactor));
  for (let i = 0; i < vacationBlocks; i += 1) {
    const startOffset = Math.floor(rng() * Math.max(1, totalDays - 14));
    const start = addUtcDays(from, startOffset);
    const length = 5 + Math.floor(rng() * 6);
    addVacationBlock(vacationDays, start, length);
  }

  const estimatedSickDays = Math.max(1, Math.round(4 * yearlyFactor));
  for (let i = 0; i < estimatedSickDays; i += 1) {
    const week = Math.floor(rng() * weeks);
    const weekStart = addUtcDays(from, week * 7 - from.getUTCDay());
    sickDays.add(toIsoDateKey(pickWeekday(weekStart, rng)));
  }

  const lowDays = Math.max(2, Math.round(weeks * 0.9));
  for (let i = 0; i < lowDays; i += 1) {
    const week = Math.floor(rng() * weeks);
    const weekStart = addUtcDays(from, week * 7 - from.getUTCDay());
    lowOutputDays.add(toIsoDateKey(pickWeekday(weekStart, rng)));
  }

  const weeklyLoad = Array.from({ length: weeks }, (_, week) => {
    const seasonal = 0.72 + 0.2 * Math.sin((week / Math.max(weeks, 1)) * Math.PI * 3);
    const randomFactor = 0.75 + rng() * 0.35;
    return clamp(seasonal * randomFactor, 0.45, 1);
  });

  return { vacationDays, sickDays, lowOutputDays, weeklyLoad };
};

const worker52Intensity = (
  date: Date,
  weekIndex: number,
  totalWeeks: number,
  profile: Worker52Profile,
  rng: () => number
) => {
  const key = toIsoDateKey(date);
  const dayOfWeek = date.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (profile.vacationDays.has(key)) {
    return rng() < 0.08 ? 0.08 + rng() * 0.12 : 0;
  }

  if (profile.sickDays.has(key)) {
    return rng() < 0.2 ? 0.08 + rng() * 0.2 : 0;
  }

  if (isWeekend) {
    return rng() < 0.16 ? 0.1 + rng() * 0.22 : 0;
  }

  const normalizedWeek = Math.max(0, Math.min(profile.weeklyLoad.length - 1, weekIndex));
  const base = profile.weeklyLoad[normalizedWeek] ?? 0.72;
  const mondayBoost = dayOfWeek === 1 ? 1.05 : 1;
  const fridayDip = dayOfWeek === 5 ? 0.9 : 1;
  const lowDayPenalty = profile.lowOutputDays.has(key) ? 0.55 : 1;
  const focusNoise = 0.82 + rng() * 0.28;
  const fatigue = 1 - (weekIndex / Math.max(totalWeeks, 1)) * 0.06;

  return clamp(base * mondayBoost * fridayDip * lowDayPenalty * focusNoise * fatigue, 0, 1);
};

const buildIntensity = (
  request: GeneratePlanRequest,
  index: number,
  total: number,
  dayOfWeek: number,
  weekIndex: number,
  rng: () => number,
  date: Date,
  workerProfile?: Worker52Profile
) => {
  switch (request.mode) {
    case "uniform":
      return 0.2 + rng() * 0.8;
    case "gaussian": {
      const center = (total - 1) / 2;
      const sigma = Math.max(1, total / 5);
      const wave = gaussian(index, center, sigma);
      return clamp(wave * (0.5 + rng() * 0.5), 0, 1);
    }
    case "perlin": {
      const noise = oneDimNoise(index / 6, rng);
      return clamp((noise + 1) / 2, 0, 1);
    }
    case "worker52": {
      return worker52Intensity(date, weekIndex, Math.max(1, Math.ceil(total / 7)), workerProfile!, rng);
    }
    case "matrix":
      return matrixIntensity(request.matrix ?? [], dayOfWeek, weekIndex);
    case "art":
      return artIntensity(request.artPattern ?? "heart", dayOfWeek, weekIndex, Math.max(1, Math.ceil(total / 7)));
    default:
      return rng();
  }
};

export const createDefaultMatrix = (weeks = 53) => {
  return Array.from({ length: 7 }, () => Array.from({ length: weeks }, () => 0));
};

export const generateCommitPlan = (request: GeneratePlanRequest): PlanResult => {
  const from = parseDate(request.from);
  const to = parseDate(request.to);

  if (to.getTime() < from.getTime()) {
    throw new Error("End date cannot be earlier than start date");
  }

  const maxCommitsPerDay = clamp(Math.round(request.maxCommitsPerDay || 4), 1, 30);
  const totalDays = diffUtcDays(to, from) + 1;
  const rng = makeRng(request.seed);
  const startSunday = sundayOf(from);
  const workerProfile = request.mode === "worker52" ? createWorker52Profile(from, totalDays, rng) : undefined;

  const days: PlannedDay[] = [];

  for (let index = 0; index < totalDays; index += 1) {
    const date = addUtcDays(from, index);
    const dayOfWeek = date.getUTCDay();
    const weekIndex = Math.floor(diffUtcDays(date, startSunday) / 7);

    const intensity = buildIntensity(request, index, totalDays, dayOfWeek, weekIndex, rng, date, workerProfile);
    const commits = intensityToCommits(intensity, maxCommitsPerDay);

    days.push({
      date: toIsoDate(date),
      commits,
      intensity,
      dayOfWeek,
      weekIndex
    });
  }

  const totalCommits = days.reduce((sum, day) => sum + day.commits, 0);
  const activeDays = days.reduce((sum, day) => sum + (day.commits > 0 ? 1 : 0), 0);
  const weeks = Math.max(...days.map((day) => day.weekIndex), 0) + 1;

  return {
    days,
    stats: {
      totalCommits,
      activeDays,
      weeks
    }
  };
};
