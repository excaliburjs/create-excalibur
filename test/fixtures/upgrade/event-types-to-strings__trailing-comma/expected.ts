import {
  } from "excalibur";
import { Actor } from "excalibur";

export function wire(actor: Actor): void {
  const name: "kill" = "kill";
  actor.events.on(name, () => {});
}
