import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import { generateCommitPlan } from "../shared/generators";
import type { ExecutePlanRequest, ExecutePlanResult } from "../shared/types";

const buildCommitTimestamp = (isoDate: string, index: number, total: number) => {
  const [year, month, day] = isoDate.split("-").map((value) => Number(value));
  const hour = 9 + Math.floor((index / Math.max(total, 1)) * 9);
  const minute = (index * 17) % 60;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
};

const ensureRepo = async (repoPath: string) => {
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`Current folder is not a git repository: ${repoPath}`);
  }
  return git;
};

const resolveDefaultBranch = async (git: ReturnType<typeof simpleGit>) => {
  try {
    const remoteHead = (await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"])).trim();
    const branch = remoteHead.split("/").pop();
    if (branch) {
      return branch;
    }
  } catch {
    // ignore and fallback to local resolution
  }

  const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  const branches = await git.branchLocal();

  if (branches.all.includes("main")) {
    return "main";
  }
  if (branches.all.includes("master")) {
    return "master";
  }

  return currentBranch;
};

const ensureDefaultBranch = async (repoPath: string) => {
  const git = await ensureRepo(repoPath);
  const defaultBranch = await resolveDefaultBranch(git);
  const branches = await git.branchLocal();

  if (branches.all.includes(defaultBranch)) {
    await git.checkout(defaultBranch);
  } else {
    try {
      await git.fetch("origin", defaultBranch);
      await git.checkout(["-b", defaultBranch, `origin/${defaultBranch}`]);
    } catch {
      await git.checkoutLocalBranch(defaultBranch);
    }
  }

  return { git, defaultBranch };
};

export const executePlan = async (payload: ExecutePlanRequest): Promise<ExecutePlanResult> => {
  const plan = generateCommitPlan(payload.request);
  const repoPath = process.cwd();
  const { git, defaultBranch } = await ensureDefaultBranch(repoPath);
  const beforeSha = (await git.revparse(["HEAD"])).trim();
  const branch = defaultBranch;

  if (payload.dryRun) {
    return {
      ok: true,
      dryRun: true,
      beforeSha,
      branch,
      pushed: false,
      committedCount: 0,
      totalCommitsPlanned: plan.stats.totalCommits,
      message: `Dry run complete. No commits created. Target branch: ${branch}`
    };
  }

  const dataDir = path.join(repoPath, ".arttribute");
  const relativeDataFile = ".arttribute/activity.json";
  await mkdir(dataDir, { recursive: true });

  let committedCount = 0;

  for (const day of plan.days) {
    if (day.commits <= 0) {
      continue;
    }

    for (let index = 0; index < day.commits; index += 1) {
      const commitDate = buildCommitTimestamp(day.date, index, day.commits);
      const body = {
        date: day.date,
        commitDate,
        mode: payload.request.mode,
        sequence: `${day.date}-${index + 1}`,
        generatedAt: new Date().toISOString()
      };

      await writeFile(path.join(repoPath, relativeDataFile), JSON.stringify(body, null, 2), "utf-8");
      await git.add([relativeDataFile]);
      await git.commit(`arttribute: ${day.date} #${index + 1}`, [relativeDataFile], { "--date": commitDate });
      committedCount += 1;
    }
  }

  if (committedCount > 0) {
    await git.push("origin", branch);
  }

  return {
    ok: true,
    dryRun: false,
    beforeSha,
    branch,
    pushed: committedCount > 0,
    committedCount,
    totalCommitsPlanned: plan.stats.totalCommits,
    message: committedCount > 0 ? `Commits created and pushed to ${branch}` : "No commits generated for this plan"
  };
};
