import { Actor, EventTypes, kill, pointerup, exittrigger, Engine } from "excalibur";

export function wire(actor: Actor, engine: Engine): void {
  actor.events.on(EventTypes.Kill, () => {});
  actor.events.on(EventTypes.PointerUp, () => {});
  engine.input.keyboard.on(EventTypes.Press, () => {});
  const name: kill = "kill";
  const names: Array<pointerup | exittrigger> = ["pointerup", "exit"];
  actor.events.emit(name, names.length);
}

export enum MyEvents { Kill = "kill" }
export const mine = MyEvents.Kill; // a user enum: untouched
