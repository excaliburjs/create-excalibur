import { Actor, EventDispatcher } from "excalibur";

export function link(a: EventDispatcher<Actor>, b: EventDispatcher): void {
  a.wire(b);
  a.unwire(b);
}
