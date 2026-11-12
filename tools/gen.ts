/**
 * Print generated dungeons as text maps.
 *
 *   npm run gen -- --seed aliud               the whole run: plan and 8 dungeons
 *   npm run gen -- --seed aliud --position 4  one dungeon of that run
 *   npm run gen -- --samples 10               ten dungeons from ten different runs
 */
import { LEGEND, describeDungeon, describeRun } from '../src/gen/ascii';
import { generateDungeon } from '../src/gen/generate';
import { planRun } from '../src/gen/runPlan';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const rule = '\n' + '='.repeat(100) + '\n';

const samples = arg('samples');
if (samples) {
  const count = Number(samples);
  const out: string[] = [LEGEND];
  for (let i = 0; i < count; i++) {
    const plan = planRun(`${arg('seed') ?? 'sample'}-${i + 1}`);
    // Spread the samples across early, middle and late positions.
    const spec = plan.dungeons[(i * 3) % plan.dungeons.length]!;
    out.push(describeDungeon(generateDungeon(spec)));
  }
  console.log(out.join(rule));
} else {
  const plan = planRun(arg('seed') ?? 'aliud');
  const position = arg('position');
  const specs = position ? plan.dungeons.filter((d) => d.position === Number(position)) : plan.dungeons;
  const out = [describeRun(plan), LEGEND, ...specs.map((s) => describeDungeon(generateDungeon(s)))];
  console.log(out.join(rule));
}
