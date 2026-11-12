import type { DungeonPlan } from './plan';
import type { Rng } from './rng';
import type { DungeonSpec, GenEdge, GenRoom, Gate, Pickup, Region } from './types';

/** The dungeon must fit in this many screens each way. */
const MAX_SPAN = 8;

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const cellKey = (x: number, y: number) => `${x},${y}`;

export interface Layout {
  rooms: GenRoom[];
  edges: GenEdge[];
  entrance: number;
  goal: number;
}

/**
 * Stages 3 and 4. Grow the planned regions on a grid of screen-sized cells,
 * one room per cell, so the result can always be drawn as a map. Then add
 * loops, place the pickups and give every room a role.
 *
 * Returns null if the regions could not be fitted; the caller re-rolls.
 */
export function layoutDungeon(spec: DungeonSpec, plan: DungeonPlan, rng: Rng): Layout | null {
  const rooms: GenRoom[] = [];
  const edges: GenEdge[] = [];
  const taken = new Map<string, number>();
  const byRegion = new Map<number, number[]>();
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  const fits = (x: number, y: number): boolean => {
    if (taken.has(cellKey(x, y))) return false;
    return Math.max(maxX, x) - Math.min(minX, x) < MAX_SPAN
      && Math.max(maxY, y) - Math.min(minY, y) < MAX_SPAN;
  };
  const freeAround = (id: number): Array<[number, number]> => {
    const r = rooms[id]!;
    return STEPS.map(([dx, dy]) => [r.x + dx, r.y + dy] as [number, number]).filter(([x, y]) => fits(x, y));
  };
  const place = (x: number, y: number, region: number): number => {
    const id = rooms.length;
    rooms.push({ id, x, y, region, role: 'combat', threat: 1, uses: [] });
    taken.set(cellKey(x, y), id);
    const list = byRegion.get(region) ?? [];
    list.push(id);
    byRegion.set(region, list);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    return id;
  };
  /** Add a room next to one of `from`, joined by `gate`. */
  const grow = (from: number[], region: number, gate: Gate, preferLast: boolean): number | null => {
    const candidates = from.filter((id) => freeAround(id).length > 0);
    if (candidates.length === 0) return null;
    const lastId = from[from.length - 1]!;
    const base = preferLast && candidates.includes(lastId) && rng.chance(0.55) ? lastId : rng.pick(candidates);
    const [x, y] = rng.pick(freeAround(base));
    const id = place(x, y, region);
    edges.push({ a: base, b: id, gate });
    return id;
  };

  // Regions are laid out in unlock order, except that the boss door and goal
  // are placed straight after act 1 while there is still room beside it.
  const sealedLate = plan.regions.filter((r) => r.kind === 'boss' || r.kind === 'goal');
  const order: Region[] = [];
  for (const region of plan.regions) {
    if (sealedLate.includes(region)) continue;
    if (region.kind === 'miniboss') order.push(...sealedLate);
    order.push(region);
  }
  const ordinary = (r: Region) => r.kind === 'start' || r.kind === 'act1' || r.kind === 'act2';

  for (const region of order) {
    let first: number | null;
    if (region.parent < 0) {
      first = place(0, 0, region.id);
    } else {
      first = grow(byRegion.get(region.parent) ?? [], region.id, region.gate, false);
      if (first === null && region.kind !== 'artifact' && region.kind !== 'goal') {
        // The planned parent is boxed in: hang it off any earlier ordinary
        // region instead. The solver checks the result like any other.
        const others = plan.regions
          .filter((r) => r.id < region.id && ordinary(r) && byRegion.has(r.id))
          .flatMap((r) => byRegion.get(r.id)!);
        first = grow(rng.shuffle(others), region.id, region.gate, false);
      }
    }
    if (first === null) return null;
    for (let i = 1; i < region.size; i++) {
      if (grow(byRegion.get(region.id)!, region.id, { type: 'open' }, true) === null) return null;
    }
  }

  addLoops(rooms, edges, taken, plan.regions, rng);
  if (!placePickups(spec, plan, rooms, edges, byRegion, rng)) return null;
  assignRoles(spec, plan.regions, rooms, edges, rng);

  // Shift so the map starts at 0,0.
  for (const r of rooms) {
    r.x -= minX;
    r.y -= minY;
  }
  const goalRegion = plan.regions.find((r) => r.kind === 'goal')!;
  return { rooms, edges, entrance: 0, goal: byRegion.get(goalRegion.id)![0]! };
}

