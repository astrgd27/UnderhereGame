import type { ArtifactId, GenEdge, GenRoom, SolveReport } from './types';

/** The parts of a dungeon the solver needs. */
export interface Solvable {
  rooms: GenRoom[];
  edges: GenEdge[];
  entrance: number;
  goal: number;
  /** Artifacts the player arrives with. */
  carried: ArtifactId[];
  /** The artifact found inside. */
  artifact: ArtifactId;
}

interface Model {
  roomBits: number;
  pickBits: number;
  /** Bit index of each room's progress pickup, or -1. */
  pickOf: Int8Array;
  pickNeeds: ArtifactId[][];
  keyMask: number;
  bossKeyBit: number;
  artifactBit: number;
  /** Bit index of each edge's "has been opened" flag, or -1. */
  doorOf: Int8Array;
  keyDoorMask: number;
  adjacent: number[][];
}

function popcount(n: number): number {
  let c = 0;
  for (let v = n; v !== 0; v &= v - 1) c += 1;
  return c;
}

function build(d: Solvable): Model {
  const pickOf = new Int8Array(d.rooms.length).fill(-1);
  const pickNeeds: ArtifactId[][] = [];
  let keyMask = 0;
  let bossKeyBit = -1;
  let artifactBit = -1;
  let bit = 0;
  for (const room of d.rooms) {
    const kind = room.pickup?.kind;
    if (kind !== 'key' && kind !== 'bosskey' && kind !== 'artifact') continue;
    pickOf[room.id] = bit;
    pickNeeds[bit] = room.pickup!.needs;
    if (kind === 'key') keyMask |= 1 << bit;
    if (kind === 'bosskey') bossKeyBit = bit;
    if (kind === 'artifact') artifactBit = bit;
    bit += 1;
  }
  const doorOf = new Int8Array(d.edges.length).fill(-1);
  let keyDoorMask = 0;
  let door = 0;
  d.edges.forEach((edge, i) => {
    if (edge.gate.type !== 'key' && edge.gate.type !== 'shortcut') return;
    doorOf[i] = door;
    if (edge.gate.type === 'key') keyDoorMask |= 1 << door;
    door += 1;
  });
  const adjacent: number[][] = d.rooms.map(() => []);
  d.edges.forEach((edge, i) => {
    adjacent[edge.a]!.push(i);
    adjacent[edge.b]!.push(i);
  });
  let roomBits = 1;
  while (1 << roomBits < d.rooms.length) roomBits += 1;
  if (roomBits + bit + door > 26) throw new Error('Dungeon too large for the solver');
  return { roomBits, pickBits: bit, pickOf, pickNeeds, keyMask, bossKeyBit, artifactBit, doorOf, keyDoorMask, adjacent };
}

/**
 * Explore every situation the player can get into: which room, which
 * pickups taken, which doors opened. Small keys are interchangeable and used
 * up, so "spent the key on the wrong door" is covered. Pickups are taken as
 * soon as they can be, which is never a disadvantage.
 *
 * `without` removes one artifact from play, to test whether it is truly
 * required.
 */
function explore(d: Solvable, m: Model, without: ArtifactId | null, wantSoftlocks: boolean): {
  solvable: boolean;
  softlockFree: boolean;
  states: number;
} {
  const has = (a: ArtifactId, picks: number): boolean => {
    if (a === without) return false;
    if (a === d.artifact) return m.artifactBit >= 0 && (picks & (1 << m.artifactBit)) !== 0;
    return d.carried.includes(a);
  };
  const hasAll = (needs: ArtifactId[], picks: number) => needs.every((a) => has(a, picks));
  const collect = (room: number, picks: number): number => {
    const bit = m.pickOf[room]!;
    if (bit < 0 || (picks & (1 << bit)) !== 0) return picks;
    return hasAll(m.pickNeeds[bit]!, picks) ? picks | (1 << bit) : picks;
  };
  const encode = (room: number, picks: number, doors: number) =>
    room | (picks << m.roomBits) | (doors << (m.roomBits + m.pickBits));

  const index = new Map<number, number>();
  const stateRoom: number[] = [];
  const statePicks: number[] = [];
  const stateDoors: number[] = [];
  const next: number[][] = [];
  const visit = (room: number, picks: number, doors: number): number => {
    const p = collect(room, picks);
    const code = encode(room, p, doors);
    let id = index.get(code);
    if (id === undefined) {
      id = stateRoom.length;
      index.set(code, id);
      stateRoom.push(room);
      statePicks.push(p);
      stateDoors.push(doors);
      next.push([]);
    }
    return id;
  };

  visit(d.entrance, 0, 0);
  let solvable = false;
  for (let s = 0; s < stateRoom.length; s++) {
    const room = stateRoom[s]!;
    const picks = statePicks[s]!;
    const doors = stateDoors[s]!;
    if (room === d.goal) {
      solvable = true;
      if (!wantSoftlocks) break;
      continue;
    }
    const keysHeld = popcount(picks & m.keyMask) - popcount(doors & m.keyDoorMask);
    for (const ei of m.adjacent[room]!) {
      const edge = d.edges[ei]!;
      const to = edge.a === room ? edge.b : edge.a;
      const gate = edge.gate;
      const doorBit = m.doorOf[ei]!;
      const isOpen = doorBit >= 0 && (doors & (1 << doorBit)) !== 0;
      let after = doors;
      let pass: boolean;
      switch (gate.type) {
        case 'open': pass = true; break;
        case 'key':
          pass = isOpen || keysHeld > 0;
          if (pass && !isOpen) after = doors | (1 << doorBit);
          break;
        case 'bosskey': pass = m.bossKeyBit >= 0 && (picks & (1 << m.bossKeyBit)) !== 0; break;
        case 'artifact':
        case 'fight': pass = hasAll(gate.needs, picks); break;
        case 'oneway': pass = room === edge.a; break;
        case 'shortcut':
          pass = isOpen || room === edge.a;
          if (pass && !isOpen) after = doors | (1 << doorBit);
          break;
      }
      if (pass) next[s]!.push(visit(to, picks, after));
    }
  }

  if (!wantSoftlocks || !solvable) return { solvable, softlockFree: solvable, states: stateRoom.length };

  // Walk backwards from the goal: any situation not reached is a softlock.
  const count = stateRoom.length;
  const prev: number[][] = Array.from({ length: count }, () => []);
  for (let s = 0; s < count; s++) {
    for (const t of next[s]!) prev[t]!.push(s);
  }
  const canWin = new Uint8Array(count);
  const queue: number[] = [];
  for (let s = 0; s < count; s++) {
    if (stateRoom[s] === d.goal) {
      canWin[s] = 1;
      queue.push(s);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const p of prev[queue[i]!]!) {
      if (!canWin[p]) {
        canWin[p] = 1;
        queue.push(p);
      }
    }
  }
  return { solvable, softlockFree: queue.length === count, states: count };
}

/**
 * Stage 5. Prove the dungeon can be finished, that no sequence of choices
 * strands the player, and that every artifact it claims to require is
 * genuinely required.
 */
export function solve(d: Solvable): SolveReport {
  const model = build(d);
  const full = explore(d, model, null, true);
  const fakeRequirements: ArtifactId[] = [];
  if (full.solvable) {
    for (const a of [...d.carried, d.artifact]) {
      if (explore(d, model, a, false).solvable) fakeRequirements.push(a);
    }
  }
  return { ...full, fakeRequirements };
}
