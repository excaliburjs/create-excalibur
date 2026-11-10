import * as ex from "excalibur";

export function glide(actor: ex.Actor): void {
  actor.actions.easeTo(100, 200, 500);
  actor.actions.easeBy(10, 0, 250);
}
