import {
  EventTypes,
  kill,
} from "excalibur";
import { Actor } from "excalibur";

export function wire(actor: Actor): void {
  const name: kill = EventTypes.Kill;
  actor.events.on(name, () => {});
}
