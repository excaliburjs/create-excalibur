import { Actor, Engine } from "excalibur";

export function wire(actor: Actor, engine: Engine): void {
  actor.events.on("kill", () => {});
  actor.events.on("pointerup", () => {});
  engine.input.keyboard.on("press", () => {});
  const name: "kill" = "kill";
  const names: Array<"pointerup" | "exit"> = ["pointerup", "exit"];
  actor.events.emit(name, names.length);
}

export enum MyEvents { Kill = "kill" }
export const mine = MyEvents.Kill; // a user enum: untouched
