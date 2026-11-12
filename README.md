# Underhere: The Fall

A procedurally generated Zelda-like that plays and looks like a Game Boy
Advance game running in the browser. A girl falls into the underworld kingdom
of Aliud, takes up the spear Telios, and clears eight generated dungeons to
face the tyrant worm Akoa.

**Play the latest build:** https://astrgd27.github.io/UnderhereGame/

## Status

Phase 0 (foundations) of the v2 design plan: one hand-made room, walkable with
keyboard, gamepad or touch, on a 240x160 screen scaled by whole numbers.
All art is placeholder, drawn in code.

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
| `src/core/` | Game rules with no engine dependency: screen fit, fixed 60 Hz step, virtual pad, rooms, collision, hero. Runs in Node for tests. |
| `src/input/` | Keyboard, gamepad and touch sources that feed the virtual pad |
| `src/game/` | Phaser scenes and placeholder art |
| `tests/unit/` | Vitest tests for `src/core/` |
| `tests/e2e/` | Browser smoke test |

Every push to `main` is tested, built and deployed to GitHub Pages.