/** Rooms that must stay dead ends with a single, gated way in. */
const SEALED = new Set(['artifact', 'boss', 'goal', 'miniboss']);

/**
 * Join some rooms that sit side by side on the grid but are not connected.
 * Inside a region these are plain doors. Between regions they only ever lead
 * from a later region back to an earlier one (a drop, or a door that opens
 * from the far side), so a loop can never let the player skip a gate.
 */
function addLoops(
  rooms: GenRoom[],
  edges: GenEdge[],
  taken: Map<string, number>,
  regions: Region[],
  rng: Rng,
): void {
  const joined = new Set(edges.map((e) => `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`));
  const kindOf = (id: number) => regions[rooms[id]!.region]!.kind;
  const isAncestor = (early: number, late: number): boolean => {
    for (let r = regions[late]!.parent; r >= 0; r = regions[r]!.parent) {
      if (r === early) return true;
    }
    return false;
  };
  const candidates: Array<{ edge: GenEdge; p: number }> = [];

  for (const room of rooms) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const other = taken.get(cellKey(room.x + dx, room.y + dy));
      if (other === undefined || joined.has(`${Math.min(room.id, other)}-${Math.max(room.id, other)}`)) continue;
      const ka = kindOf(room.id);
      const kb = kindOf(other);
      if (SEALED.has(ka) && SEALED.has(kb)) continue;
      const ra = rooms[room.id]!.region;
      const rb = rooms[other]!.region;
      if (ra === rb) {
        if (!SEALED.has(ka)) candidates.push({ edge: { a: room.id, b: other, gate: { type: 'open' } }, p: 0.45 });
        continue;
      }
      // `late` is the room in the later-unlocked region. It may only lead
      // back to a region the player must already have walked through.
      const [late, early] = ra > rb ? [room.id, other] : [other, room.id];
      const lateKind = kindOf(late);
      if (SEALED.has(kindOf(early)) || lateKind === 'boss' || lateKind === 'goal' || lateKind === 'miniboss') continue;
      if (!isAncestor(rooms[early]!.region, rooms[late]!.region)) continue;
      // The artifact room often gets a quick way back out.
      const p = lateKind === 'artifact' ? 0.75 : 0.4;
      candidates.push({ edge: { a: late, b: early, gate: { type: rng.chance(0.5) ? 'oneway' : 'shortcut' } }, p });
    }
  }

  let added = 0;
  for (const c of candidates) {
    if (rng.chance(c.p)) {
      edges.push(c.edge);
      added += 1;
    }
  }
  // Every dungeon gets at least one loop if the grid allows any.
  if (added === 0 && candidates.length > 0) edges.push(rng.pick(candidates).edge);
}

function degreeOf(id: number, edges: GenEdge[]): number {
  return edges.filter((e) => e.a === id || e.b === id).length;
}

