export const ARTIFACTS = [
  'lumen', 'tether', 'rootpod', 'gale', 'resonator', 'kiln', 'veil', 'sigil',
] as const;
export type ArtifactId = (typeof ARTIFACTS)[number];

export const ARTIFACT_NAME: Record<ArtifactId, string> = {
  lumen: 'Lumen Gland',
  tether: 'Tether Tendril',
  rootpod: 'Rootpod',
  gale: 'Galebellows',
  resonator: 'Resonator',
  kiln: 'Kiln Lamp',
  veil: 'Veil Mask',
  sigil: 'Sigil of Exchange',
};

/** What one dungeon must be, decided by the run plan. */
export interface DungeonSpec {
  seed: string;
  /** 1 to 8: where this dungeon falls in the run. Sets size and difficulty. */
  position: number;
  /** The artifact found here. */
  artifact: ArtifactId;
  /** Earlier artifacts this dungeon must require. */
  priors: ArtifactId[];
  /** Room count range, both ends included. */
  rooms: [number, number];
  /** Obstacles that need an earlier artifact and this one together. */
  pairings: number;
}

/**
 * What stands between two rooms.
 * - open: a plain doorway.
 * - key: a locked door; one small key is used up to open it for good.
 * - bosskey: the boss door; needs the boss key, which is not used up.
 * - artifact: an obstacle that needs every listed artifact.
 * - fight: a miniboss or boss that must be beaten, needing the listed artifacts.
 * - oneway: a drop; passable from `a` to `b` only.
 * - shortcut: shut until opened from the `a` side, then open both ways.
 */
export type Gate =
  | { type: 'open' }
  | { type: 'key' }
  | { type: 'bosskey' }
  | { type: 'artifact'; needs: ArtifactId[] }
  | { type: 'fight'; needs: ArtifactId[] }
  | { type: 'oneway' }
  | { type: 'shortcut' };

export type PickupKind = 'key' | 'bosskey' | 'artifact' | 'anima' | 'treasure';

export interface Pickup {
  kind: PickupKind;
  /** Artifacts needed to reach it inside its room (a key on a far ledge). */
  needs: ArtifactId[];
}

export type Role =
  | 'entrance' | 'combat' | 'puzzle' | 'miniboss' | 'artifact' | 'boss' | 'goal';

export interface GenRoom {
  id: number;
  /** Grid cell; each cell is one screen. */
  x: number;
  y: number;
  region: number;
  role: Role;
  pickup?: Pickup;
  /** 1 to 5: how hard the room's enemies or puzzle should be. */
  threat: number;
  /** Artifacts the room's puzzle is built around (for template choice). */
  uses: ArtifactId[];
}

export interface GenEdge {
  a: number;
  b: number;
  gate: Gate;
}

export type RegionKind = 'start' | 'act1' | 'miniboss' | 'artifact' | 'act2' | 'boss' | 'goal';

/** A group of rooms entered through one gate. Regions are listed in unlock order. */
export interface Region {
  id: number;
  kind: RegionKind;
  parent: number;
  gate: Gate;
  size: number;
}

export interface Metrics {
  rooms: number;
  /** Independent loops in the room graph. */
  loops: number;
  /** Rooms with three or more exits. */
  hubs: number;
  /** Longest run of rooms with exactly two exits. */
  longestCorridor: number;
  width: number;
  height: number;
  /** Room-to-room moves a thorough explorer makes before reaching the goal. */
  walk: number;
  /** walk divided by rooms: how much backtracking there is. */
  backtrack: number;
  /** Most rooms entered between two rewards. */
  drought: number;
  /** Share of ordinary rooms that are combat rooms. */
  combatShare: number;
  smallKeys: number;
}

export interface SolveReport {
  /** The goal can be reached. */
  solvable: boolean;
  /** No reachable situation exists from which the goal cannot be reached. */
  softlockFree: boolean;
  /** Required artifacts that turned out not to be needed. */
  fakeRequirements: ArtifactId[];
  states: number;
}

export interface GenDungeon {
  spec: DungeonSpec;
  regions: Region[];
  rooms: GenRoom[];
  edges: GenEdge[];
  entrance: number;
  goal: number;
  metrics: Metrics;
  solve: SolveReport;
  /** How many candidates were built before one passed every check. */
  attempts: number;
}

export interface RunPlan {
  seed: string;
  dungeons: DungeonSpec[];
}
