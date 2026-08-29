import { Engine } from "excalibur";

export function next(engine: Engine): void {
  engine.goToScene("level2");
}
export class Router { goto(route: string): void {} }
new Router().goto("home"); // user goto — untouched
