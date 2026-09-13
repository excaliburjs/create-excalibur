import { Engine } from "excalibur";

export async function toggleFullscreen(engine: Engine): Promise<void> {
  if (engine.screen.isFullscreen || engine.isFullscreen) {
    await engine.screen.exitFullscreen();
  } else {
    await engine.screen.enterFullscreen();
  }
}
