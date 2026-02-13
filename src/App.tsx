import { useEffect, useMemo, useState } from "react";
import { createDefaultMatrix } from "../shared/generators";
import type {
  ArtPattern,
  ExecutePlanRequest,
  ExecutePlanResult,
  GeneratePlanRequest,
  GenerationMode,
  PlanResult
} from "../shared/types";

const MODE_LABELS: Record<GenerationMode, string> = {
  matrix: "Matrix Painting",
  perlin: "Perlin",
  uniform: "Uniform",
  gaussian: "Gaussian",
  worker52: "Worker 5/2 (realistic)",
  art: "Art Patterns"
};

const ART_PATTERNS: ArtPattern[] = ["heart", "wave", "mountain", "smile"];

const todayIso = new Date().toISOString().slice(0, 10);
const yearAgoIso = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const levelColor = (value: number) => {
  if (value === 0) return "bg-slate-100";
  if (value === 1) return "bg-emerald-200";
  if (value === 2) return "bg-emerald-400";
  if (value === 3) return "bg-emerald-500";
  return "bg-emerald-700";
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function App() {
  const [mode, setMode] = useState<GenerationMode>("matrix");
  const [from, setFrom] = useState(yearAgoIso);
  const [to, setTo] = useState(todayIso);
  const [maxCommitsPerDay, setMaxCommitsPerDay] = useState(6);
  const [seed, setSeed] = useState("arttribute-v1");
  const [artPattern, setArtPattern] = useState<ArtPattern>("heart");
  const [matrix, setMatrix] = useState<number[][]>(() => createDefaultMatrix(53));
  const [brushLevel, setBrushLevel] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<"paint" | "erase">("paint");
  const [preview, setPreview] = useState<PlanResult | null>(null);
  const [lastResult, setLastResult] = useState<ExecutePlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo<GeneratePlanRequest>(() => {
    return {
      mode,
      from,
      to,
      maxCommitsPerDay,
      seed,
      matrix,
      artPattern
    };
  }, [artPattern, from, matrix, maxCommitsPerDay, mode, seed, to]);

  const toggleCell = (row: number, col: number) => {
    setMatrix((current) =>
      current.map((cells, rowIndex) =>
        rowIndex === row
          ? cells.map((value, colIndex) => (colIndex === col ? (value + 1) % 5 : value))
          : cells
      )
    );
  };

  const paintCell = (row: number, col: number) => {
    const targetLevel = drawMode === "erase" ? 0 : brushLevel;
    setMatrix((current) =>
      current.map((cells, rowIndex) =>
        rowIndex === row ? cells.map((value, colIndex) => (colIndex === col ? targetLevel : value)) : cells
      )
    );
  };

  const clearMatrix = () => {
    setMatrix(createDefaultMatrix(53));
  };

  const fillMatrix = (level: number) => {
    setMatrix(Array.from({ length: 7 }, () => Array.from({ length: 53 }, () => level)));
  };

  useEffect(() => {
    const stopDrawing = () => setIsDrawing(false);
    window.addEventListener("mouseup", stopDrawing);
    return () => window.removeEventListener("mouseup", stopDrawing);
  }, []);

  const fetchJson = async <T,>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error ?? "Request failed");
    }

    return payload as T;
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchJson<PlanResult>("/api/plan", request);
      setPreview(result);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not generate preview");
    } finally {
      setBusy(false);
    }
  };

  const handleExecute = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    setLastResult(null);

    try {
      const payload: ExecutePlanRequest = {
        dryRun,
        request
      };

      const result = await fetchJson<ExecutePlanResult>("/api/execute", payload);
      setLastResult(result);
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "Could not execute plan");
    } finally {
      setBusy(false);
    }
  };

  const previewGrid = useMemo(() => {
    if (!preview) return [] as number[][];
    const rows = Array.from({ length: 7 }, () => Array.from({ length: preview.stats.weeks }, () => 0));

    for (const day of preview.days) {
      rows[day.dayOfWeek][day.weekIndex] = day.commits;
    }

    return rows;
  }, [preview]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">ArtTribute</h1>
          <p className="mt-2 text-slate-600">
            Create artistic commit schedules for learning and visual experiments.
            The app executes commits in your repository default branch.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Settings</h2>

            <label className="block text-sm font-medium text-slate-700">
              Mode
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                value={mode}
                onChange={(event) => setMode(event.target.value as GenerationMode)}
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-700">
                From
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                To
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-700">
                Max commits/day
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  type="number"
                  min={1}
                  max={30}
                  value={maxCommitsPerDay}
                  onChange={(event) => setMaxCommitsPerDay(Number(event.target.value))}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Seed
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  type="text"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
            </div>

            {mode === "art" && (
              <label className="block text-sm font-medium text-slate-700">
                Pattern
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  value={artPattern}
                  onChange={(event) => setArtPattern(event.target.value as ArtPattern)}
                >
                  {ART_PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Repository source: current server working directory. Target branch: default branch.
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50" disabled={busy} onClick={handlePreview}>
                Preview
              </button>
              <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50" disabled={busy} onClick={() => void handleExecute(true)}>
                Dry Run
              </button>
              <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={busy} onClick={() => void handleExecute(false)}>
                Execute
              </button>
            </div>

            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          </section>

          <section className="space-y-6">
            {(mode === "matrix" || mode === "art") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Matrix Painter</h2>
                  <span className="text-sm text-slate-500">Click cells to cycle level 0 → 4</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brush</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <button
                      key={level}
                      className={`h-7 w-7 rounded border ${levelColor(level)} ${brushLevel === level ? "ring-2 ring-sky-400" : ""}`}
                      title={`Set brush level ${level}`}
                      onClick={() => {
                        setBrushLevel(level);
                        if (level === 0) {
                          setDrawMode("erase");
                        } else if (drawMode === "erase") {
                          setDrawMode("paint");
                        }
                      }}
                    />
                  ))}
                  <button
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${drawMode === "paint" ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-700"}`}
                    onClick={() => setDrawMode("paint")}
                  >
                    Paint
                  </button>
                  <button
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${drawMode === "erase" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-700"}`}
                    onClick={() => setDrawMode("erase")}
                  >
                    Erase
                  </button>
                  <button className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700" onClick={clearMatrix}>
                    Clear
                  </button>
                  <button className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700" onClick={() => fillMatrix(1)}>
                    Fill low
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
                  <div className="mb-2 grid min-w-[780px] grid-cols-[32px_repeat(53,minmax(0,1fr))] gap-1 text-[10px] text-slate-400">
                    <div />
                    {Array.from({ length: 53 }, (_, week) => (
                      <div key={week} className="text-center">
                        {week % 4 === 0 ? week + 1 : ""}
                      </div>
                    ))}
                  </div>
                  <div className="grid min-w-[780px] grid-rows-7 gap-1">
                    {matrix.map((row, rowIndex) => (
                      <div key={rowIndex} className="grid grid-cols-[32px_repeat(53,minmax(0,1fr))] items-center gap-1">
                        <span className="text-[11px] text-slate-500">{WEEK_DAYS[rowIndex]}</span>
                        {row.map((value, colIndex) => (
                          <button
                            key={`${rowIndex}-${colIndex}`}
                            className={`h-3.5 w-3.5 rounded-sm border border-slate-200 ${levelColor(value)}`}
                            title={`Day ${WEEK_DAYS[rowIndex]}, week ${colIndex + 1}, level ${value}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (event.shiftKey) {
                                toggleCell(rowIndex, colIndex);
                                return;
                              }
                              setIsDrawing(true);
                              paintCell(rowIndex, colIndex);
                            }}
                            onMouseEnter={() => {
                              if (isDrawing) {
                                paintCell(rowIndex, colIndex);
                              }
                            }}
                            onClick={(event) => {
                              if (event.shiftKey) {
                                toggleCell(rowIndex, colIndex);
                              }
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Contribution Preview</h2>
              {!preview && <p className="text-sm text-slate-500">Click Preview to build the contribution map.</p>}
              {preview && (
                <>
                  <p className="mb-3 text-sm text-slate-600">
                    Total commits: <b>{preview.stats.totalCommits}</b> · Active days: <b>{preview.stats.activeDays}</b> · Weeks: <b>{preview.stats.weeks}</b>
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid min-w-[780px] grid-rows-7 gap-1">
                      {previewGrid.map((row, rowIndex) => (
                        <div key={rowIndex} className="grid grid-cols-[32px_repeat(var(--weeks),minmax(0,1fr))] items-center gap-1" style={{ ["--weeks" as string]: preview.stats.weeks }}>
                          <span className="text-[11px] text-slate-500">{WEEK_DAYS[rowIndex]}</span>
                          {row.map((commits, colIndex) => {
                            const level = commits === 0 ? 0 : Math.min(4, Math.ceil((commits / Math.max(maxCommitsPerDay, 1)) * 4));
                            return <div key={`${rowIndex}-${colIndex}`} className={`h-3.5 w-3.5 rounded-sm border border-slate-200 ${levelColor(level)}`} title={`${commits} commits`} />;
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {lastResult && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
                <h3 className="mb-3 text-lg font-semibold">Execution Result</h3>
                <ul className="space-y-1 text-slate-700">
                  <li>Run mode: {lastResult.dryRun ? "Dry run" : "Real execution"}</li>
                  <li>Branch: {lastResult.branch}</li>
                  <li>Base SHA: <span className="break-all">{lastResult.beforeSha}</span></li>
                  <li>Planned commits: {lastResult.totalCommitsPlanned}</li>
                  <li>Created commits: {lastResult.committedCount}</li>
                  <li>Pushed: {lastResult.pushed ? "Yes" : "No"}</li>
                  <li>{lastResult.message}</li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
