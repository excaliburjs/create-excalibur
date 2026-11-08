import { Engine, FrameStats, GifFrame } from "excalibur";

export function report(engine: Engine, stats: FrameStats, frame: GifFrame): number {
  const blend = engine.currentFrameLag / 16;
  const last = engine.stats.prevFrame.elapsed;
  stats.elapsed = engine.currentFrameElapsed;
  const { elapsed: elapsedMs } = stats;
  const { currentFrameElapsed: e, currentFrameLag: currentFrameLagMs } = engine;
  return blend + last + frame.delay + elapsedMs + e + currentFrameLagMs;
}

export class Telemetry {
  elapsedMs = 0; // a user field: untouched
  delayMs = 0;
  tick(engine: Engine): void {
    this.elapsedMs += engine.currentFrameElapsed;
  }
}
