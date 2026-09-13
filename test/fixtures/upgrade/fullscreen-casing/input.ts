import { Engine } from "excalibur";

export async function toggleFullscreen(engine: Engine): Promise<void> {
  if (engine.screen.isFullScreen || engine.isFullscreen) {
    await engine.screen.exitFullScreen();
  } else {
    await engine.screen.goFullScreen();
  }
}