/** Put keys, the artifact, the boss key, the Anima piece and treasure in rooms. */
function placePickups(
  spec: DungeonSpec,
  plan: DungeonPlan,
  rooms: GenRoom[],
  edges: GenEdge[],
  byRegion: Map<number, number[]>,
  rng: Rng,
): boolean {
  const { regions } = plan;
  const empty = (id: number) => rooms[id]!.pickup === undefined && id !== 0;
  const put = (id: number, pickup: Pickup) => {
    rooms[id]!.pickup = pickup;
  };
  /** Prefer dead ends, then anything free, in the given regions. */
  const choose = (regionIds: number[]): number | null => {
    const pool = regionIds.flatMap((r) => byRegion.get(r) ?? []).filter(empty);
    if (pool.length === 0) return null;
    const deadEnds = pool.filter((id) => degreeOf(id, edges) === 1);
    return rng.pick(deadEnds.length > 0 ? deadEnds : pool);
  };
  const ordinary = (r: Region) => r.kind === 'start' || r.kind === 'act1' || r.kind === 'act2';
  const behindKeyDoor = (r: Region): boolean => {
    for (let cur: Region | undefined = r; cur; cur = regions[cur.parent]) {
      if (cur.gate.type === 'key') return true;
    }
    return false;
  };

  const artifactRegion = regions.find((r) => r.kind === 'artifact')!;
  put(byRegion.get(artifactRegion.id)![0]!, { kind: 'artifact', needs: [] });
  const goalRegion = regions.find((r) => r.kind === 'goal')!;
  put(byRegion.get(goalRegion.id)![0]!, { kind: 'anima', needs: [] });

  const bossKeyRooms = byRegion.get(plan.bossKeyRegion)!;
  const bossKeyRoom = [...bossKeyRooms].reverse().find(empty);
  if (bossKeyRoom === undefined) return false;
  put(bossKeyRoom, { kind: 'bosskey', needs: [] });

  // One key per key door, somewhere unlocked before that door.
  for (const region of regions) {
    if (region.gate.type !== 'key') continue;
    const late = plan.lateKeyRegions.includes(region.id);
    let earlier: number[];
    if (late) {
      // Seen in act 1, reachable only with the new artifact.
      earlier = regions.filter((r) => r.id < artifactRegion.id && ordinary(r)).map((r) => r.id);
    } else {
      // Never behind another key door: with every early key reachable up
      // front, no order of opening doors can leave the player a key short.
      const all = regions.filter((r) => r.id < region.id && ordinary(r) && !behindKeyDoor(r)).map((r) => r.id);
      earlier = rng.chance(0.7) ? all.slice(-2) : all;
    }
    const room = choose(earlier)
      ?? choose(regions.filter((r) => r.id < region.id && ordinary(r) && !behindKeyDoor(r)).map((r) => r.id));
    if (room === null) return false;
    put(room, { kind: 'key', needs: late ? [spec.artifact] : [] });
  }

  // Treasure in leftover dead ends, so side paths pay off, and one more in
  // each large region so long stretches are not empty.
  for (const room of rooms) {
    if (empty(room.id) && ordinary(regions[room.region]!) && degreeOf(room.id, edges) === 1) {
      put(room.id, { kind: 'treasure', needs: [] });
    }
  }
  for (const region of regions) {
    const ids = byRegion.get(region.id) ?? [];
    if (!ordinary(region) || ids.length < 4 || ids.some((id) => rooms[id]!.pickup?.kind === 'treasure')) continue;
    const free = ids.filter(empty);
    if (free.length > 0) put(rng.pick(free), { kind: 'treasure', needs: [] });
  }
  return true;
}

/** Give each room a role, a threat level and the artifacts its puzzle uses. */
function assignRoles(spec: DungeonSpec, regions: Region[], rooms: GenRoom[], edges: GenEdge[], rng: Rng): void {
  const artifactRegion = regions.find((r) => r.kind === 'artifact')!.id;
  const base = Math.min(4, 1 + Math.floor((spec.position - 1) / 2));
  let combat = 0;
  let puzzle = 0;

  for (const room of rooms) {
    const region = regions[room.region]!;
    const late = room.region > artifactRegion;
    room.threat = Math.min(5, base + (late ? 1 : 0));
    if (room.id === 0) {
      room.role = 'entrance';
      room.threat = 1;
    } else if (region.kind === 'miniboss') room.role = 'miniboss';
    else if (region.kind === 'artifact') room.role = 'artifact';
    else if (region.kind === 'boss') room.role = 'boss';
    else if (region.kind === 'goal') room.role = 'goal';
    else {
      // Keep fights and puzzles roughly even, with the seed deciding ties.
      const wantCombat = combat < puzzle ? true : combat > puzzle + 1 ? false : rng.chance(0.55);
      room.role = wantCombat ? 'combat' : 'puzzle';
      if (wantCombat) combat += 1;
      else puzzle += 1;
    }

    // A room's puzzle is built around what its own obstacles already need,
    // or around an artifact the player is sure to have by then.
    const needed = new Set(room.pickup?.needs ?? []);
    for (const e of edges) {
      if ((e.a === room.id || e.b === room.id) && (e.gate.type === 'artifact' || e.gate.type === 'fight')) {
        for (const a of e.gate.needs) needed.add(a);
      }
    }
    if (room.role === 'puzzle' && needed.size === 0) {
      if (late) needed.add(spec.artifact);
      else if (spec.priors.length > 0 && rng.chance(0.5)) needed.add(rng.pick(spec.priors));
    }
    if (region.kind === 'boss') needed.add(spec.artifact);
    room.uses = [...needed];
  }
}
