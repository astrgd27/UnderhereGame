import { describe, expect, it } from 'vitest';
import { drawMap } from '../../src/gen/ascii';
import { MAX_ATTEMPTS, generateDungeon } from '../../src/gen/generate';
import { Rng } from '../../src/gen/rng';
import { REUSE_TARGET, planRun, reuseCounts } from '../../src/gen/runPlan';
import { solve, type Solvable } from '../../src/gen/solver';
import { ARTIFACTS, type ArtifactId, type GenEdge, type GenRoom, type Gate, type Pickup } from '../../src/gen/types';

/** Hand-built dungeon: rooms in a row unless told otherwise. */
function tiny(
  count: number,
  edges: Array<[number, number, Gate]>,
  pickups: Record<number, Pickup>,
  carried: ArtifactId[] = [],
): Solvable {
  const rooms: GenRoom[] = Array.from({ length: count }, (_, id) => ({
    id, x: id, y: 0, region: 0, role: 'combat', threat: 1, uses: [], pickup: pickups[id],
  }));
  const list: GenEdge[] = edges.map(([a, b, gate]) => ({ a, b, gate }));
  return { rooms, edges: list, entrance: 0, goal: count - 1, carried, artifact: 'lumen' };
}
const open: Gate = { type: 'open' };
const keyDoor: Gate = { type: 'key' };
const key: Pickup = { kind: 'key', needs: [] };

describe('Rng', () => {
  it('gives the same numbers for the same seed and different ones for another', () => {
    const a = new Rng('aliud');
    const b = new Rng('aliud');
    const c = new Rng('aliue');
    const seqA = Array.from({ length: 20 }, () => a.float());
    expect(Array.from({ length: 20 }, () => b.float())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.float())).not.toEqual(seqA);
  });

  it('forks independent streams by label', () => {
    const root = new Rng('aliud');
    expect(root.fork('plan').float()).toBe(new Rng('aliud').fork('plan').float());
    expect(root.fork('plan').float()).not.toBe(root.fork('layout').float());
  });

  it('spreads whole numbers evenly over their range', () => {
    const rng = new Rng('spread');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) counts[rng.int(0, 3)]! += 1;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });
});

describe('solver', () => {
  it('passes a simple key-and-door dungeon', () => {
    const report = solve(tiny(3, [[0, 1, open], [1, 2, keyDoor]], { 1: key }));
    expect(report).toMatchObject({ solvable: true, softlockFree: true });
  });

  it('fails a dungeon whose key is behind its own door', () => {
    const report = solve(tiny(3, [[0, 1, keyDoor], [1, 2, open]], { 1: key }));
    expect(report.solvable).toBe(false);
  });

  it('finds the softlock when a key can be spent on the wrong door', () => {
    // One key at the start. Door A leads to the second key and the goal door;
    // door B leads to a dead end. Opening B first strands the player.
    const d = tiny(5, [
      [0, 1, keyDoor], // A: to room 1, which holds the second key
      [0, 2, keyDoor], // B: dead end
      [1, 3, keyDoor], // needs the second key
      [3, 4, open],
    ], { 0: key, 1: key });
    const report = solve(d);
    expect(report.solvable).toBe(true);
    expect(report.softlockFree).toBe(false);
  });

  it('accepts two key doors when both keys are available up front', () => {
    const d = tiny(4, [[0, 1, keyDoor], [0, 2, keyDoor], [1, 3, open]], { 0: key, 2: key });
    // Room 0 holds one key, so add the other in an open side room.
    d.rooms.push({ id: 4, x: 0, y: 1, region: 0, role: 'combat', threat: 1, uses: [], pickup: key });
    d.edges.push({ a: 0, b: 4, gate: open });
    d.rooms[2]!.pickup = undefined;
    d.goal = 3;
    expect(solve(d)).toMatchObject({ solvable: true, softlockFree: true });
  });

  it('finds the softlock in a one-way drop into a sealed pit', () => {
    const d = tiny(4, [[0, 1, { type: 'oneway' }], [0, 2, open], [2, 3, open]], {});
    expect(solve(d).softlockFree).toBe(false);
  });

  it('opens a shortcut only from its far side, then both ways', () => {
    // 0 -> 1 -> 2, with a shortcut from 2 back to 0, and the goal off room 0
    // behind a door that needs the key in room 2.
    const d = tiny(4, [[0, 1, open], [1, 2, open], [2, 0, { type: 'shortcut' }], [0, 3, keyDoor]], { 2: key });
    expect(solve(d)).toMatchObject({ solvable: true, softlockFree: true });
    const blocked = tiny(3, [[1, 0, { type: 'shortcut' }], [1, 2, open]], {});
    expect(solve(blocked).solvable).toBe(false);
  });

  it('needs the boss key for the boss door and artifacts for their gates', () => {
    const gate: Gate = { type: 'artifact', needs: ['tether'] };
    expect(solve(tiny(2, [[0, 1, gate]], {})).solvable).toBe(false);
    expect(solve(tiny(2, [[0, 1, gate]], {}, ['tether'])).solvable).toBe(true);
    const boss = tiny(3, [[0, 1, open], [0, 2, { type: 'bosskey' }]], { 1: { kind: 'bosskey', needs: [] } });
    expect(solve(boss)).toMatchObject({ solvable: true, softlockFree: true });
  });

  it('reports an artifact that is carried but never needed', () => {
    const d = tiny(3, [[0, 1, { type: 'artifact', needs: ['tether'] }], [0, 2, open]], {}, ['tether', 'kiln']);
    d.goal = 1;
    expect(solve(d).fakeRequirements).toEqual(['kiln', 'lumen']);
  });

  it('leaves a pickup behind until the artifact that reaches it is owned', () => {
    // The key needs the dungeon's own artifact, found deeper in.
    const d = tiny(4, [[0, 1, open], [1, 2, open], [0, 3, keyDoor]], {
      1: { kind: 'key', needs: ['lumen'] },
      2: { kind: 'artifact', needs: [] },
    });
    const report = solve(d);
    expect(report).toMatchObject({ solvable: true, softlockFree: true });
    expect(report.fakeRequirements).toEqual([]);
  });
});

