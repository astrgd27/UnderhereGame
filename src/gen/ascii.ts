import { ARTIFACT_NAME, type ArtifactId, type GenDungeon, type GenEdge, type Gate, type RunPlan } from './types';

const LETTER: Record<ArtifactId, string> = {
  lumen: 'L', tether: 'T', rootpod: 'R', gale: 'W', resonator: 'S', kiln: 'F', veil: 'V', sigil: 'X',
};
const ROLE: Record<string, string> = {
  entrance: 'E', combat: 'c', puzzle: 'p', miniboss: 'M', artifact: 'A', boss: 'B', goal: 'G',
};
const PICKUP: Record<string, string> = {
  key: 'k', bosskey: 'b', artifact: '*', anima: '@', treasure: '$',
};

export const LEGEND = [
  'Rooms   [E] entrance  [c] combat  [p] puzzle  [M] miniboss  [A] artifact room  [B] boss  [G] goal',
  'Items   k small key   b boss key   * artifact   @ Anima piece   $ treasure   ! needs an artifact to reach',
  'Doors   --- open   -K- small-key door   -B- boss door   -!- fight   --> one-way drop   -/- opens from far side',
  `Gates   =L= needs that artifact (two letters: both).  ${Object.entries(LETTER).map(([id, l]) => `${l} ${ARTIFACT_NAME[id as ArtifactId]}`).join(', ')}`,
].join('\n');

function needsCode(needs: ArtifactId[]): string {
  return needs.map((a) => LETTER[a]).join('+');
}

/** Three characters for a door between side-by-side rooms. `forward` = a is on the left. */
function across(gate: Gate, forward: boolean): string {
  switch (gate.type) {
    case 'open': return '---';
    case 'key': return '-K-';
    case 'bosskey': return '-B-';
    case 'fight': return gate.needs.length > 0 ? `!${needsCode(gate.needs)}!`.slice(0, 3) : '-!-';
    case 'artifact': return gate.needs.length > 1 ? needsCode(gate.needs).slice(0, 3) : `=${needsCode(gate.needs)}=`;
    case 'oneway': return forward ? '-->' : '<--';
    case 'shortcut': return '-/-';
  }
}

/** Three characters for a door between stacked rooms. `forward` = a is on top. */
function down(gate: Gate, forward: boolean): string {
  switch (gate.type) {
    case 'open': return ' | ';
    case 'key': return ' K ';
    case 'bosskey': return ' B ';
    case 'fight': return ' ! ';
    case 'artifact': return gate.needs.length > 1 ? needsCode(gate.needs).slice(0, 3) : ` ${needsCode(gate.needs)} `;
    case 'oneway': return forward ? ' v ' : ' ^ ';
    case 'shortcut': return ' / ';
  }
}

/** Draw the dungeon as a grid of rooms and doors. */
export function drawMap(d: GenDungeon): string {
  const width = d.metrics.width;
  const height = d.metrics.height;
  const at = new Map(d.rooms.map((r) => [`${r.x},${r.y}`, r]));
  const edgeBetween = (a: number, b: number): GenEdge | undefined =>
    d.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const lines: string[] = [];

  for (let y = 0; y < height; y++) {
    let row = '';
    let below = '';
    for (let x = 0; x < width; x++) {
      const room = at.get(`${x},${y}`);
      if (room) {
        const item = room.pickup ? PICKUP[room.pickup.kind]! : ' ';
        const flag = room.pickup && room.pickup.needs.length > 0 ? '!' : ' ';
        row += `[${ROLE[room.role]}${item}${flag}]`;
      } else {
        row += '     ';
      }
      const right = at.get(`${x + 1},${y}`);
      const side = room && right ? edgeBetween(room.id, right.id) : undefined;
      row += side ? across(side.gate, side.a === room!.id) : '   ';
      const under = at.get(`${x},${y + 1}`);
      const drop = room && under ? edgeBetween(room.id, under.id) : undefined;
      below += ` ${drop ? down(drop.gate, drop.a === room!.id) : '   '} ` + '   ';
    }
    lines.push(row.trimEnd());
    if (y < height - 1) lines.push(below.trimEnd());
  }
  return lines.join('\n');
}

function gateWords(gate: Gate): string {
  switch (gate.type) {
    case 'open': return 'open';
    case 'key': return 'small-key door';
    case 'bosskey': return 'boss door';
    case 'fight': return gate.needs.length > 0 ? `fight needing ${gate.needs.map((a) => ARTIFACT_NAME[a]).join(' + ')}` : 'fight';
    case 'artifact': return `needs ${gate.needs.map((a) => ARTIFACT_NAME[a]).join(' + ')}`;
    case 'oneway': return 'one-way';
    case 'shortcut': return 'shortcut';
  }
}

/** Header, map and unlock order for one dungeon. */
export function describeDungeon(d: GenDungeon): string {
  const { spec, metrics: m } = d;
  const priors = spec.priors.length > 0 ? spec.priors.map((a) => ARTIFACT_NAME[a]).join(', ') : 'none';
  const head = [
    `Dungeon ${spec.position} of 8   seed "${spec.seed}"`,
    `Artifact found here: ${ARTIFACT_NAME[spec.artifact]} (${LETTER[spec.artifact]})   Requires from earlier: ${priors}`,
    `${m.rooms} rooms, ${m.width}x${m.height} screens, ${m.loops} loop${m.loops === 1 ? '' : 's'}, ${m.smallKeys} small key${m.smallKeys === 1 ? '' : 's'}, `
      + `${Math.round(m.combatShare * 100)}% combat   explorer walk ${m.walk} moves (${m.backtrack.toFixed(1)} per room)   `
      + `solver: ${d.solve.states} states, no softlock   built on attempt ${d.attempts}`,
  ];
  const order = d.regions.map((r) => {
    const from = r.parent < 0 ? '' : ` from region ${r.parent} via ${gateWords(r.gate)}`;
    return `  ${r.id}. ${r.kind}, ${r.size} room${r.size === 1 ? '' : 's'}${from}`;
  });
  return [...head, '', drawMap(d), '', 'Unlock order:', ...order].join('\n');
}

export function describeRun(plan: RunPlan): string {
  const rows = plan.dungeons.map((d) => {
    const priors = d.priors.length > 0 ? d.priors.map((a) => ARTIFACT_NAME[a]).join(', ') : 'none';
    return `  ${d.position}. ${ARTIFACT_NAME[d.artifact].padEnd(18)} requires: ${priors}${d.pairings > 0 ? `   (${d.pairings} pairing room${d.pairings === 1 ? '' : 's'})` : ''}`;
  });
  return [`Run "${plan.seed}"`, ...rows].join('\n');
}
