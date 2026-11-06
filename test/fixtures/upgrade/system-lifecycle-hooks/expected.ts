import { System, SystemType, GraphicsSystem, Scene, World } from "excalibur";

export class MovementSystem extends System {
  systemType = SystemType.Update;
  onInitialize(world: World, scene: Scene): void {}
  onUpdate(elapsed: number): void {}
  onPreUpdate(scene: Scene, elapsed: number): void {}
  onPostUpdate(scene: Scene, elapsed: number): void {}
  dispose(): void {} // keeps its name
}
export class LoggingGraphics extends GraphicsSystem {
  onUpdate(elapsed: number): void {
    super.onUpdate(elapsed);
  }
}
export class Ticker {
  update(elapsed: number): void {} // not a System — untouched
}
export function tick(system: MovementSystem, ticker: Ticker): void {
  system.onUpdate(16);
  ticker.update(16);
}
