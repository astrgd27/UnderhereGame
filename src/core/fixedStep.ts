import { STEP_MS } from './constants';

/**
 * Turns variable frame times into a whole number of fixed logic steps.
 * Caps catch-up so a long pause (tab in background) does not fast-forward.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    private readonly stepMs = STEP_MS,
    private readonly maxStepsPerFrame = 5,
  ) {}

  /** Returns how many logic steps to run for this frame. */
  advance(deltaMs: number): number {
    if (!(deltaMs > 0)) return 0;
    this.accumulator += deltaMs;
    // Small tolerance so 16.666.. ms frames do not alternate 0 and 2 steps.
    let steps = Math.floor((this.accumulator + 1e-6) / this.stepMs);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * this.stepMs;
    }
    return steps;
  }
}
