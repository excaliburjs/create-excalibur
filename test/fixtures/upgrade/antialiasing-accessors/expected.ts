import { Engine } from "excalibur";

export function crisp(engine: Engine): void {
  const current = engine.screen.antialiasing;
  engine.screen.antialiasing = !current;
}