describe('run plan', () => {
  it('orders all eight artifacts and reuses each one, for 10,000 seeds', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const plan = planRun(`run-${i}`);
      const order = plan.dungeons.map((d) => d.artifact);
      expect([...order].sort()).toEqual([...ARTIFACTS].sort());
      firsts.add(order[0]!);
      plan.dungeons.forEach((d, index) => {
        expect(d.position).toBe(index + 1);
        expect(new Set(d.priors).size).toBe(d.priors.length);
        for (const a of d.priors) expect(order.indexOf(a)).toBeLessThan(index);
        expect(d.pairings).toBeLessThanOrEqual(d.priors.length);
      });
      expect(plan.dungeons.map((d) => d.priors.length)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
      const reuse = reuseCounts(plan);
      order.forEach((a, index) => {
        expect(reuse.get(a)).toBeGreaterThanOrEqual(Math.min(REUSE_TARGET, order.length - 1 - index));
      });
    }
    expect(firsts.size).toBe(ARTIFACTS.length);
  });

  it('is the same every time for the same seed', () => {
    expect(planRun('aliud')).toEqual(planRun('aliud'));
    expect(planRun('aliud')).not.toEqual(planRun('aliud2'));
  });
});

describe('dungeon generator', () => {
  it('builds the same dungeon from the same spec', () => {
    const spec = planRun('aliud').dungeons[5]!;
    expect(generateDungeon(spec)).toEqual(generateDungeon(spec));
  });

  it('draws a map with one token per room', () => {
    const d = generateDungeon(planRun('aliud').dungeons[3]!);
    const map = drawMap(d);
    expect(map.match(/\[[A-Za-z]/g)?.length).toBe(d.rooms.length);
    expect(map).toContain('*');
    expect(map).toContain('@');
  });

  it('generates 10,000 dungeons that all pass the solver and the structure checks', () => {
    let total = 0;
    let attempts = 0;
    let worst = 0;
    for (let run = 0; run < 1250; run++) {
      for (const spec of planRun(`soak-${run}`).dungeons) {
        const d = generateDungeon(spec);
        total += 1;
        attempts += d.attempts;
        worst = Math.max(worst, d.attempts);

        // Checked again here, independently of the pipeline that built it.
        const report = solve({
          rooms: d.rooms, edges: d.edges, entrance: d.entrance, goal: d.goal,
          carried: spec.priors, artifact: spec.artifact,
        });
        expect(report.solvable).toBe(true);
        expect(report.softlockFree).toBe(true);
        expect(report.fakeRequirements).toEqual([]);

        expect(d.rooms.length).toBeGreaterThanOrEqual(spec.rooms[0]);
        expect(d.rooms.length).toBeLessThanOrEqual(spec.rooms[1] + 2);
        expect(new Set(d.rooms.map((r) => `${r.x},${r.y}`)).size).toBe(d.rooms.length);
        for (const e of d.edges) {
          const a = d.rooms[e.a]!;
          const b = d.rooms[e.b]!;
          expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
        }
        const count = (kind: string) => d.rooms.filter((r) => r.pickup?.kind === kind).length;
        expect(count('artifact')).toBe(1);
        expect(count('bosskey')).toBe(1);
        expect(count('anima')).toBe(1);
        expect(count('key')).toBe(d.edges.filter((e) => e.gate.type === 'key').length);
        expect(d.rooms[d.goal]!.role).toBe('goal');
        expect(d.rooms[d.entrance]!.role).toBe('entrance');
        expect(d.rooms.filter((r) => r.role === 'miniboss').length).toBe(1);
        expect(d.rooms.filter((r) => r.role === 'boss').length).toBe(1);
        expect(d.attempts).toBeLessThan(MAX_ATTEMPTS);
      }
    }
    expect(total).toBe(10000);
    // Recorded so a change that makes generation much harder shows up.
    expect(attempts / total).toBeLessThan(5);
    expect(worst).toBeLessThan(MAX_ATTEMPTS / 2);
  }, 120000);
});
