/** The Game Boy Advance screen. Everything is authored for this size. */
export const SCREEN_W = 240;
export const SCREEN_H = 160;

/** Tile size in pixels. A one-screen room is 15 x 10 tiles. */
export const TILE = 16;
export const ROOM_COLS = SCREEN_W / TILE;
export const ROOM_ROWS = SCREEN_H / TILE;

/** Game logic always advances in 1/60 s steps, whatever the display rate. */
export const STEPS_PER_SECOND = 60;
export const STEP_MS = 1000 / STEPS_PER_SECOND;
