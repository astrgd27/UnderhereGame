import type { Rng } from './rng';
import type { ArtifactId, DungeonSpec, Gate, Region, RegionKind } from './types';

/**
 * Stage 2. The dungeon as regions in unlock order, on the three-act spine:
 *
 *   act 1   start, then gates that need small keys or earlier artifacts
 *   turn    miniboss, then the room holding this dungeon's artifact
 *   act 2   branches off act-1 regions that only the new artifact opens,
 *           one of them ending at the boss key; then the boss door and goal
 *
 * A region's gate item is always placed in an earlier region, so the plan is
 * solvable by construction. The solver still checks every finished dungeon.
 */
export interface DungeonPlan {
  regions: Region[];
  /** Region whose last room holds the boss key. */
  bossKeyRegion: number;
  /** Regions (by id) whose key should sit behind the dungeon's own artifact. */
  lateKeyRegions: number[];
}

const open: Gate = { type: 'open' };
const key: Gate = { type: 'key' };
const needs = (...ids: ArtifactId[]): Gate => ({ type: 'artifact', needs: ids });

export function planDungeon(spec: DungeonSpec, rng: Rng): DungeonPlan {
  const pos = spec.position;
  const budget = rng.int(spec.rooms[0], spec.rooms[1]);
  const regions: Region[] = [];
  const add = (kind: RegionKind, parent: number, gate: Gate, size = 1): number => {
    regions.push({ id: regions.length, kind, parent, gate, size });
    return regions.length - 1;
  };

  const priors = rng.shuffle(spec.priors);
  const pairPartners = priors.slice(0, spec.pairings);
  // Priors not used in a pairing must gate something on their own.
  const soloPriors = priors.slice(spec.pairings);
  const maxKeys = pos === 1 ? 2 : pos <= 3 ? 3 : 4;
  let keys = 0;

  // Act 1.
  add('start', -1, open);
  const act1Count = pos === 1 ? 1 : pos <= 3 ? 2 : pos <= 5 ? rng.int(2, 3) : pos <= 7 ? 3 : rng.int(3, 4);
  const soloInAct1 = soloPriors.splice(0, Math.min(soloPriors.length, Math.max(1, act1Count - 1)));
  const act1Gates: Gate[] = soloInAct1.map((a) => needs(a));
  while (act1Gates.length < act1Count && keys < maxKeys - 1) {
    act1Gates.push(key);
    keys += 1;
  }
  let last = 0;
  const act1: number[] = [0];
  for (const gate of rng.shuffle(act1Gates)) {
    // Artifact gates always lie on the way to the miniboss, so the artifact
    // is truly needed. A key door is sometimes an optional side branch.
    const side = gate.type === 'key' && act1.length > 1 && rng.chance(0.3);
    const id = add('act1', side ? rng.pick(act1) : last, gate);
    if (!side) last = id;
    act1.push(id);
  }

  // The turn: miniboss guards the artifact.
  const miniGate = keys < maxKeys - 1 && rng.chance(0.5) ? key : open;
  if (miniGate.type === 'key') keys += 1;
  const mini = add('miniboss', last, miniGate);
  add('artifact', mini, { type: 'fight', needs: [] });

  // Act 2: branches that only the new artifact opens, off rooms seen in act 1.
  const own = spec.artifact;
  const branchCount = pos <= 3 ? 2 : pos <= 5 ? 3 : rng.int(3, 4);
  const act2: number[] = [];
  const lateKeyRegions: number[] = [];
  const parents = rng.shuffle(act1);
  for (let i = 0; i < branchCount; i++) {
    const parent = parents[i % parents.length]!;
    act2.push(add('act2', parent, needs(own)));
  }
  // Deeper gates inside act 2: pairings, leftover priors, one more key door.
  const deeper: Gate[] = [
    ...pairPartners.map((a) => needs(a, own)),
    ...soloPriors.map((a) => needs(a)),
  ];
  if (keys < maxKeys && pos >= 2) {
    deeper.push(key);
    keys += 1;
  }
  // They form one chain from a branch down to the boss key, so each of them
  // is on the only route to it.
  let deepest = rng.pick(act2);
  for (const gate of rng.shuffle(deeper)) {
    const id = add('act2', deepest, gate);
    if (gate.type === 'key') lateKeyRegions.push(id);
    act2.push(id);
    deepest = id;
  }

  // The boss door sits off an early room; its key is at the far end of act 2.
  const boss = add('boss', rng.pick(act1.slice(0, 2)), { type: 'bosskey' });
  add('goal', boss, { type: 'fight', needs: [own] });

  // Share the remaining rooms among the ordinary regions.
  const fixed = regions.length;
  const growable = regions.filter((r) => r.kind === 'start' || r.kind === 'act1' || r.kind === 'act2');
  let spare = Math.max(0, budget - fixed);
  // The start region is a small hub; give it a head start.
  const start = regions[0]!;
  const head = Math.min(spare, 2);
  start.size += head;
  spare -= head;
  while (spare > 0) {
    rng.pick(growable).size += 1;
    spare -= 1;
  }

  return { regions, bossKeyRegion: deepest, lateKeyRegions };
}
