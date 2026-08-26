import { Engine } from "excalibur";

export function crisp(engine: Engine): void {
  const current = engine.getAntialiasing();
  engine.setAntialiasing(!current);
}
