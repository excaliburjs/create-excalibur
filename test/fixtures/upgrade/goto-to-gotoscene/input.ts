import { Engine } from "excalibur";

export function next(engine: Engine): void {
  engine.goto("level2");
}
export class Router { goto(route: string): void {} }
new Router().goto("home"); // user goto — untouched
