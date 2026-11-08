import { System, SystemType, GraphicsSystem, Scene, World } from "excalibur";

export class MovementSystem extends System {
  systemType = SystemType.Update;
  initialize(world: World, scene: Scene): void {}
  update(elapsed: number): void {}
  preupdate(scene: Scene, elapsed: number): void {}
  postupdate(scene: Scene, elapsed: number): void {}
  dispose(): void {} // keeps its name
}
export class LoggingGraphics extends GraphicsSystem {
  update(elapsed: number): void {
    super.update(elapsed);
  }
}
export class Ticker {
  update(elapsed: number): void {} // not a System — untouched
}
export function tick(system: MovementSystem, ticker: Ticker): void {
  system.update(16);
  ticker.update(16);
}
