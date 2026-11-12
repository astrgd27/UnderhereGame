# Underhere: The Fall

A procedurally generated Zelda-like that plays and looks like a Game Boy
Advance game running in the browser. A girl falls into the underworld kingdom
of Aliud, takes up the spear Telios, and clears eight generated dungeons to
face the tyrant worm Akoa.

**Play the latest build:** https://astrgd27.github.io/UnderhereGame/

## Status

Phases 0 to 2 of the v2 design plan are in:

- **Playable:** the combat feel prototype, a hand-made five-room loop with
  placeholder art and no sound.
- **Headless:** the dungeon generator and solver. It is not wired into the
  playable game yet; that is phase 3.

```
       [3 shooters]--[4 mixed arena]
            |              |
[0 start]--[1 rushers]--[2 guard]
```

The start room has two training dummies. Sparks show where on the spear a hit
landed: gold for the tip (1.5x damage), white for the middle, grey for a weak
point-blank hit (0.75x).

## Dungeon generator

```sh
npm run gen -- --seed aliud               # a whole run: plan and 8 dungeons
npm run gen -- --seed aliud --position 4  # one dungeon of that run
npm run gen -- --samples 10               # ten dungeons from ten runs
```

A seed always gives the same run. Generation has five stages, in `src/gen/`:

| Stage | File | What it does |
| --- | --- | --- |
| 1. Run plan | `runPlan.ts` | Shuffles the eight dungeons; picks which earlier artifacts each requires so every artifact is needed again at least twice |
| 2. Dungeon plan | `plan.ts` | Regions in unlock order on a three-act spine: gates, miniboss, artifact, branches the artifact opens, boss |
| 3 and 4. Layout and fill | `layout.ts` | Grows the regions on a grid of screens, adds loops, places keys and treasure, gives rooms roles |
| 5. Solver | `solver.ts`, `metrics.ts` | Explores every reachable situation; rejects softlocks, unneeded artifacts and bad pacing |

`generate.ts` runs stages 2 to 5 and re-rolls with a derived seed until a
candidate passes. Over 10,000 test dungeons it takes 2.5 candidates on
average and 36 at worst.

## Moves

| Move | Input | Notes |
| --- | --- | --- |
| Thrust | Tap A | Tap in rhythm for poke, poke, lunging third hit |
| Charged lunge | Hold A after a thrust until the tip flashes, release | Dashes three tiles and pierces |
| Sweep | A straight after a dodge | Wide, weak, strong knockback |
| Dodge | R (with a direction, or the way she faces) | Two tiles; safe for the first half |
| Brace | Hold L | Halves frontal contact damage; a charging rusher impales itself |

Every combat number lives in `TUNE` in `src/core/hero.ts` and `ENEMY` in
`src/core/enemies.ts`.

## Controls

| GBA button | Keyboard | Gamepad |
| --- | --- | --- |
| D-pad | Arrows or WASD | D-pad or left stick |
| A | Z or J | Right face button |
| B | X or K | Bottom face button |
| L | Shift | Left shoulder |
| R | C or L | Right shoulder |
| Start | Enter | Start |
| Select | Tab | Select |

Touch controls appear automatically on touch devices. Add `?touch=1` to the
URL to show them on a desktop.

## Develop

Requires Node 22.

```sh
npm install
npm run dev        # local server with live reload
npm test           # unit tests
npm run build      # typecheck and production build into dist/
npm run test:e2e   # browser smoke test against the build (needs Chrome)
```

## Layout

| Path | Contents |
| --- | --- |
| `src/core/` | Game rules with no engine dependency: screen fit, fixed 60 Hz step, virtual pad, rooms, collision, hero, enemies, the game step. Runs in Node for tests. |
| `src/gen/` | The dungeon generator and solver. No engine dependency. |
| `src/input/` | Keyboard, gamepad and touch sources that feed the virtual pad |
| `src/game/` | Phaser scenes and placeholder art |
| `tests/unit/` | Vitest tests for `src/core/` |
| `tests/e2e/` | Browser smoke test |
| `tools/` | Command-line tools (`npm run gen`) |

Every push to `main` is tested, built and deployed to GitHub Pages.
