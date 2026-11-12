import type { ArtifactId, GenEdge, GenRoom, Metrics } from './types';

interface Shape {
  rooms: GenRoom[];
  edges: GenEdge[];
  entrance: number;
  goal: number;
  carried: ArtifactId[];
  artifact: ArtifactId;
}

/**
 * Play the dungeon as a thorough explorer would: always walk to the nearest
 * room not yet seen (or pickup not yet taken), opening whatever can be
 * opened, and enter the goal only when nothing else is left. Counts the
 * room-to-room moves and the longest gap between rewards.
 */
function explorerWalk(d: Shape): { walk: number; drought: number } {
  const adjacent: number[][] = d.rooms.map(() => []);
  d.edges.forEach((e, i) => {
    adjacent[e.a]!.push(i);
    adjacent[e.b]!.push(i);
  });
  const inventory = new Set<ArtifactId>(d.carried);
  const opened = new Set<number>();
  const seen = new Set<number>();
  const taken = new Set<number>();
  let keys = 0;
  let bossKey = false;
  let at = d.entrance;
  let walk = 0;
  let sinceReward = 0;
  let drought = 0;

  const hasAll = (needs: ArtifactId[]) => needs.every((a) => inventory.has(a));
  const arrive = (room: number) => {
    seen.add(room);
    const pickup = d.rooms[room]!.pickup;
    if (pickup && !taken.has(room) && hasAll(pickup.needs)) {
      taken.add(room);
      if (pickup.kind === 'key') keys += 1;
      if (pickup.kind === 'bosskey') bossKey = true;
      if (pickup.kind === 'artifact') inventory.add(d.artifact);
      drought = Math.max(drought, sinceReward);
      sinceReward = 0;
    }
  };
  /** Can the explorer cross this edge from `from` right now? Keys are spent on arrival. */
  const passable = (ei: number, from: number, spareKeys: number): boolean => {
    const e = d.edges[ei]!;
    switch (e.gate.type) {
      case 'open': return true;
      case 'key': return opened.has(ei) || spareKeys > 0;
      case 'bosskey': return bossKey;
      case 'artifact':
      case 'fight': return hasAll(e.gate.needs);
      case 'oneway': return from === e.a;
      case 'shortcut': return opened.has(ei) || from === e.a;
    }
  };
  const wanted = (room: number): boolean => {
    if (!seen.has(room)) return true;
    const pickup = d.rooms[room]!.pickup;
    return pickup !== undefined && !taken.has(room) && hasAll(pickup.needs);
  };

  arrive(at);
  for (let guard = 0; guard < 2000; guard++) {
    // Breadth-first search for the nearest wanted room, leaving the goal for last.
    const from = new Map<number, { room: number; edge: number }>();
    const order = [at];
    const reached = new Set([at]);
    let target = -1;
    let goalSeen = false;
    for (let i = 0; i < order.length && target < 0; i++) {
      const room = order[i]!;
      for (const ei of adjacent[room]!) {
        const e = d.edges[ei]!;
        const to = e.a === room ? e.b : e.a;
        // A path may use at most one unopened key door, the last step.
        if (reached.has(to) || !passable(ei, room, keys)) continue;
        const locked = e.gate.type === 'key' && !opened.has(ei);
        reached.add(to);
        from.set(to, { room, edge: ei });
        if (to === d.goal) {
          goalSeen = true;
          continue;
        }
        if (wanted(to)) {
          target = to;
          break;
        }
        if (!locked) order.push(to);
      }
    }
    if (target < 0) {
      if (!goalSeen) break;
      target = d.goal;
    }
    const path: Array<{ room: number; edge: number }> = [];
    for (let r = target; r !== at;) {
      const step = from.get(r)!;
      path.unshift({ room: r, edge: step.edge });
      r = step.room;
    }
    for (const step of path) {
      const e = d.edges[step.edge]!;
      if (e.gate.type === 'key' && !opened.has(step.edge)) {
        opened.add(step.edge);
        keys -= 1;
      }
      if (e.gate.type === 'shortcut') opened.add(step.edge);
      at = step.room;
      walk += 1;
      sinceReward += 1;
      arrive(at);
    }
    if (at === d.goal) break;
  }
  return { walk, drought: Math.max(drought, sinceReward) };
}

export function measure(d: Shape): Metrics {
  const degree = d.rooms.map(() => 0);
  for (const e of d.edges) {
    degree[e.a]! += 1;
    degree[e.b]! += 1;
  }

  // Longest chain of two-exit rooms.
  const adjacent: number[][] = d.rooms.map(() => []);
  for (const e of d.edges) {
    adjacent[e.a]!.push(e.b);
    adjacent[e.b]!.push(e.a);
  }
  let longestCorridor = 0;
  const counted = new Set<number>();
  for (const room of d.rooms) {
    if (degree[room.id] !== 2 || counted.has(room.id)) continue;
    let length = 0;
    const stack = [room.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (counted.has(id) || degree[id] !== 2) continue;
      counted.add(id);
      length += 1;
      stack.push(...adjacent[id]!);
    }
    longestCorridor = Math.max(longestCorridor, length);
  }

  const ordinary = d.rooms.filter((r) => r.role === 'combat' || r.role === 'puzzle');
  const { walk, drought } = explorerWalk(d);
  return {
    rooms: d.rooms.length,
    loops: d.edges.length - d.rooms.length + 1,
    hubs: degree.filter((n) => n >= 3).length,
    longestCorridor,
    width: Math.max(...d.rooms.map((r) => r.x)) + 1,
    height: Math.max(...d.rooms.map((r) => r.y)) + 1,
    walk,
    backtrack: walk / d.rooms.length,
    drought,
    combatShare: ordinary.length === 0 ? 0.5 : ordinary.filter((r) => r.role === 'combat').length / ordinary.length,
    smallKeys: d.rooms.filter((r) => r.pickup?.kind === 'key').length,
  };
}

/** Pacing limits a dungeon must stay inside. Returns the reasons it fails. */
export function pacingProblems(m: Metrics): string[] {
  const problems: string[] = [];
  if (m.rooms >= 10 && m.loops < 1) problems.push('no loop');
  if (m.hubs < (m.rooms >= 12 ? 2 : 1)) problems.push('too few hub rooms');
  if (m.longestCorridor > 4) problems.push('corridor too long');
  if (Math.min(m.width, m.height) < (m.rooms >= 12 ? 3 : 2)) problems.push('map too thin');
  if (m.backtrack > 3.2) problems.push('too much backtracking');
  if (m.backtrack < 1.15) problems.push('too linear');
  if (m.drought > 9) problems.push('too long without a reward');
  if (m.combatShare < 0.35 || m.combatShare > 0.7) problems.push('combat and puzzle rooms out of balance');
  return problems;
}
