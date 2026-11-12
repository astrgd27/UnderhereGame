import { layoutDungeon } from './layout';
import { measure, pacingProblems } from './metrics';
import { planDungeon } from './plan';
import { Rng } from './rng';
import { solve } from './solver';
import type { DungeonSpec, GenDungeon } from './types';

/** Candidates to try before giving up on a spec. Never reached in testing. */
export const MAX_ATTEMPTS = 200;

export interface Rejection {
  attempt: number;
  reason: string;
}

/**
 * Build one dungeon from its spec. Each candidate comes from a seed derived
 * from the dungeon seed and the attempt number, so the same spec always
 * yields the same dungeon. A candidate is only returned if the solver proves
 * it and its pacing is inside the limits.
 */
export function generateDungeon(spec: DungeonSpec, rejections?: Rejection[]): GenDungeon {
  const root = new Rng(spec.seed);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const rng = root.fork(attempt);
    const plan = planDungeon(spec, rng.fork('plan'));
    const layout = layoutDungeon(spec, plan, rng.fork('layout'));
    if (!layout) {
      rejections?.push({ attempt, reason: 'did not fit the grid' });
      continue;
    }
    const shape = { ...layout, carried: spec.priors, artifact: spec.artifact };

    const report = solve(shape);
    if (!report.solvable) {
      rejections?.push({ attempt, reason: 'unsolvable' });
      continue;
    }
    if (!report.softlockFree) {
      rejections?.push({ attempt, reason: 'softlock possible' });
      continue;
    }
    if (report.fakeRequirements.length > 0) {
      rejections?.push({ attempt, reason: `not really required: ${report.fakeRequirements.join(', ')}` });
      continue;
    }

    const metrics = measure(shape);
    const problems = pacingProblems(metrics);
    if (problems.length > 0) {
      rejections?.push({ attempt, reason: problems[0]! });
      continue;
    }

    return {
      spec, regions: plan.regions,
      rooms: layout.rooms, edges: layout.edges,
      entrance: layout.entrance, goal: layout.goal,
      metrics, solve: report, attempts: attempt,
    };
  }
  throw new Error(`No valid dungeon for seed "${spec.seed}" after ${MAX_ATTEMPTS} attempts`);
}
