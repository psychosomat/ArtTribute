import { useEffect, useMemo, useState } from "react";
import { createDefaultMatrix, generateCommitPlan } from "../shared/generators";
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

const MODE_DESCRIPTIONS: Record<GenerationMode, string> = {
  matrix: "Manual layout with direct intensity control.",
  perlin: "Smooth organic noise for softer silhouettes.",
  uniform: "Even density for quick baseline tests.",
  gaussian: "Centralized distribution with natural falloff.",
  worker52: "Human-like rhythm for realistic histories.",
  art: "Preset shapes that can still be refined by hand."
};

const ART_PATTERNS: ArtPattern[] = ["heart", "wave", "mountain", "smile"];
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEVEL_STYLES = [
  "border-[#d6d6c8] bg-[#f4f1e8]",
  "border-[#d1dcc6] bg-[#dce8ce]",
  "border-[#a8c991] bg-[#b8d49d]",
  "border-[#70916d] bg-[#7da07b]",
  "border-[#3e5746] bg-[#3f5b47]"
] as const;

const todayIso = new Date().toISOString().slice(0, 10);
const yearAgoIso = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const getLevelStyle = (value: number) => LEVEL_STYLES[Math.max(0, Math.min(LEVEL_STYLES.length - 1, value))];

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

  const activeMatrixDays = useMemo(
    () => matrix.reduce((total, row) => total + row.filter((value) => value > 0).length, 0),
    [matrix]
  );

  const averageIntensity = useMemo(() => {
    const total = matrix.reduce((sum, row) => sum + row.reduce((rowSum, value) => rowSum + value, 0), 0);
    return (total / (matrix.length * matrix[0].length)).toFixed(1);
  }, [matrix]);

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

  const sourcePlan = useMemo(() => {
    try {
      return generateCommitPlan(request);
    } catch {
      return null;
    }
  }, [request]);

  const sourceGrid = useMemo(() => {
    if (!sourcePlan) return [] as number[][];
    const rows = Array.from({ length: 7 }, () => Array.from({ length: sourcePlan.stats.weeks }, () => 0));

    for (const day of sourcePlan.days) {
      rows[day.dayOfWeek][day.weekIndex] = day.commits;
    }

    return rows;
  }, [sourcePlan]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f7f4ed_0%,#f3efe6_40%,#ece7dd_100%)] text-[#1f2721]">
      <div className="mx-auto max-w-9xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(244,241,232,0.96),rgba(232,228,215,0.92))] p-6 shadow-[0_30px_80px_rgba(44,52,37,0.08)] sm:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(125,160,123,0.22),transparent_70%)] lg:block" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_320px] lg:items-end">
            <div className="space-y-5">
              <div className="inline-flex items-center rounded-full border border-[#d3d0c4] bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5a665a]">
                Github Contribution Composer
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="font-['Manrope',sans-serif] text-4xl font-semibold tracking-[-0.04em] text-[#1f2721] sm:text-5xl">
                  Build commit art with a calmer, more precise workspace.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-[#516050] sm:text-base">
                  ArtTribute maps generated commits onto the Github activity graph. This interface is tuned for planning,
                  editing, and validating patterns before anything touches your default branch.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6c7869]">Range</div>
                  <div className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold">{preview?.stats.weeks ?? 53} wk</div>
                  <p className="mt-1 text-sm text-[#5d685c]">One-year canvas with weekly structure.</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6c7869]">Editor</div>
                  <div className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold">{activeMatrixDays}</div>
                  <p className="mt-1 text-sm text-[#5d685c]">Cells currently carrying non-zero intensity.</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6c7869]">Intensity</div>
                  <div className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold">{averageIntensity}</div>
                  <p className="mt-1 text-sm text-[#5d685c]">Average contribution level across the grid.</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#d8d3c6] bg-[#222c25] p-5 text-[#f3efe6] shadow-[0_20px_50px_rgba(31,39,33,0.16)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#bcc7b8]">Current Mode</div>
              <div className="mt-3 font-['Manrope',sans-serif] text-3xl font-semibold tracking-[-0.04em]">
                {MODE_LABELS[mode]}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#ccd5ca]">{MODE_DESCRIPTIONS[mode]}</p>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#d8e0d5]">
                Preview before execution. Use dry run when validating branch state and commit volume.
              </div>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="space-y-5 rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_24px_60px_rgba(44,52,37,0.07)] backdrop-blur sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#71806d]">Control Panel</p>
                <h2 className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold tracking-[-0.03em] text-[#1f2721]">
                  Generation settings
                </h2>
              </div>
              <div className="rounded-full border border-[#d9d4c8] bg-[#f4f1e8] px-3 py-1 text-xs font-semibold text-[#596657]">
                {busy ? "Working..." : "Ready"}
              </div>
            </div>

            <label className="block text-sm font-medium text-[#42503f]">
              Mode
              <select
                className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
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

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="text-sm font-medium text-[#42503f]">
                From
                <input
                  className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-[#42503f]">
                To
                <input
                  className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="text-sm font-medium text-[#42503f]">
                Max commits/day
                <input
                  className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
                  type="number"
                  min={1}
                  max={30}
                  value={maxCommitsPerDay}
                  onChange={(event) => setMaxCommitsPerDay(Number(event.target.value))}
                />
              </label>
              <label className="text-sm font-medium text-[#42503f]">
                Seed
                <input
                  className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
                  type="text"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
            </div>

            {mode === "art" && (
              <label className="block text-sm font-medium text-[#42503f]">
                Pattern
                <select
                  className="mt-2 w-full rounded-2xl border border-[#d7d2c5] bg-[#faf7f0] px-4 py-3 text-[#1f2721] outline-none transition focus:border-[#7da07b] focus:ring-2 focus:ring-[#d8e6d3]"
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

            <div className="rounded-[24px] border border-[#ddd8cb] bg-[linear-gradient(180deg,#faf7f1,#f2ede3)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6d7969]">Execution context</div>
              <p className="mt-2 text-sm leading-6 text-[#556253]">
                Repository source: current server working directory. Target branch: repository default branch.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <button
                className="rounded-2xl bg-[#2e4133] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#243428] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={handlePreview}
              >
                Preview
              </button>
              <button
                className="rounded-2xl bg-[#a36b37] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#8b5a2d] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => void handleExecute(true)}
              >
                Dry Run
              </button>
              <button
                className="rounded-2xl bg-[#6e8a68] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5d7657] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => void handleExecute(false)}
              >
                Execute
              </button>
            </div>

            {error && (
              <p className="rounded-2xl border border-[#e7c4be] bg-[#fbefeb] p-4 text-sm text-[#9f4a3d]">{error}</p>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_24px_60px_rgba(44,52,37,0.07)] backdrop-blur sm:p-6">
              {mode === "matrix" ? (
                <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#71806d]">Editor</p>
                    <h2 className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold tracking-[-0.03em] text-[#1f2721]">
                      Matrix painter
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#566354]">
                      Drag to paint. Hold <span className="font-semibold text-[#314531]">Shift</span> to cycle a single cell from
                      level 0 to 4.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4].map((level) => (
                      <button
                        key={level}
                        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                          brushLevel === level && drawMode !== "erase"
                            ? "border-[#6e8a68] bg-[#edf4ea] text-[#28402a]"
                            : "border-[#d9d3c7] bg-[#f8f4eb] text-[#566354]"
                        }`}
                        onClick={() => {
                          setBrushLevel(level);
                          if (level === 0) {
                            setDrawMode("erase");
                          } else if (drawMode === "erase") {
                            setDrawMode("paint");
                          }
                        }}
                      >
                        <span className={`h-4 w-4 rounded-full border ${getLevelStyle(level)}`} />
                        L{level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[24px] border border-[#dcd7ca] bg-[linear-gradient(180deg,#faf7f1,#f3eee5)] p-4">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <button
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          drawMode === "paint" ? "bg-[#2f4333] text-white" : "bg-white text-[#4e5c4c]"
                        }`}
                        onClick={() => setDrawMode("paint")}
                      >
                        Paint
                      </button>
                      <button
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          drawMode === "erase" ? "bg-[#a45749] text-white" : "bg-white text-[#4e5c4c]"
                        }`}
                        onClick={() => setDrawMode("erase")}
                      >
                        Erase
                      </button>
                      <button
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4e5c4c] transition hover:bg-[#f4f0e7]"
                        onClick={clearMatrix}
                      >
                        Clear
                      </button>
                      <button
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4e5c4c] transition hover:bg-[#f4f0e7]"
                        onClick={() => fillMatrix(1)}
                      >
                        Fill low
                      </button>
                    </div>

                    <div className="rounded-[20px] border border-[#d5d0c4] bg-[#f7f4ec] p-3 select-none sm:p-4">
                      <div className="mb-2 grid grid-cols-[28px_repeat(53,minmax(0,1fr))] gap-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-[#93a08f] sm:mb-3 sm:grid-cols-[40px_repeat(53,minmax(0,1fr))] sm:gap-1 sm:text-[10px] sm:tracking-[0.18em]">
                        <div />
                        {Array.from({ length: 53 }, (_, week) => (
                          <div key={week} className="text-center">
                            {week % 4 === 0 ? week + 1 : ""}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-rows-7 gap-0.5 sm:gap-1.5">
                        {matrix.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            className="grid grid-cols-[28px_repeat(53,minmax(0,1fr))] items-center gap-0.5 sm:grid-cols-[40px_repeat(53,minmax(0,1fr))] sm:gap-1.5"
                          >
                            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#677364] sm:text-[11px] sm:tracking-[0.12em]">
                              {WEEK_DAYS[rowIndex]}
                            </span>
                            {row.map((value, colIndex) => (
                              <button
                                key={`${rowIndex}-${colIndex}`}
                                className={`aspect-square w-full rounded-[3px] border transition hover:scale-110 sm:rounded-[5px] ${getLevelStyle(value)}`}
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

                  <aside className="rounded-[24px] border border-[#dcd7ca] bg-[#f8f5ee] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#71806d]">Legend</div>
                    <div className="mt-4 space-y-3">
                      {LEVEL_STYLES.map((style, level) => (
                        <div key={level} className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className={`h-4 w-4 rounded-full border ${style}`} />
                            <span className="text-sm font-medium text-[#465343]">Level {level}</span>
                          </div>
                          <span className="text-xs uppercase tracking-[0.18em] text-[#80907c]">
                            {level === 0 ? "Empty" : level < 3 ? "Light" : "Dense"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 rounded-2xl bg-[#222c25] p-4 text-sm text-[#d8e0d5]">
                      The matrix is the most direct way to shape the final graph. Use generated modes for structure,
                      then refine here.
                    </div>
                  </aside>
                </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#71806d]">Source Graph</p>
                      <h2 className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold tracking-[-0.03em] text-[#1f2721]">
                        Generated pattern
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#566354]">
                        {mode === "art"
                          ? "This mode renders a centered preset pattern from the selected template."
                          : "This mode builds the contribution shape algorithmically from the current settings and seed."}
                      </p>
                    </div>

                    <div className="rounded-full border border-[#d9d3c7] bg-[#f8f4eb] px-4 py-2 text-sm font-semibold text-[#566354]">
                      Read-only view
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="rounded-[24px] border border-[#dcd7ca] bg-[linear-gradient(180deg,#faf7f1,#f3eee5)] p-4">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        {mode !== "art" && (
                          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4e5c4c]">
                            Seed: {seed || "auto"}
                          </div>
                        )}
                        <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4e5c4c]">
                          Cap: {maxCommitsPerDay}/day
                        </div>
                        {mode === "art" && (
                          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold capitalize text-[#4e5c4c]">
                            Pattern: {artPattern}
                          </div>
                        )}
                      </div>

                      <div className="rounded-[20px] border border-[#d5d0c4] bg-[#f7f4ec] p-3 sm:p-4">
                        <div className="grid grid-rows-7 gap-0.5 sm:gap-1.5">
                          {sourceGrid.map((row, rowIndex) => (
                            <div
                              key={rowIndex}
                              className="grid grid-cols-[28px_repeat(var(--weeks),minmax(0,1fr))] items-center gap-0.5 sm:grid-cols-[40px_repeat(var(--weeks),minmax(0,1fr))] sm:gap-1.5"
                              style={{ ["--weeks" as string]: sourcePlan?.stats.weeks ?? 53 }}
                            >
                              <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#677364] sm:text-[11px] sm:tracking-[0.12em]">
                                {WEEK_DAYS[rowIndex]}
                              </span>
                              {row.map((commits, colIndex) => {
                                const level =
                                  commits === 0 ? 0 : Math.min(4, Math.ceil((commits / Math.max(maxCommitsPerDay, 1)) * 4));

                                return (
                                  <div
                                    key={`${rowIndex}-${colIndex}`}
                                    className={`aspect-square w-full rounded-[3px] border sm:rounded-[5px] ${getLevelStyle(level)}`}
                                    title={`${commits} commits`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <aside className="rounded-[24px] border border-[#dcd7ca] bg-[#f8f5ee] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#71806d]">Mode notes</div>
                      <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm leading-6 text-[#465343]">
                        {MODE_DESCRIPTIONS[mode]}
                      </div>
                      <div className="mt-4 space-y-3">
                        {LEVEL_STYLES.map((style, level) => (
                          <div key={level} className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className={`h-4 w-4 rounded-full border ${style}`} />
                              <span className="text-sm font-medium text-[#465343]">Level {level}</span>
                            </div>
                            <span className="text-xs uppercase tracking-[0.18em] text-[#80907c]">
                              {level === 0 ? "Empty" : level < 3 ? "Light" : "Dense"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </aside>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_24px_60px_rgba(44,52,37,0.07)] backdrop-blur sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#71806d]">Validation</p>
                  <h2 className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold tracking-[-0.03em] text-[#1f2721]">
                    Contribution preview
                  </h2>
                </div>
                {preview && (
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6f7c6c]">
                    <span className="rounded-full bg-[#f2ede3] px-3 py-2">{preview.stats.totalCommits} total</span>
                    <span className="rounded-full bg-[#f2ede3] px-3 py-2">{preview.stats.activeDays} active days</span>
                    <span className="rounded-full bg-[#f2ede3] px-3 py-2">{preview.stats.weeks} weeks</span>
                  </div>
                )}
              </div>

              {!preview && (
                <p className="mt-4 rounded-[22px] border border-dashed border-[#d4cebf] bg-[#f8f4ec] p-5 text-sm text-[#61705f]">
                  Build a preview to inspect density, cadence, and overall shape before creating commits.
                </p>
              )}

              {preview && (
                <div className="mt-5 rounded-[24px] border border-[#dcd7ca] bg-[linear-gradient(180deg,#faf7f1,#f3eee5)] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-[#566354]">
                      Intensity is normalized against the current <span className="font-semibold">{maxCommitsPerDay}</span>{" "}
                      commits/day ceiling.
                    </p>
                    <div className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7b8978] sm:flex">
                      <span>Low</span>
                      {LEVEL_STYLES.map((style, level) => (
                        <span key={level} className={`h-3.5 w-3.5 rounded-full border ${style}`} />
                      ))}
                      <span>High</span>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[#d5d0c4] bg-[#f7f4ec] p-3 sm:p-4">
                    <div className="grid grid-rows-7 gap-0.5 sm:gap-1.5">
                      {previewGrid.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="grid grid-cols-[28px_repeat(var(--weeks),minmax(0,1fr))] items-center gap-0.5 sm:grid-cols-[40px_repeat(var(--weeks),minmax(0,1fr))] sm:gap-1.5"
                          style={{ ["--weeks" as string]: preview.stats.weeks }}
                        >
                          <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#677364] sm:text-[11px] sm:tracking-[0.12em]">
                            {WEEK_DAYS[rowIndex]}
                          </span>
                          {row.map((commits, colIndex) => {
                            const level =
                              commits === 0 ? 0 : Math.min(4, Math.ceil((commits / Math.max(maxCommitsPerDay, 1)) * 4));

                            return (
                              <div
                                key={`${rowIndex}-${colIndex}`}
                                className={`aspect-square w-full rounded-[3px] border sm:rounded-[5px] ${getLevelStyle(level)}`}
                                title={`${commits} commits`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {lastResult && (
              <div className="rounded-[28px] border border-white/70 bg-[#222c25] p-5 text-sm text-[#edf1ea] shadow-[0_24px_60px_rgba(31,39,33,0.14)] sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b7c4b3]">Execution</p>
                <h3 className="mt-2 font-['Manrope',sans-serif] text-2xl font-semibold tracking-[-0.03em]">
                  Result summary
                </h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#aebaaa]">Mode</div>
                    <div className="mt-2 text-base font-semibold">{lastResult.dryRun ? "Dry run" : "Real execution"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#aebaaa]">Branch</div>
                    <div className="mt-2 text-base font-semibold">{lastResult.branch}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#aebaaa]">Created commits</div>
                    <div className="mt-2 text-base font-semibold">{lastResult.committedCount}</div>
                  </div>
                </div>
                <div className="mt-4 space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-4 text-[#dce3d9]">
                  <p>Planned commits: {lastResult.totalCommitsPlanned}</p>
                  <p>Pushed: {lastResult.pushed ? "Yes" : "No"}</p>
                  <p className="break-all">Base SHA: {lastResult.beforeSha}</p>
                  <p>{lastResult.message}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
