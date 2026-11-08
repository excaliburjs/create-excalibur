import { Engine, FrameStats, GifFrame } from "excalibur";

export function report(engine: Engine, stats: FrameStats, frame: GifFrame): number {
  const blend = engine.currentFrameLagMs / 16;
  const last = engine.stats.prevFrame.elapsedMs;
  stats.elapsedMs = engine.currentFrameElapsedMs;
  const { elapsedMs } = stats;
  const { currentFrameElapsedMs: e, currentFrameLagMs } = engine;
  return blend + last + frame.delayMs + elapsedMs + e + currentFrameLagMs;
}

export class Telemetry {
  elapsedMs = 0; // a user field: untouched
  delayMs = 0;
  tick(engine: Engine): void {
    this.elapsedMs += engine.currentFrameElapsedMs;
  }
}
