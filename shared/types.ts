export type GenerationMode = "matrix" | "perlin" | "uniform" | "gaussian" | "worker52" | "art";

export type ArtPattern = "heart" | "wave" | "mountain" | "smile";

export interface GeneratePlanRequest {
  mode: GenerationMode;
  from: string;
  to: string;
  maxCommitsPerDay: number;
  seed?: string;
  matrix?: number[][];
  artPattern?: ArtPattern;
}

export interface PlannedDay {
  date: string;
  commits: number;
  intensity: number;
  dayOfWeek: number;
  weekIndex: number;
}

export interface PlanStats {
  totalCommits: number;
  activeDays: number;
  weeks: number;
}

export interface PlanResult {
  days: PlannedDay[];
  stats: PlanStats;
}

export interface ExecutePlanRequest {
  dryRun?: boolean;
  request: GeneratePlanRequest;
}

export interface ExecutePlanResult {
  ok: boolean;
  dryRun: boolean;
  beforeSha: string;
  branch: string;
  pushed: boolean;
  committedCount: number;
  totalCommitsPlanned: number;
  message: string;
}
