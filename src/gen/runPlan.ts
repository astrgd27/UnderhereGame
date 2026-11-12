import { Rng } from './rng';
import { ARTIFACTS, type ArtifactId, type DungeonSpec, type RunPlan } from './types';

/** Size and requirements by position in the run, from the design plan. */
const BY_POSITION: ReadonlyArray<{ rooms: [number, number]; priors: number; pairings: [number, number] }> = [
  { rooms: [8, 10], priors: 0, pairings: [0, 0] },
  { rooms: [11, 14], priors: 1, pairings: [0, 0] },
  { rooms: [11, 14], priors: 1, pairings: [0, 0] },
  { rooms: [14, 18], priors: 2, pairings: [1, 1] },
  { rooms: [14, 18], priors: 2, pairings: [1, 1] },
  { rooms: [17, 21], priors: 3, pairings: [1, 2] },
  { rooms: [17, 21], priors: 3, pairings: [1, 2] },
  { rooms: [20, 24], priors: 4, pairings: [2, 2] },
];

/** Each artifact must be required again in this many later dungeons. */
export const REUSE_TARGET = 2;

export function specFor(
  seed: string,
  position: number,
  artifact: ArtifactId,
  priors: ArtifactId[],
  rng: Rng,
): DungeonSpec {
  const row = BY_POSITION[position - 1];
  if (!row) throw new Error(`Position must be 1 to ${BY_POSITION.length}`);
  return {
    seed, position, artifact, priors,
    rooms: row.rooms,
    pairings: Math.min(priors.length, rng.int(row.pairings[0], row.pairings[1])),
  };
}

/**
 * Stage 1. Shuffle the eight dungeons and decide which earlier artifacts
 * each one requires, so that every artifact is needed again in at least two
 * later dungeons (one, for the seventh; the eighth is used against Akoa).
 */
export function planRun(seed: string): RunPlan {
  const rng = new Rng(seed).fork('run');
  const order = rng.shuffle(ARTIFACTS);
  const uses = new Map<ArtifactId, number>(order.map((a) => [a, 0]));
  const dungeons: DungeonSpec[] = [];

  order.forEach((artifact, index) => {
    const position = index + 1;
    const want = BY_POSITION[index]!.priors;
    const earlier = order.slice(0, index);
    // Most urgent first: the artifact still furthest short of its reuse
    // target. Ties are broken by the seed.
    const ranked = rng.shuffle(earlier)
      .map((a) => {
        const target = Math.min(REUSE_TARGET, order.length - 1 - order.indexOf(a));
        return { a, shortfall: target - (uses.get(a) ?? 0) };
      })
      .sort((p, q) => q.shortfall - p.shortfall);
    const priors = ranked.slice(0, want).map((r) => r.a);
    for (const a of priors) uses.set(a, (uses.get(a) ?? 0) + 1);
    dungeons.push(specFor(`${seed}/d${position}`, position, artifact, priors, rng.fork(`spec${position}`)));
  });

  return { seed, dungeons };
}

/** How many later dungeons require each artifact. */
export function reuseCounts(plan: RunPlan): Map<ArtifactId, number> {
  const counts = new Map<ArtifactId, number>(plan.dungeons.map((d) => [d.artifact, 0]));
  for (const d of plan.dungeons) {
    for (const a of d.priors) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return counts;
}
